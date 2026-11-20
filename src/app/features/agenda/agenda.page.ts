import { Component, HostListener, computed, effect, inject, signal, untracked } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { DataService } from '../../core/data.service';
import { Transaction, isAdjustment } from '../../core/models';
import { addDays, currentMonth, diffDays, fromIso, monthRange, shiftMonth, toIso, todayIso } from '../../core/dates';
import { MoneyPipe, formatMoney } from '../../shared/money.pipe';
import { UiService } from '../../shared/ui.service';
import { BackButtonService } from '../../shared/back-button.service';
import { openTransactionDialog } from '../transactions/transaction.dialog';
import { openTransactionDetail } from '../transactions/transaction-detail.sheet';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MAX_CHIPS = 3;

type Tone = 'pay' | 'late' | 'inc' | 'done';
interface Item { t: Transaction; tone: Tone; }
interface Day { iso: string; n: number; other: boolean; today: boolean; past: boolean; items: Item[]; }
interface Pop { t: Transaction; x: number; y: number; }

/**
 * Agenda (20/11, só no computador; à imagem da área nova da outra aplicação de gestão de finanças, sem os compromissos):
 * calendário do mês com o que falta pagar (laranja; vermelho se atrasado) e as receitas previstas (verde), resumo do dia e
 * do mês, filtros, clicar num item abre um cartão com "Marcar como paga/recebida" e "Ver detalhes", arrastar um item para
 * outro dia muda a data, e o "+" de cada dia cria um movimento nesse dia.
 */
