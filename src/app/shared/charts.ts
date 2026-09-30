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
            [attr.stroke-width]="active() === s.id ? stroke() + 6 : stroke()"
            [attr.stroke-dasharray]="s.len + ' ' + (circ() - s.len)"
            [attr.stroke-dashoffset]="-s.offset"
            [style.opacity]="active() && active() !== s.id ? 0.35 : 1"
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
        } @else {
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
  `],
})
export class DonutChart {
  readonly slices = input.required<DonutSlice[]>();
  readonly size = input(200);
  readonly stroke = input(28);
  readonly centerLabel = input('Total');
  readonly sliceClick = output<string>();
  readonly active = signal<string | null>(null);

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
  readonly activeSlice = computed(() => this.slices().find((s) => s.id === this.active()) ?? null);
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
    <div class="scroll">
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" [style.min-width.px]="minWidth()" preserveAspectRatio="none" role="img" aria-label="Entradas, saídas e saldo">
        <path [attr.d]="areaPath()" class="area" />
        <path [attr.d]="linePath()" class="line" />
        @for (p of bars(); track $index) {
          <g (mouseenter)="hover.set($index)" (mouseleave)="hover.set(null)">
            <rect [attr.x]="p.x - p.w" [attr.y]="p.yIn" [attr.width]="p.w" [attr.height]="p.hIn" class="in" />
            <rect [attr.x]="p.x" [attr.y]="p.yOut" [attr.width]="p.w" [attr.height]="p.hOut" class="out" />
            <rect [attr.x]="p.x - p.slot / 2" y="0" [attr.width]="p.slot" [attr.height]="H" fill="transparent" />
          </g>
        }
        @if (hover() !== null) {
          <line [attr.x1]="bars()[hover()!].x" [attr.x2]="bars()[hover()!].x" y1="0" [attr.y2]="H" class="cursor" />
        }
      </svg>
    </div>
    @if (hover() !== null; as h) {
      <div class="tip">
        <b>{{ points()[hover()!].label }}</b>
        <span class="in">+{{ fmt(points()[hover()!].income) }}</span>
        <span class="out">−{{ fmt(points()[hover()!].expense) }}</span>
        <span>Saldo {{ fmt(points()[hover()!].balance) }}</span>
      </div>
    } @else {
      <div class="tip muted">Passe o rato sobre o gráfico para ver os valores.</div>
    }
  `,
  styles: [`
    :host { display: block; --color-income: #1eb980; --color-expense: #e5484d; }
    .legend { display: flex; gap: 16px; justify-content: flex-end; font-size: 12px; color: var(--mat-sys-on-surface-variant); margin-bottom: 4px; }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; }
    .legend i.area { background: color-mix(in srgb, var(--mat-sys-primary) 25%, transparent); }
    .scroll { overflow-x: auto; }
    svg { width: 100%; height: 220px; display: block; }
    .area { fill: color-mix(in srgb, var(--mat-sys-primary) 10%, transparent); }
    .line { fill: none; stroke: var(--mat-sys-primary); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
    rect.in { fill: var(--color-income); }
    rect.out { fill: var(--color-expense); }
    .cursor { stroke: var(--mat-sys-outline); stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
    .tip { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; margin-top: 6px; min-height: 20px; }
    .tip .in { color: var(--color-income); } .tip .out { color: var(--color-expense); }
    .muted { color: var(--mat-sys-on-surface-variant); }
  `],
})
export class FlowChart {
  readonly points = input.required<FlowPoint[]>();
  readonly hover = signal<number | null>(null);
  readonly W = 1000;
  readonly H = 220;

  readonly minWidth = computed(() => Math.max(0, this.points().length * 18));

  private readonly maxBar = computed(() => Math.max(1, ...this.points().map((p) => Math.max(p.income, p.expense))));
  private readonly balRange = computed(() => {
    const b = this.points().map((p) => p.balance);
    const lo = Math.min(...b), hi = Math.max(...b);
    const pad = Math.max(1, (hi - lo) * 0.15);
    const min = lo - pad, max = hi + pad;
    return { min, max: max === min ? min + 1 : max };
  });

  readonly bars = computed(() => {
    const n = this.points().length;
    if (!n) return [];
    const slot = this.W / n;
    const w = Math.min(14, slot * 0.28);
    const barArea = this.H * 0.45; // barras ocupam a metade inferior
    return this.points().map((p, i) => {
      const x = slot * i + slot / 2;
      const hIn = (p.income / this.maxBar()) * barArea;
      const hOut = (p.expense / this.maxBar()) * barArea;
      return { x, w, slot, hIn, hOut, yIn: this.H - hIn, yOut: this.H - hOut };
    });
  });

  private yBal(v: number) {
    const { min, max } = this.balRange();
    const top = 10, bottom = this.H * 0.6;
    return top + (1 - (v - min) / (max - min)) * (bottom - top);
  }

  readonly linePath = computed(() => {
    const pts = this.points();
    if (!pts.length) return '';
    const slot = this.W / pts.length;
    return pts.map((p, i) => `${i ? 'L' : 'M'}${(slot * i + slot / 2).toFixed(1)},${this.yBal(p.balance).toFixed(1)}`).join(' ');
  });

  readonly areaPath = computed(() => {
    const pts = this.points();
    if (!pts.length) return '';
    const slot = this.W / pts.length;
    const first = slot / 2, last = slot * (pts.length - 1) + slot / 2;
    return `${this.linePath()} L${last.toFixed(1)},${this.H} L${first.toFixed(1)},${this.H} Z`;
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
