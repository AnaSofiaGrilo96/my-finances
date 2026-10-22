import { Component, computed, input, output, signal } from '@angular/core';
import { formatMoney } from './money.pipe';

export interface DonutSlice { id: string; label: string; value: number; color: string; }

/** Gráfico em anel (donut) em SVG puro, com destaque ao passar o rato. */
@Component({
  selector: 'app-donut-chart',
  template: `
    <div class="wrap" [style.width.px]="size()" [style.height.px]="size()">
      <svg [attr.viewBox]="'0 0 ' + size() + ' ' + size()" role="img" [attr.aria-label]="ariaLabel()">
        @if (total() === 0) {
          <circle [attr.cx]="c()" [attr.cy]="c()" [attr.r]="r()" fill="none" stroke="var(--mat-sys-surface-container-highest)" [attr.stroke-width]="stroke()" />
        }
        @for (s of arcs(); track s.id) {
          <circle
            class="arc"
            [attr.cx]="c()" [attr.cy]="c()" [attr.r]="r()"
            fill="none"
            [attr.stroke]="s.color"
            [attr.stroke-width]="cur() === s.id ? stroke() + 8 : stroke()"
            [attr.stroke-dasharray]="s.len + ' ' + (circ() - s.len)"
            [attr.stroke-dashoffset]="-s.offset"
            [style.opacity]="cur() && cur() !== s.id ? 0.35 : 1"
            (mouseenter)="active.set(s.id)" (mouseleave)="active.set(null)"
            (click)="sliceClick.emit(s.id)"
          />
        }
      </svg>
      <div class="center">
        @if (activeSlice(); as a) {
          <div class="lbl">{{ a.label }}</div>
          <div class="val">{{ fmt(a.value) }}</div>
          <div class="pct">{{ pct(a.value) }}</div>
        } @else if (centerLabel()) {
          <div class="lbl">{{ centerLabel() }}</div>
          <div class="val">{{ fmt(total()) }}</div>
        }
      </div>
    </div>
  `,
  styles: [`
    .wrap { position: relative; margin: 0 auto; }
    svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .arc { cursor: pointer; transition: stroke-width .15s, opacity .15s; }
    .center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; pointer-events: none; padding: 0 22%; }
    .lbl { font-size: 12px; color: var(--mat-sys-on-surface-variant); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
    .val { font-size: 18px; font-weight: 500; }
    .pct { font-size: 12px; color: var(--mat-sys-on-surface-variant); }
    /* telemóvel (22/10): letra 1–2px mais pequena (gerado a partir dos tamanhos acima) */
    @media (max-width: 899px) { .lbl { font-size: 11px; } .val { font-size: 16px; } .pct { font-size: 11px; } }
  `],
})
export class DonutChart {
  readonly slices = input.required<DonutSlice[]>();
  readonly size = input(200);
  readonly stroke = input(28);
  readonly centerLabel = input('Total'); // '' = anel sem texto ao centro (só aparece ao passar o rato numa fatia)
  readonly sliceClick = output<string>();
  readonly active = signal<string | null>(null);
  /** Fatia realçada de fora (ex.: rato sobre a linha da categoria na lista ao lado). */
  readonly highlight = input<string | null>(null);
  readonly cur = computed(() => this.active() ?? this.highlight());

  readonly c = computed(() => this.size() / 2);
  readonly r = computed(() => this.size() / 2 - this.stroke() / 2 - 4);
  readonly circ = computed(() => 2 * Math.PI * this.r());
  readonly total = computed(() => this.slices().reduce((s, x) => s + x.value, 0));
  readonly arcs = computed(() => {
    const total = this.total();
    if (!total) return [];
    const gap = this.slices().length > 1 ? 2 : 0;
    let offset = 0;
    return this.slices()
      .filter((s) => s.value > 0)
      .map((s) => {
        const len = Math.max(0, (s.value / total) * this.circ() - gap);
        const a = { ...s, len, offset };
        offset += len + gap;
        return a;
      });
  });
  readonly activeSlice = computed(() => this.slices().find((s) => s.id === this.cur()) ?? null);
  readonly ariaLabel = computed(() => this.slices().map((s) => `${s.label}: ${formatMoney(s.value)}`).join(', '));

  fmt(v: number) { return formatMoney(v); }
  pct(v: number) { return this.total() ? (100 * v / this.total()).toFixed(1).replace('.', ',') + '%' : ''; }
}

export interface FlowPoint { label: string; income: number; expense: number; balance: number; }