@Component({
  selector: 'app-agenda-page',
  imports: [MatIconModule, MatTooltipModule, MoneyPipe],
  template: `
    <div class="agenda">
      <header class="top">
        <h1>Agenda</h1>
        <div class="mnav">
          <button type="button" class="arrow" (click)="go(-1)" aria-label="Mês anterior"><mat-icon>chevron_left</mat-icon></button>
          <button type="button" class="mname" (click)="month.set(thisMonth)" title="Ir para o mês atual">{{ monthTitle() }}</button>
          <button type="button" class="arrow" (click)="go(1)" aria-label="Mês seguinte"><mat-icon>chevron_right</mat-icon></button>
        </div>
        <span class="spacer"></span>
        <button type="button" class="new" (click)="newTx()"><mat-icon>add</mat-icon>Novo movimento</button>
      </header>

      <div class="filters">
        <button type="button" class="flt" [class.on]="show().pay" (click)="toggleFilter('pay')" [attr.aria-pressed]="show().pay"><i class="dot pay"></i>Contas a pagar <b>{{ counts().pay }}</b></button>
        <button type="button" class="flt" [class.on]="show().inc" (click)="toggleFilter('inc')" [attr.aria-pressed]="show().inc"><i class="dot inc"></i>Receitas previstas <b>{{ counts().inc }}</b></button>
        <button type="button" class="flt" [class.on]="show().done" (click)="toggleFilter('done')" [attr.aria-pressed]="show().done"><i class="dot done"></i>Concluídos <b>{{ counts().done }}</b></button>
        <span class="spacer"></span>
        <button type="button" class="link" (click)="print()">Imprimir</button>
      </div>

      <section class="summary">
        <div class="card today-card">
          <span class="lbl">Hoje · {{ todayLabel }}</span>
          <b class="big">{{ todayTitle() }}</b>
          <span class="sub" [class.late]="overdue().n">{{ todaySub() }}</span>
        </div>
        <div class="stats">
          <div class="card">
            <span class="lbl">Ainda a pagar em {{ monthName() }}</span>
            <b class="big">{{ monthTotals().pay | money }}</b>
            <span class="sub">{{ monthTotals().payN }} conta{{ monthTotals().payN === 1 ? '' : 's' }} por pagar</span>
          </div>
          <div class="card">
            <span class="lbl">A receber em {{ monthName() }}</span>
            <b class="big">{{ monthTotals().inc | money }}</b>
            <span class="sub">{{ nextIncome() }}</span>
          </div>
        </div>
      </section>

      <section class="cal" [class.busy]="loading()">
        <div class="wk">@for (w of weekdays; track w) { <span>{{ w }}</span> }</div>
        <div class="grid">
          @for (d of days(); track d.iso) {
            <div class="day" [class.other]="d.other" [class.today]="d.today" [class.drop]="dropOn() === d.iso"
                 (dragover)="dragOver($event, d.iso)" (dragleave)="dropOn.set(null)" (drop)="drop($event, d.iso)">
              <div class="dh">
                @if (d.today) { <span class="num now">{{ d.n }}</span><span class="hoje">Hoje</span> } @else { <span class="num">{{ d.n }}</span> }
                <button type="button" class="plus" (click)="newTx(d.iso)" [matTooltip]="'Novo movimento a ' + shortDate(d.iso)" aria-label="Novo movimento neste dia"><mat-icon>add</mat-icon></button>
              </div>
              @for (it of visible(d); track it.t.id) {
                <button type="button" class="chip" [class]="it.tone" draggable="true" (dragstart)="dragStart($event, it.t)" (dragend)="dropOn.set(null)"
                        (click)="openPop($event, it.t)" [class.sel]="pop()?.t?.id === it.t.id">
                  <i class="cdot"></i>
                  <span class="ctext"><strong>{{ it.t.kind === 'income' ? '+' : '' }}{{ short(it.t.amount) }}</strong> {{ it.t.description || catName(it.t) }}</span>
                </button>
              }
              @if (d.items.length > MAX) {
                <button type="button" class="more" (click)="toggleDay(d.iso)">{{ expanded().has(d.iso) ? 'Mostrar menos' : '+' + (d.items.length - MAX) + ' mais' }}</button>
              }
            </div>
          }
        </div>
      </section>
    </div>

    <!-- cartão do item (abre junto ao item; clique fora ou Esc fecha) -->
    @if (pop(); as p) {
      <div class="pop-scrim" (click)="pop.set(null)"></div>
      <div class="pop" [style.left.px]="p.x" [style.top.px]="p.y">
        <div class="pop-top">
          <span class="tag" [class]="toneOf(p.t)">{{ popLabel(p.t) }}</span>
          <button type="button" class="x" (click)="pop.set(null)" aria-label="Fechar"><mat-icon>close</mat-icon></button>
        </div>
        <b class="ptitle">{{ p.t.description || catName(p.t) }}</b>
        <span class="pdate">{{ longDate(p.t.date) }}</span>
        <span class="pacc">{{ accName(p.t) }}</span>
        <b class="pamt">{{ p.t.amount | money }}</b>
        <span class="pstate" [class]="toneOf(p.t)">{{ stateText(p.t) }}</span>
        <div class="pbtns">
          <button type="button" class="pri" [class.undo]="p.t.paid" (click)="togglePaid(p.t)">{{ payLabel(p.t) }}</button>
          <button type="button" class="sec" (click)="details(p.t)">Ver detalhes</button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; padding: 16px 16px 16px 0; }
    .agenda { background: var(--app-card-bg); border-radius: 24px; padding: 28px; }
    .top { display: flex; align-items: center; gap: 24px; }
    h1 { margin: 0; font-size: 28px; font-weight: 600; color: var(--ink); }
    .mnav { display: flex; align-items: center; gap: 2px; }
    .arrow { width: 32px; height: 32px; border: none; background: none; border-radius: 10px; color: var(--ink); display: grid; place-items: center; cursor: pointer; padding: 0; }
    .mname { border: none; background: none; font: inherit; font-size: 18px; font-weight: 500; color: var(--ink); padding: 4px 8px; border-radius: 10px; cursor: pointer; min-width: 170px; }
    @media (hover: hover) { .arrow:hover, .mname:hover { background: var(--app-bg); } }
    .spacer { flex: 1; }
    .new { display: inline-flex; align-items: center; gap: 4px; height: 40px; padding: 0 16px 0 12px; border: none; border-radius: 12px; background: var(--pos); color: #fff; font: inherit; font-size: 16px; font-weight: 600; cursor: pointer; transition: filter .15s; }
    .new mat-icon { font-size: 22px; width: 22px; height: 22px; }
    @media (hover: hover) { .new:hover { filter: brightness(.94); } }
    .filters { display: flex; align-items: center; gap: 10px; margin: 22px 0 22px; }
    .flt { display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line-strong); background: transparent; font: inherit; font-size: 13px; font-weight: 500; color: var(--ink-soft); cursor: pointer; transition: background-color .15s, color .15s; }
    .flt.on { background: var(--app-bg); color: var(--ink); }
    .flt b { font-weight: 500; color: var(--ink-soft); }
    .dot, .cdot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
    .dot.pay { background: #f6a351; } .dot.inc { background: var(--pos); } .dot.done { background: var(--ink-soft); }
    .flt:not(.on) .dot { opacity: .35; }
    .link { border: none; background: none; font: inherit; font-size: 14px; font-weight: 600; color: var(--pos); cursor: pointer; padding: 0; }
    @media (hover: hover) { .link:hover { text-decoration: underline; } }
    .summary { display: flex; flex-direction: column; gap: 20px; margin-bottom: 20px; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .card { display: flex; flex-direction: column; gap: 6px; padding: 24px 20px; border-radius: 20px; background: var(--app-bg); }
    .lbl { font-size: 13px; font-weight: 500; color: var(--ink-2); }
    .big { font-size: 20px; font-weight: 600; color: var(--ink); }
    .sub { font-size: 13px; font-weight: 400; color: var(--ink-soft); }
    .sub.late { color: var(--neg); font-weight: 500; }
    .cal { border-radius: 20px; background: var(--app-bg); overflow: hidden; transition: opacity .2s; }
    .cal.busy { opacity: .7; }
    .wk { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); height: 44px; align-items: center; border-bottom: 1px solid var(--line-strong); }
    .wk span { padding: 0 10px; font-size: 11px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; color: var(--ink-soft); }
    .grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
    .day { min-height: 124px; box-sizing: border-box; padding: 10px; display: flex; flex-direction: column; gap: 5px; min-width: 0; border-right: 1px solid var(--line-strong); border-bottom: 1px solid var(--line-strong); transition: background-color .15s; }
    .day:nth-child(7n) { border-right: none; }
    .grid > .day:nth-last-child(-n + 7) { border-bottom: none; }
    .day.other > * { opacity: .5; }
    .day.today { background: color-mix(in srgb, var(--pos) 9%, transparent); }
    .day.drop { background: color-mix(in srgb, var(--pos) 16%, transparent); box-shadow: inset 0 0 0 2px var(--pos); }
    .dh { display: flex; align-items: center; gap: 6px; height: 24px; margin-bottom: 2px; }
    .num { font-size: 13px; font-weight: 500; color: var(--ink-2); }
    .num.now { width: 24px; height: 24px; border-radius: 50%; background: var(--pos); color: #fff; display: grid; place-items: center; font-weight: 700; }
    .hoje { font-size: 11px; font-weight: 600; color: var(--pos); }
    .plus { margin-left: auto; width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--line-strong); background: var(--app-card-bg); color: var(--ink-2); display: grid; place-items: center; padding: 0; cursor: pointer; opacity: 0; transition: opacity .15s; }
    .plus mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .day:hover .plus, .plus:focus-visible { opacity: 1; }
    .chip { display: flex; align-items: flex-start; gap: 6px; width: 100%; box-sizing: border-box; padding: 4px 8px; border: none; border-radius: 10px; font: inherit; font-size: 12px; font-weight: 400; color: var(--ink); text-align: left; cursor: pointer; transition: filter .15s, box-shadow .15s; }
    .chip .cdot { margin-top: 5px; }
    .ctext { min-width: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 16px; }
    .ctext strong { font-weight: 600; }
    .chip.pay { background: color-mix(in srgb, #f6a351 16%, transparent); } .chip.pay .cdot { background: #f6a351; }
    .chip.late { background: color-mix(in srgb, var(--neg) 13%, transparent); } .chip.late .cdot { background: var(--neg); }
    .chip.inc { background: color-mix(in srgb, var(--pos) 14%, transparent); } .chip.inc .cdot { background: var(--pos); }
    .chip.done { background: color-mix(in srgb, var(--ink-soft) 12%, transparent); color: var(--ink-soft); } .chip.done .cdot { background: var(--ink-soft); }
    .chip.done .ctext { text-decoration: line-through; }
    @media (hover: hover) { .chip:hover { filter: brightness(.96); } }
    .chip.sel { box-shadow: 0 0 0 1.5px #f6a351; } .chip.inc.sel { box-shadow: 0 0 0 1.5px var(--pos); }
    .chip:active { cursor: grabbing; }
    .more { border: none; background: none; padding: 2px 4px; font: inherit; font-size: 11px; font-weight: 600; color: var(--ink-2); text-align: left; cursor: pointer; }
    @media (hover: hover) { .more:hover { color: var(--ink); text-decoration: underline; } }
    /* cartão do item */
    .pop-scrim { position: fixed; inset: 0; z-index: 30; }
    .pop { position: fixed; z-index: 31; width: 340px; box-sizing: border-box; padding: 18px 20px 20px; border-radius: 20px; background: var(--app-card-bg); box-shadow: 0 16px 48px rgba(0,0,0,.22); display: flex; flex-direction: column; gap: 4px; animation: pop .18s cubic-bezier(.2,.8,.2,1); }
    @keyframes pop { from { opacity: 0; transform: translateY(-6px) scale(.98); } to { opacity: 1; transform: none; } }
    .pop-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    .tag { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 10px; background: var(--app-bg); color: var(--ink-2); }
    .tag.pay { background: color-mix(in srgb, #f6a351 18%, transparent); color: #b4610e; }
    .tag.late { background: color-mix(in srgb, var(--neg) 14%, transparent); color: var(--neg); }
    .tag.inc { background: color-mix(in srgb, var(--pos) 14%, transparent); color: var(--pos); }
    .x { width: 28px; height: 28px; border-radius: 50%; border: none; background: var(--app-bg); color: var(--ink); display: grid; place-items: center; cursor: pointer; padding: 0; }
    .x mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .ptitle { font-size: 16px; font-weight: 600; color: var(--ink); }
    .pdate { font-size: 13px; color: var(--ink-2); }
    .pacc { font-size: 12px; color: var(--ink-soft); }
    .pamt { font-size: 22px; font-weight: 700; color: var(--ink); margin-top: 8px; }
    .pstate { font-size: 13px; font-weight: 500; color: var(--ink-2); }
    .pstate.late { color: var(--neg); } .pstate.pay { color: #b4610e; } .pstate.inc { color: var(--pos); }
    .pbtns { display: flex; gap: 10px; margin-top: 14px; }
    .pbtns button { flex: 1; height: 36px; border-radius: 10px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; border: none; white-space: nowrap; }
    .pri { background: var(--pos); color: #fff; } .pri.undo { background: transparent; color: var(--ink); border: 1px solid var(--line-strong) !important; }
    .sec { background: var(--nav-active-bg); color: var(--pos); }
    @media (hover: hover) { .pbtns button:hover { filter: brightness(.95); } }
    /* impressão: só o calendário */
    @media print {
      :host { padding: 0; }
      .agenda { padding: 0; border-radius: 0; }
      .new, .arrow, .filters, .plus, .more, .summary { display: none !important; }
      .day { min-height: 100px; break-inside: avoid; }
    }
  `],
})
export class AgendaPage {
  readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly dialog = inject(MatDialog);
  private readonly sheet = inject(MatBottomSheet);
  private readonly back = inject(BackButtonService);

