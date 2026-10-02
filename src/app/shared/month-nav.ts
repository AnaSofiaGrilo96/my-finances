import { AfterViewInit, Component, ElementRef, OnDestroy, computed, effect, input, output, signal, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { currentMonth, shiftMonth } from '../core/dates';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SPAN = 24;        // meses/anos para cada lado do selecionado
const ITEM = 124;       // largura de cada item (px) — tem de bater certo com o CSS

interface Item { key: string; label: string; sub: string | null; }

/**
 * Seletor de mês em "roda" horizontal: os meses deslizam debaixo de uma pílula fixa ao centro,
 * acompanhando o dedo (scroll nativo com snap). Setas nas pontas; tocar num mês vizinho vai para ele;
 * tocar no mês selecionado volta ao mês atual. Em modo 'year' navega ano a ano.
 */
@Component({
  selector: 'app-month-nav',
  imports: [MatIconModule],
  template: `
    <div class="wheel" [class.year]="mode() === 'year'">
      <button type="button" class="arrow" (click)="go(-1)" [attr.aria-label]="mode() === 'year' ? 'Ano anterior' : 'Mês anterior'"><mat-icon>chevron_left</mat-icon></button>
      <div class="viewport">
        <span class="pill" aria-hidden="true"></span>
        <div class="track" #track (scroll)="onScroll()">
          @for (it of items(); track it.key) {
            <button type="button" class="item" [class.on]="it.key === month()" (click)="tap(it.key)" [title]="it.key === month() ? ('Ir para ' + (mode() === 'year' ? 'o ano atual' : 'o mês atual')) : ''">
              <span class="lbl">{{ it.label }}</span>
              @if (it.sub) { <small>{{ it.sub }}</small> }
            </button>
          }
        </div>
      </div>
      <button type="button" class="arrow" (click)="go(1)" [attr.aria-label]="mode() === 'year' ? 'Ano seguinte' : 'Mês seguinte'"><mat-icon>chevron_right</mat-icon></button>
    </div>
  `,
  styles: [`
    :host { display: block; user-select: none; }
    .wheel { display: flex; align-items: center; gap: 2px; width: 100%; }
    .arrow { background: none; border: none; color: var(--mat-sys-on-surface-variant); cursor: pointer; padding: 0; width: 36px; height: 40px; border-radius: 999px; display: grid; place-items: center; flex-shrink: 0; transition: background-color .15s; }
    .arrow:hover { background: var(--mat-sys-surface-container-high); }
    .viewport { position: relative; flex: 1; min-width: 0; height: 44px; }
    .pill { position: absolute; left: 50%; top: 2px; width: 124px; height: 40px; transform: translateX(-50%); border-radius: 999px; border: 1.5px solid var(--mat-sys-outline-variant); background: var(--mat-sys-surface-container-lowest); pointer-events: none; }
    :host-context(html.dark) .pill { background: var(--mat-sys-surface-container-high); border-color: color-mix(in srgb, var(--mat-sys-outline) 60%, transparent); }
    .track { position: relative; height: 100%; display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scrollbar-width: none; -webkit-overflow-scrolling: touch; padding: 0 calc(50% - 62px); overscroll-behavior-x: contain; }
    .track::-webkit-scrollbar { display: none; }
    .item { flex: 0 0 124px; width: 124px; scroll-snap-align: center; scroll-snap-stop: always; background: none; border: none; font: inherit; color: var(--mat-sys-on-surface-variant); cursor: pointer; padding: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; white-space: nowrap; transition: color .2s, font-weight .2s, opacity .2s; opacity: .8; }
    .item .lbl { font-size: 15px; }
    .item small { font-size: 11px; margin-top: 2px; }
    .item.on { color: var(--mat-sys-on-surface); font-weight: 600; opacity: 1; }
    .item.on .lbl { font-size: 16px; }
    @media (min-width: 900px) { .wheel { width: 460px; max-width: 100%; } }
  `],
})
export class MonthNav implements AfterViewInit, OnDestroy {
  readonly month = input.required<string>();    // 'YYYY-MM'
  readonly mode = input<'month' | 'year'>('month');
  readonly monthChange = output<string>();
  readonly today = currentMonth();
  readonly todayYear = Number(this.today.slice(0, 4));
  readonly year = computed(() => Number(this.month().slice(0, 4)));

  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');
  /** Mês/ano ao centro da janela de itens; só muda quando o selecionado se afasta das pontas. */
  private readonly center = signal<string>('');
  readonly items = computed<Item[]>(() => {
    const c = this.center() || this.month();
    const step = this.mode() === 'year' ? 12 : 1;
    const list: Item[] = [];
    for (let i = -SPAN; i <= SPAN; i++) {
      const key = shiftMonth(c, i * step);
      const y = Number(key.slice(0, 4));
      if (this.mode() === 'year') list.push({ key, label: String(y), sub: null });
      else list.push({ key, label: MONTHS[Number(key.slice(5, 7)) - 1], sub: y !== this.todayYear ? String(y) : null });
    }
    return list;
  });

  private ready = false;
  private scrollTimer?: ReturnType<typeof setTimeout>;
  private settling = false; // scroll programático a decorrer: ignorar o evento de scroll
  private settleTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const m = this.month(); this.mode();
      if (!this.ready) return;
      const idx = this.indexOf(m);
      // Fora da janela ou perto das pontas: recentrar a janela e saltar sem animação.
      if (idx < 4 || idx > 2 * SPAN - 4) { this.center.set(m); setTimeout(() => this.jumpTo(this.indexOf(m), 'instant')); return; }
      const el = this.track().nativeElement;
      if (Math.round(el.scrollLeft / ITEM) !== idx) this.jumpTo(idx, 'smooth');
    });
  }

  ngAfterViewInit() {
    this.center.set(this.month());
    this.ready = true;
    // Depois do primeiro render da lista de itens
    setTimeout(() => this.jumpTo(this.indexOf(this.month()), 'instant'));
  }
  ngOnDestroy() { clearTimeout(this.scrollTimer); clearTimeout(this.settleTimer); }

  private indexOf(key: string) { return this.items().findIndex((x) => x.key === key); }

  private jumpTo(idx: number, behavior: ScrollBehavior) {
    if (idx < 0) return;
    const el = this.track().nativeElement;
    this.settling = true;
    clearTimeout(this.settleTimer);
    el.scrollTo({ left: idx * ITEM, behavior });
    this.settleTimer = setTimeout(() => { this.settling = false; }, behavior === 'smooth' ? 450 : 80);
  }

  /** Quando o dedo larga e o snap termina, o item ao centro passa a ser o selecionado. */
  onScroll() {
    if (this.settling) return;
    clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => {
      const el = this.track().nativeElement;
      const idx = Math.round(el.scrollLeft / ITEM);
      const it = this.items()[idx];
      if (it && it.key !== this.month()) this.monthChange.emit(it.key);
    }, 90);
  }

  go(d: number) { this.monthChange.emit(shiftMonth(this.month(), this.mode() === 'year' ? 12 * d : d)); }
  tap(key: string) { this.monthChange.emit(key === this.month() ? this.today : key); }
}