/** Barras (entradas/saídas) + área do saldo, em SVG puro. */
@Component({
  selector: 'app-flow-chart',
  template: `
    <div class="legend">
      <span><i style="background:var(--color-income)"></i>Entradas</span>
      <span><i style="background:var(--color-expense)"></i>Saídas</span>
      <span><i class="area"></i>Saldo</span>
    </div>
    <!-- O tooltip fica FORA do contentor com scroll (um overflow-x: auto também corta na vertical e criava scroll vertical) -->
    <div class="chart" (mousemove)="move($event)" (mouseleave)="hover.set(null)">
    <div class="scroll">
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" [style.min-width.px]="minWidth()" preserveAspectRatio="none" role="img" aria-label="Entradas, saídas e saldo">
        <path [attr.d]="areaPath()" class="area" />
        <path [attr.d]="linePath()" class="line" />
        @for (p of bars(); track $index) {
          <g (mouseenter)="hover.set($index)">
            @if (p.hIn > 0) { <rect [attr.x]="p.hOut > 0 ? p.x - p.w - 1 : p.x - p.w / 2" [attr.y]="p.yIn" [attr.width]="p.w" [attr.height]="p.hIn" rx="2" class="in" /> }
            @if (p.hOut > 0) { <rect [attr.x]="p.hIn > 0 ? p.x + 1 : p.x - p.w / 2" [attr.y]="p.yOut" [attr.width]="p.w" [attr.height]="p.hOut" rx="2" class="out" /> }
            <rect [attr.x]="p.x - p.slot / 2" y="0" [attr.width]="p.slot" [attr.height]="H" fill="transparent" />
          </g>
        }
        @if (hover() !== null) {
          <line [attr.x1]="bars()[hover()!].x" [attr.x2]="bars()[hover()!].x" y1="0" [attr.y2]="H" class="cursor" />
        }
      </svg>
    </div>
      <!-- Tooltip flutuante junto ao cursor; sobrepõe-se ao cartão sem o esticar -->
      @if (hover() !== null) {
        <div class="tooltip" [class.left]="tipLeft()" [style.left.px]="tipX()">
          <b>{{ points()[hover()!].label }}</b>
          <span><i class="dot in"></i>Entradas <em class="in">{{ fmt(points()[hover()!].income) }}</em></span>
          <span><i class="dot out"></i>Saídas <em class="out">{{ fmt(points()[hover()!].expense) }}</em></span>
          <span><i class="dot bal"></i>Saldo <em>{{ fmt(points()[hover()!].balance) }}</em></span>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; --color-income: #16c64f; --color-expense: #dc2b3d; --area: #e7edf8; --area-line: #c9d6ee; }
    :host-context(html.dark) { --area: color-mix(in srgb, #8fa3f0 16%, transparent); --area-line: color-mix(in srgb, #8fa3f0 40%, transparent); }
    .legend { display: flex; gap: 22px; justify-content: flex-end; font-size: 13.5px; color: var(--mat-sys-on-surface-variant); margin-bottom: 22px; }
    .legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 8px; vertical-align: -1px; }
    .legend i.area { height: 4px; width: 16px; border-radius: 2px; vertical-align: 3px; background: var(--area-line); }
    .chart { position: relative; }
    .scroll { overflow-x: auto; overflow-y: hidden; }
    svg { width: 100%; height: 240px; display: block; overflow: visible; }
    .area { fill: var(--area); }
    .line { fill: none; stroke: var(--area-line); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
    rect.in { fill: var(--color-income); }
    rect.out { fill: var(--color-expense); }
    .cursor { stroke: var(--mat-sys-outline); stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
    .tooltip { position: absolute; pointer-events: none; z-index: 3; display: flex; flex-direction: column; gap: 4px; min-width: 150px; padding: 10px 12px; border-radius: 12px; font-size: 12.5px; line-height: 1.3;
               background: var(--mat-sys-inverse-surface); color: var(--mat-sys-inverse-on-surface); box-shadow: 0 6px 20px rgba(0,0,0,.25); transform: translate(14px, 0); top: 8px; animation: fade-in .12s ease-out; } /* altura fixa no topo: só acompanha o rato na horizontal */
    .tooltip.left { transform: translate(calc(-100% - 14px), 0); }
    .tooltip b { font-size: 13px; margin-bottom: 2px; }
    .tooltip span { display: flex; align-items: center; gap: 6px; }
    .tooltip em { font-style: normal; font-weight: 600; margin-left: auto; padding-left: 12px; font-variant-numeric: tabular-nums; }
    .tooltip em.in { color: #4ad99a; } .tooltip em.out { color: #ff7b80; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .dot.in { background: var(--color-income); } .dot.out { background: var(--color-expense); } .dot.bal { background: var(--area-line); }
  `],
})
export class FlowChart {
  readonly points = input.required<FlowPoint[]>();
  readonly hover = signal<number | null>(null);
  readonly tipX = signal(0);
  readonly tipLeft = signal(false);
  /** Posição do tooltip relativa ao contentor do gráfico; vira para a esquerda perto da margem direita. */
  move(ev: MouseEvent) {
    const box = (ev.currentTarget as HTMLElement).getBoundingClientRect(); // .chart não faz scroll: posição direta
    const x = ev.clientX - box.left;
    this.tipX.set(x); this.tipLeft.set(x > box.width * 0.65);
  }
  readonly W = 1000;
  readonly H = 240;