  readonly MAX = MAX_CHIPS;
  readonly weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  readonly thisMonth = currentMonth();
  readonly today = todayIso();
  readonly todayLabel = `${WEEKDAYS[fromIso(this.today).getDay()]}, ${Number(this.today.slice(8, 10))}`;
  readonly month = signal(this.thisMonth);
  readonly show = signal({ pay: true, inc: true, done: false });
  readonly expanded = signal(new Set<string>());
  readonly pop = signal<Pop | null>(null);
  readonly dropOn = signal<string | null>(null);
  readonly loading = signal(false);
  private readonly txs = signal<Transaction[]>([]);
  private readonly late = signal<Transaction[]>([]);
  private dragId: string | null = null;

  /** Semanas completas (domingo a sábado) que cobrem o mês. */
  readonly range = computed(() => {
    const { start, end } = monthRange(this.month());
    const s = fromIso(start), e = fromIso(end);
    return { start: addDays(start, -s.getDay()), end: addDays(end, 6 - e.getDay()), mStart: start, mEnd: end };
  });

  constructor() {
    effect(() => {
      const r = this.range();
      this.data.version();
      untracked(() => this.load(r.start, r.end));
    });
  }

  private async load(start: string, end: string) {
    const cached = this.data.peekTransactions(start, end);
    if (cached) this.txs.set(cached); else this.loading.set(true);
    try {
      await this.data.generateRecurrences(end);
      const [list, pending] = await Promise.all([this.data.listTransactions(start, end), this.data.listPending('1900-01-01', addDays(this.today, -1))]);
      this.txs.set(list);
      this.late.set(pending.filter((t) => t.kind === 'expense' && !isAdjustment(t)));
    } catch (e) { this.ui.error(e); } finally { this.loading.set(false); }
  }

  // ---------- dados ----------
  private relevant(t: Transaction) { return t.kind !== 'transfer' && !isAdjustment(t); }
  toneOf(t: Transaction): Tone { return t.paid ? 'done' : t.kind === 'income' ? 'inc' : t.date < this.today ? 'late' : 'pay'; }

  readonly days = computed<Day[]>(() => {
    const { start, end, mStart, mEnd } = this.range();
    const f = this.show();
    const by = new Map<string, Item[]>();
    for (const t of this.txs()) {
      if (!this.relevant(t)) continue;
      const tone = this.toneOf(t);
      if (tone === 'done' ? !f.done : tone === 'inc' ? !f.inc : !f.pay) continue;
      (by.get(t.date) ?? by.set(t.date, []).get(t.date)!).push({ t, tone });
    }
    const out: Day[] = [];
    for (let iso = start; iso <= end; iso = addDays(iso, 1)) {
      const items = (by.get(iso) ?? []).sort((a, b) => Number(a.t.paid) - Number(b.t.paid));
      out.push({ iso, n: Number(iso.slice(8, 10)), other: iso < mStart || iso > mEnd, today: iso === this.today, past: iso < this.today, items });
    }
    return out;
  });
  visible(d: Day) { return this.expanded().has(d.iso) ? d.items : d.items.slice(0, MAX_CHIPS); }