  readonly minWidth = computed(() => Math.max(0, this.points().length * 18));

  /** Escala comum (22/10, como na outra aplicação): barras e saldo partilham o mesmo eixo, a partir de 0 (ou do saldo mais baixo, se negativo). */
  private readonly scale = computed(() => {
    const pts = this.points();
    const hi = Math.max(1, ...pts.map((p) => Math.max(p.income, p.expense, p.balance)));
    const lo = Math.min(0, ...pts.map((p) => p.balance));
    return { lo, hi: hi + (hi - lo) * 0.08 };
  });
  private y(v: number) { const { lo, hi } = this.scale(); return this.H - ((v - lo) / (hi - lo)) * (this.H - 6); }
  private readonly zeroY = computed(() => this.y(0));

  readonly bars = computed(() => {
    const n = this.points().length;
    if (!n) return [];
    const slot = this.W / n;
    const w = Math.max(3, Math.min(8, slot * 0.22));
    const z = this.zeroY();
    return this.points().map((p, i) => {
      const x = slot * i + slot / 2;
      const yIn = this.y(p.income), yOut = this.y(p.expense);
      return { x, w, slot, hIn: Math.max(0, z - yIn), hOut: Math.max(0, z - yOut), yIn, yOut };
    });
  });

  /** Curva suave do saldo (Catmull-Rom → Bézier), de ponta a ponta. */
  readonly linePath = computed(() => {
    const pts = this.points();
    if (!pts.length) return '';
    const slot = this.W / pts.length;
    const xy = pts.map((p, i) => [i === 0 ? 0 : i === pts.length - 1 ? this.W : slot * i + slot / 2, this.y(p.balance)] as [number, number]);
    if (xy.length === 1) return `M0,${xy[0][1].toFixed(1)} L${this.W},${xy[0][1].toFixed(1)}`;
    let d = `M${xy[0][0].toFixed(1)},${xy[0][1].toFixed(1)}`;
    for (let i = 0; i < xy.length - 1; i++) {
      const p0 = xy[i - 1] ?? xy[i], p1 = xy[i], p2 = xy[i + 1], p3 = xy[i + 2] ?? p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  });

  readonly areaPath = computed(() => {
    if (!this.points().length) return '';
    const z = this.zeroY().toFixed(1);
    return `${this.linePath()} L${this.W},${z} L0,${z} Z`;
  });

  fmt(v: number) { return formatMoney(v); }
}

/** Anel de progresso pequeno (limites de gastos). */
@Component({
  selector: 'app-progress-ring',
  template: `
    <svg [attr.viewBox]="'0 0 ' + size() + ' ' + size()" [style.width.px]="size()" [style.height.px]="size()">
      <circle [attr.cx]="size()/2" [attr.cy]="size()/2" [attr.r]="r()" fill="none" stroke="var(--mat-sys-surface-container-highest)" [attr.stroke-width]="stroke()" />
      <circle [attr.cx]="size()/2" [attr.cy]="size()/2" [attr.r]="r()" fill="none" [attr.stroke]="color()" [attr.stroke-width]="stroke()"
        [attr.stroke-dasharray]="dash() + ' ' + circ()" stroke-linecap="round" transform-origin="center" transform="rotate(-90)" />
    </svg>
  `,
  styles: [`:host { display: inline-flex; }`],
})
export class ProgressRing {
  readonly value = input.required<number>(); // 0..1+ (acima de 1 = ultrapassado)
  readonly size = input(56);
  readonly stroke = input(6);
  readonly r = computed(() => this.size() / 2 - this.stroke() / 2 - 1);
  readonly circ = computed(() => 2 * Math.PI * this.r());
  readonly dash = computed(() => Math.min(1, this.value()) * this.circ());
  readonly color = computed(() => (this.value() >= 1 ? '#e5484d' : this.value() >= 0.75 ? '#f5b301' : '#1eb980'));
}