  private inMonth() { const { mStart, mEnd } = this.range(); return this.txs().filter((t) => this.relevant(t) && t.date >= mStart && t.date <= mEnd); }
  readonly counts = computed(() => {
    const l = this.inMonth();
    return { pay: l.filter((t) => !t.paid && t.kind === 'expense').length, inc: l.filter((t) => !t.paid && t.kind === 'income').length, done: l.filter((t) => t.paid).length };
  });
  readonly monthTotals = computed(() => {
    const l = this.inMonth().filter((t) => !t.paid);
    const pays = l.filter((t) => t.kind === 'expense'), incs = l.filter((t) => t.kind === 'income');
    return { pay: pays.reduce((s, t) => s + t.amount, 0), payN: pays.length, inc: incs.reduce((s, t) => s + t.amount, 0), incN: incs.length };
  });
  readonly nextIncome = computed(() => {
    const l = this.inMonth().filter((t) => !t.paid && t.kind === 'income').sort((a, b) => a.date.localeCompare(b.date));
    const next = l.find((t) => t.date >= this.today) ?? l[0];
    if (!next) return 'Nada por receber';
    const d = fromIso(next.date);
    return `${next.description || this.catName(next)} · ${WEEKDAYS[d.getDay()]}, ${d.getDate()}`;
  });
  readonly todayItems = computed(() => this.txs().filter((t) => this.relevant(t) && !t.paid && t.date === this.today));
  readonly overdue = computed(() => { const l = this.late(); return { n: l.length, total: l.reduce((s, t) => s + t.amount, 0) }; });
  todayTitle() {
    const l = this.todayItems(), pay = l.filter((t) => t.kind === 'expense').length, inc = l.length - pay;
    const a = `${pay} conta${pay === 1 ? '' : 's'} ${pay === 1 ? 'vence' : 'vencem'} hoje`;
    return inc ? `${a}, ${inc} a receber` : a;
  }
  todaySub() {
    const o = this.overdue();
    if (o.n) return `${o.n} conta${o.n === 1 ? '' : 's'} em atraso (${formatMoney(o.total)})`;
    const l = this.todayItems();
    return l.length ? l.map((t) => t.description || this.catName(t)).join(', ') : 'Nada pendente hoje';
  }

  // ---------- apresentação ----------
  monthTitle() { const [y, m] = this.month().split('-').map(Number); return `${MONTHS[m - 1][0].toUpperCase() + MONTHS[m - 1].slice(1)} de ${y}`; }
  monthName() { return MONTHS[Number(this.month().slice(5, 7)) - 1]; }
  catName(t: Transaction) { return this.data.categoryMap().get(t.category_id ?? '')?.name ?? (t.kind === 'income' ? 'Receita' : 'Despesa'); }
  accName(t: Transaction) { return this.data.accountMap().get(t.account_id)?.name ?? ''; }
  /** "€ 100" sem cêntimos quando são zero, como na outra aplicação */
  short(v: number) { return formatMoney(v).replace(/,00$/, ''); }
  shortDate(iso: string) { return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; }
  longDate(iso: string) { const d = fromIso(iso); const w = WEEKDAYS[d.getDay()]; return `${w[0].toUpperCase() + w.slice(1)}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`; }
  popLabel(t: Transaction) { return t.kind === 'income' ? (t.paid ? 'Receita recebida' : 'Receita prevista') : (t.paid ? 'Conta paga' : 'Conta a pagar'); }
  stateText(t: Transaction) {
    if (t.paid) return t.kind === 'income' ? 'Recebido' : 'Pago';
    const n = diffDays(this.today, t.date);
    if (t.kind === 'income') return n === 0 ? 'Prevista para hoje' : n > 0 ? `Prevista para daqui a ${n} dia${n === 1 ? '' : 's'}` : `Atrasada há ${-n} dia${n === -1 ? '' : 's'}`;
    return n === 0 ? 'Vence hoje' : n > 0 ? `Vence em ${n} dia${n === 1 ? '' : 's'}` : `Atrasada há ${-n} dia${n === -1 ? '' : 's'}`;
  }
  payLabel(t: Transaction) { const inc = t.kind === 'income'; return t.paid ? (inc ? 'Desfazer recebimento' : 'Desfazer pagamento') : (inc ? 'Marcar como recebida' : 'Marcar como paga'); }

  // ---------- ações ----------
  go(d: number) { this.month.update((m) => shiftMonth(m, d)); this.pop.set(null); }
  toggleFilter(k: 'pay' | 'inc' | 'done') { this.show.update((s) => ({ ...s, [k]: !s[k] })); }
  toggleDay(iso: string) { this.expanded.update((s) => { const n = new Set(s); if (n.has(iso)) n.delete(iso); else n.add(iso); return n; }); }
  newTx(date?: string) { openTransactionDialog(this.dialog, date ? { date } : this.month() === this.thisMonth ? {} : { date: this.range().mStart }); }
  print() { window.print(); }

  openPop(ev: MouseEvent, t: Transaction) {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const W = 340, H = 270;
    const x = Math.min(Math.max(12, r.left), window.innerWidth - W - 12);
    const y = r.bottom + 8 + H > window.innerHeight ? Math.max(12, r.top - H - 8) : r.bottom + 8;
    this.pop.set({ t, x, y });
  }
  @HostListener('document:keydown.escape') onEsc() { this.pop.set(null); }
  @HostListener('window:scroll') onScroll() { if (this.pop()) this.pop.set(null); }

  async togglePaid(t: Transaction) {
    const paid = !t.paid;
    this.pop.set(null);
    this.txs.update((l) => l.map((x) => (x.id === t.id ? { ...x, paid } : x)));
    try { await this.data.setPaid(t.id, paid, t); this.ui.notice(`Movimento ${(paid ? '' : 'não ') + (t.kind === 'income' ? 'recebido' : 'pago')}`); }
    catch (e) { this.ui.error(e); }
  }

  async details(t: Transaction) {
    this.pop.set(null);
    const action = await openTransactionDetail(this.dialog, this.sheet, this.back, t);
    if (action === 'duplicate') openTransactionDialog(this.dialog, { prefill: t });
    else if (action === 'delete') await this.remove(t);
  }

  private async remove(t: Transaction) {
    try {
      if (t.recurrence_id) {
        const scope = await this.ui.recurrenceScope('Apagar');
        if (!scope) return;
        if (scope === 'one') await this.data.deleteTransaction(t.id, t); else await this.data.deleteAndFollowing(t);
      } else {
        if (!(await this.ui.confirm('Apagar movimento?', `Tens a certeza que queres apagar o movimento "${t.description || this.catName(t)}"? Esta ação não pode ser anulada.`, 'Apagar movimento'))) return;
        await this.data.deleteTransaction(t.id, t);
      }
      this.ui.notice('Movimento apagado', 'delete', 'del');
    } catch (e) { this.ui.error(e); }
  }

  // ---------- arrastar para outro dia ----------
  dragStart(ev: DragEvent, t: Transaction) { this.dragId = t.id; this.pop.set(null); ev.dataTransfer?.setData('text/plain', t.id); if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'; }
  dragOver(ev: DragEvent, iso: string) { if (!this.dragId) return; ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'; this.dropOn.set(iso); }
  async drop(ev: DragEvent, iso: string) {
    ev.preventDefault();
    this.dropOn.set(null);
    const t = this.txs().find((x) => x.id === this.dragId);
    this.dragId = null;
    if (!t || t.date === iso) return;
    const full: Transaction = { ...t, date: iso };
    try {
      if (t.recurrence_id) {
        const scope = await this.ui.recurrenceScope('Atualizar');
        if (!scope) return;
        if (scope === 'one') await this.data.saveDetached(full); else await this.data.saveAndFollowing(full, t.date);
      } else {
        this.txs.update((l) => l.map((x) => (x.id === t.id ? full : x))); // otimista
        await this.data.saveTransaction(full);
      }
      this.ui.notice(`Movimento passado para ${this.shortDate(iso)}`, 'event');
    } catch (e) { this.ui.error(e); }
  }
}
