import { Component, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { DataService } from '../../core/data.service';
import { Transaction, TransactionKind, signFor } from '../../core/models';
import { addDays, currentMonth, fromIso, monthRange, todayIso } from '../../core/dates';
import { MoneyPipe } from '../../shared/money.pipe';
import { IconBadge } from '../../shared/icon-badge';
import { MonthNav } from '../../shared/month-nav';
import { SwipeRow } from '../../shared/swipe-row';
import { UiService } from '../../shared/ui.service';
import { openTransactionDialog } from './transaction.dialog';
import { openTransactionDetail } from './transaction-detail.sheet';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { BackButtonService } from '../../shared/back-button.service';

interface DayGroup { date: string; label: string; items: Transaction[]; balance: number | null; }

const DAY_FMT = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });

@Component({
  selector: 'app-transactions-page',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatTooltipModule, MatProgressBarModule, MatBadgeModule, MatMenuModule, MoneyPipe, IconBadge, MonthNav, SwipeRow],
  template: `
    <div class="page fixed-page">
      <!-- Cabeçalho fixo: roda de meses + filtros (o título só no computador) -->
      <div class="fixed-head"><div class="inner">
        <h1>Movimentos</h1>
        <app-month-nav [month]="month()" (monthChange)="setMonth($event)" />
        <button matIconButton (click)="filtersOpen.set(!filtersOpen())" [matBadge]="activeFilters() || null" matBadgeSize="small" matBadgeColor="primary" matTooltip="Filtros" aria-label="Filtros" [class.on]="filtersOpen()">
          <mat-icon>{{ activeFilters() ? 'filter_alt' : 'filter_list' }}</mat-icon>
        </button>
      </div></div>

      <div class="fixed-body"><div class="inner">
      @if (filtersOpen()) {
        <!-- Barra de filtros em pílulas (à imagem da outra aplicação de gestão de finanças): cada uma abre um menu com ícones -->
        <div class="fbar">
          <div class="pills">
            <button type="button" class="pill" [class.on]="accountId()" [matMenuTriggerFor]="accMenu">
              @if (accSel(); as a) { <app-icon-badge [icon]="a.icon" [color]="a.color" [size]="22" />{{ a.name }} } @else { Conta }
              <mat-icon>expand_more</mat-icon>
            </button>
            <button type="button" class="pill" [class.on]="kind()" [matMenuTriggerFor]="kindMenu">
              @if (kind(); as k) { <mat-icon class="lead" [class]="k">{{ kindIcon(k) }}</mat-icon>{{ kindLabel(k) }} } @else { Tipo }
              <mat-icon>expand_more</mat-icon>
            </button>
            <button type="button" class="pill" [class.on]="categoryId()" [matMenuTriggerFor]="catMenu">
              @if (catSel(); as c) { <app-icon-badge [icon]="c.icon" [color]="c.color" [size]="22" />{{ c.name }} } @else { Categoria }
              <mat-icon>expand_more</mat-icon>
            </button>
            <button type="button" class="pill" [class.on]="paidFilter()" [matMenuTriggerFor]="stateMenu">
              @if (paidFilter(); as p) { <mat-icon class="lead" [class.income]="p === 'paid'">{{ p === 'paid' ? 'thumb_up' : 'thumb_down' }}</mat-icon>{{ p === 'paid' ? 'Pagos' : 'Por pagar' }} } @else { Estado }
              <mat-icon>expand_more</mat-icon>
            </button>
            @if (activeFilters()) { <button type="button" class="pill clear" (click)="clearFilters()"><mat-icon>close</mat-icon>Limpar</button> }
          </div>
          <div class="search" [class.open]="searchOpen() || search()">
            <button type="button" class="sbtn" (click)="toggleSearch()" matTooltip="Pesquisar" aria-label="Pesquisar"><mat-icon>search</mat-icon></button>
            @if (searchOpen() || search()) {
              <input #searchBox type="text" [ngModel]="search()" (ngModelChange)="search.set($event)" placeholder="descrição, observação…" (keydown.escape)="search.set(''); searchOpen.set(false)" />
              <button type="button" class="sbtn" (click)="search.set(''); searchOpen.set(false)" aria-label="Fechar pesquisa"><mat-icon>close</mat-icon></button>
            }
          </div>
        </div>

        <mat-menu #accMenu="matMenu" class="fmenu">
          <button mat-menu-item (click)="accountId.set(null)" [class.sel]="!accountId()"><span class="all">Todas as contas</span></button>
          @for (a of data.accounts(); track a.id) {
            <button mat-menu-item (click)="accountId.set(a.id)" [class.sel]="accountId() === a.id"><app-icon-badge [icon]="a.icon" [color]="a.color" [size]="28" />{{ a.name }}</button>
          }
        </mat-menu>
        <mat-menu #kindMenu="matMenu" class="fmenu">
          <button mat-menu-item (click)="kind.set(null)" [class.sel]="!kind()"><span class="all">Todos os tipos</span></button>
          <button mat-menu-item (click)="kind.set('expense')" [class.sel]="kind() === 'expense'"><mat-icon class="expense">remove_circle</mat-icon>Despesas</button>
          <button mat-menu-item (click)="kind.set('income')" [class.sel]="kind() === 'income'"><mat-icon class="income">add_circle</mat-icon>Receitas</button>
          <button mat-menu-item (click)="kind.set('transfer')" [class.sel]="kind() === 'transfer'"><mat-icon>swap_horiz</mat-icon>Transferências</button>
        </mat-menu>
        <mat-menu #catMenu="matMenu" class="fmenu tall">
          <button mat-menu-item (click)="categoryId.set(null)" [class.sel]="!categoryId()"><span class="all">Todas as categorias</span></button>
          @for (g of data.categoryGroups(); track g.parent.id) {
            <button mat-menu-item (click)="categoryId.set(g.parent.id)" [class.sel]="categoryId() === g.parent.id"><app-icon-badge [icon]="g.parent.icon" [color]="g.parent.color" [size]="28" />{{ g.parent.name }}</button>
            @for (c of g.children; track c.id) {
              <button mat-menu-item class="child" (click)="categoryId.set(c.id)" [class.sel]="categoryId() === c.id"><app-icon-badge [icon]="c.icon" [color]="c.color" [size]="22" />{{ c.name }}</button>
            }
          }
        </mat-menu>
        <mat-menu #stateMenu="matMenu" class="fmenu">
          <button mat-menu-item (click)="paidFilter.set(null)" [class.sel]="!paidFilter()"><span class="all">Todos</span></button>
          <button mat-menu-item (click)="paidFilter.set('paid')" [class.sel]="paidFilter() === 'paid'"><mat-icon class="income">thumb_up</mat-icon>Pagos / recebidos</button>
          <button mat-menu-item (click)="paidFilter.set('unpaid')" [class.sel]="paidFilter() === 'unpaid'"><mat-icon>thumb_down</mat-icon>Por pagar / receber</button>
        </mat-menu>
      }

      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }

      @if (!loading() && !groups().length) {
        <div class="card empty">
          <mat-icon>receipt_long</mat-icon>
          <p>Sem movimentos {{ activeFilters() ? 'para estes filtros' : 'neste mês' }}.</p>
          <button matButton="filled" (click)="add()"><mat-icon>add</mat-icon>Novo movimento</button>
        </div>
      }

      @for (g of groups(); track g.date) {
        <section class="day">
          <div class="day-head">
            <span>{{ g.date === today ? 'Hoje' : g.date === tomorrow ? 'Amanhã' : g.label }}</span>
            @if (g.balance !== null) { <span class="muted">Saldo no dia <b [class.expense]="g.balance < 0">{{ g.balance | money }}</b></span> }
          </div>
          <div class="card rows">
            @for (t of g.items; track t.id) {
              <app-swipe-row [paid]="t.paid" (togglePaid)="togglePaid(t)" (edit)="edit(t)" (remove)="remove(t)" (tapped)="open(t)">
                <div class="row clickable" [class.due]="isDue(t)" [class.unpaid]="!t.paid && !isDue(t)">
                  <app-icon-badge [icon]="iconOf(t)" [color]="colorOf(t)" [size]="38" />
                  <div class="main">
                    <div class="title">
                      {{ t.description || nameOf(t) }}
                      @if (t.recurrence_id) { <mat-icon class="rep" [matTooltip]="t.installment_no ? 'Parcela' : 'Recorrência'">repeat</mat-icon> }
                      @if (t.installment_no) { <span class="chip">{{ t.installment_no }}/{{ installmentsOf(t) }}</span> }
                    </div>
                    <div class="sub">{{ subOf(t) }}</div>
                  </div>
                  <div class="right">
                    <div class="amount" [class]="amountClass(t)">{{ signedAmount(t) | money:'signed' }}</div>
                    <div class="state" [class.is-paid]="t.paid">{{ stateOf(t) }}</div>
                  </div>
                </div>
              </app-swipe-row>
            }
          </div>
        </section>
      }

      <div class="end-space"></div>
      </div></div>

      <!-- Totais: faixa fixa em baixo (quadrada no telemóvel, cartão redondo no computador) -->
      <div class="fixed-foot"><div class="summary inner">
        <div><span class="muted">Entradas</span><b class="income">{{ totals().income | money }}</b></div>
        <div><span class="muted">Saídas</span><b class="expense">{{ totals().expense | money }}</b></div>
        <div><span class="muted">Resultado</span><b [class.income]="totals().result >= 0" [class.expense]="totals().result < 0">{{ totals().result | money }}</b></div>
      </div></div>
    </div>
  `,
  styles: [`
    /* Layout fixo partilhado (.fixed-page/.fixed-head/.fixed-body em styles.scss); aqui só a faixa de totais */
    /* ---- barra de filtros ---- */
    .fbar { display: flex; align-items: center; gap: 8px; margin: 2px 0 12px; }
    .pills { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 6px; border-radius: 999px; background: var(--mat-sys-surface-container); overflow-x: auto; scrollbar-width: none; }
    .pills::-webkit-scrollbar { display: none; }
    .pill { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; border: none; background: none; color: inherit; font: inherit; font-size: 14.5px; padding: 6px 8px 6px 12px; border-radius: 999px; cursor: pointer; white-space: nowrap; transition: background-color .15s, transform .12s; }
    .pill:hover { background: var(--mat-sys-surface-container-high); }
    .pill:active { transform: scale(.97); }
    .pill.on { background: var(--mat-sys-surface-container-lowest); font-weight: 500; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    :host-context(html.dark) .pill.on { background: var(--mat-sys-surface-container-highest); }
    .pill > mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--mat-sys-on-surface-variant); }
    .pill > mat-icon.lead { font-size: 20px; width: 20px; height: 20px; color: inherit; }
    .pill.clear { color: var(--mat-sys-on-surface-variant); padding-left: 8px; } .pill.clear mat-icon { color: inherit; }
    .search { display: flex; align-items: center; flex-shrink: 0; border-radius: 999px; background: var(--mat-sys-surface-container); padding: 2px; transition: width .2s; }
    .search.open { flex: 1; min-width: 0; }
    .sbtn { width: 44px; height: 44px; border-radius: 50%; border: none; background: none; color: var(--mat-sys-on-surface-variant); display: grid; place-items: center; cursor: pointer; flex-shrink: 0; }
    .sbtn:hover { background: var(--mat-sys-surface-container-high); }
    .search input { flex: 1; min-width: 60px; border: none; background: none; outline: none; font: inherit; font-size: 14.5px; color: inherit; }
    @media (max-width: 899px) { .search.open { position: absolute; left: 12px; right: 12px; z-index: 2; } .fbar { position: relative; } }
    /* Totais: no telemóvel é uma faixa quadrada colada à barra de navegação */
    .summary { flex-shrink: 0; display: flex; justify-content: space-around; gap: 8px; text-align: center; padding: 10px 12px calc(74px + env(safe-area-inset-bottom)); background: var(--mat-sys-surface); border-top: 1px solid var(--mat-sys-outline-variant); } /* o fundo prolonga-se por baixo da barra de navegação para não haver falhas */
    :host-context(html.dark) .summary { background: var(--mat-sys-surface-container); }
    .summary div { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
    .summary b { font-size: 16px; }
    @media (min-width: 900px) {
      /* No computador mantém o aspeto de cartão redondo, sempre com folga ao fundo */
      /* .fixed-foot (styles.scss) dá-lhe exatamente a mesma largura do cabeçalho e dos cartões */
      .summary { border: 1px solid color-mix(in srgb, var(--mat-sys-outline-variant) 60%, transparent); border-radius: 18px; background: var(--mat-sys-surface-container-lowest); box-shadow: 0 6px 20px rgba(0,0,0,.08); padding: 10px 12px; }
      :host-context(html.dark) .summary { background: var(--mat-sys-surface-container); }
    }
    .day { margin-bottom: 14px; }
    .day-head { display: flex; justify-content: space-between; align-items: baseline; padding: 0 6px 6px; font-size: 13px; font-weight: 500; text-transform: capitalize; }
    .day-head .muted { text-transform: none; font-weight: 400; }
    .rows { padding: 4px 8px; }
    .row { padding-left: 6px; padding-right: 10px; border-radius: 10px; background: var(--mat-sys-surface-container-lowest); }
    :host-context(html.dark) .row { background: var(--mat-sys-surface-container); }
    app-swipe-row { margin: 2px 0; }
    .state.is-paid { color: #1eb980; }
    .row.due { background: color-mix(in srgb, #f5b301 18%, transparent); }
    .row.due:hover { background: color-mix(in srgb, #f5b301 28%, transparent); }
    /* Modo escuro: o fundo das linhas é mais forte, por isso o amarelo e o hover precisam de regras próprias */
    :host-context(html.dark) .row.clickable:hover { background: var(--mat-sys-surface-container-high); }
    :host-context(html.dark) .row.due { background: color-mix(in srgb, #f5b301 22%, var(--mat-sys-surface-container)); }
    :host-context(html.dark) .row.due:hover { background: color-mix(in srgb, #f5b301 32%, var(--mat-sys-surface-container)); }
    :host-context(html.dark) .row.unpaid:hover { background: var(--mat-sys-surface-container-highest); }
    .row.unpaid .title, .row.unpaid .amount { opacity: .75; }
    .rep { font-size: 14px; width: 14px; height: 14px; vertical-align: -2px; color: var(--mat-sys-on-surface-variant); }
    .chip { font-size: 11px; background: var(--mat-sys-secondary-container); color: var(--mat-sys-on-secondary-container); border-radius: 8px; padding: 1px 6px; margin-left: 4px; vertical-align: 1px; }
    .right { display: flex; flex-direction: column; align-items: flex-end; }
    .state { font-size: 11.5px; color: var(--mat-sys-on-surface-variant); }
  `],
})
export class TransactionsPage implements OnDestroy {
  readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly dialog = inject(MatDialog);
  private readonly sheet = inject(MatBottomSheet);
  private readonly back = inject(BackButtonService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly today = todayIso();
  readonly tomorrow = addDays(this.today, 1);

  readonly month = signal(this.route.snapshot.queryParamMap.get('mes') ?? currentMonth());
  readonly accountId = signal<string | null>(this.route.snapshot.queryParamMap.get('conta'));
  readonly kind = signal<TransactionKind | null>((this.route.snapshot.queryParamMap.get('tipo') as TransactionKind) || null);
  readonly categoryId = signal<string | null>(this.route.snapshot.queryParamMap.get('categoria'));
  readonly paidFilter = signal<'paid' | 'unpaid' | null>(null);
  readonly search = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  readonly loading = signal(false);
  readonly filtersOpen = signal(window.matchMedia('(min-width: 900px)').matches); // no computador a barra está sempre visível
  readonly searchOpen = signal(false);

  private readonly all = signal<Transaction[]>([]);
  private readonly opening = signal<number | null>(null);

  readonly accSel = computed(() => this.accountId() ? this.data.accountMap().get(this.accountId()!) : undefined);
  readonly catSel = computed(() => this.categoryId() ? this.data.categoryMap().get(this.categoryId()!) : undefined);
  kindIcon(k: TransactionKind) { return k === 'expense' ? 'remove_circle' : k === 'income' ? 'add_circle' : 'swap_horiz'; }
  kindLabel(k: TransactionKind) { return k === 'expense' ? 'Despesas' : k === 'income' ? 'Receitas' : 'Transferências'; }
  toggleSearch() { this.searchOpen.update((v) => !v); if (this.searchOpen()) setTimeout(() => (document.querySelector<HTMLInputElement>('.fbar .search input'))?.focus()); }
  readonly activeFilters = computed(() => [this.accountId(), this.kind(), this.categoryId(), this.paidFilter(), this.search()].filter(Boolean).length);

  readonly filtered = computed(() => {
    const k = this.kind(), c = this.categoryId(), s = this.search().trim().toLowerCase(), pf = this.paidFilter();
    const fam = c ? this.data.categoryFamily(c) : null;
    return this.all().filter((t) =>
      (!k || t.kind === k) &&
      (!fam || (t.category_id !== null && fam.has(t.category_id))) &&
      (!pf || (pf === 'paid') === t.paid) &&
      (!s || t.description.toLowerCase().includes(s) || (t.notes ?? '').toLowerCase().includes(s)),
    );
  });

  readonly totals = computed(() => {
    const acc = this.accountId();
    let income = 0, expense = 0;
    for (const t of this.filtered()) {
      const sgn = signFor(t, acc);
      if (sgn > 0) income += t.amount; else if (sgn < 0) expense += t.amount;
    }
    return { income, expense, result: income - expense };
  });

  /** Agrupado por dia. O saldo no dia só é mostrado quando não há filtros que o tornem incoerente. */
  readonly groups = computed<DayGroup[]>(() => {
    const showBalance = this.opening() !== null && !this.kind() && !this.categoryId() && !this.search() && !this.paidFilter();
    const acc = this.accountId();
    const map = new Map<string, Transaction[]>();
    for (const t of this.filtered()) (map.get(t.date) ?? map.set(t.date, []).get(t.date)!).push(t);
    let running = this.opening() ?? 0;
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => {
      if (showBalance) for (const t of items) running += signFor(t, acc) * t.amount;
      return { date, label: DAY_FMT.format(fromIso(date)), items, balance: showBalance ? running : null };
    });
  });

  constructor() {
    document.body.classList.add('has-bottom-bar'); // o FAB sobe para não tapar a barra de totais
    if (this.activeFilters()) this.filtersOpen.set(true);
    effect(() => {
      const month = this.month(), acc = this.accountId();
      this.data.version();
      untracked(() => this.load(month, acc));
    });
    effect(() => {
      const q: Record<string, string | null> = { mes: this.month(), conta: this.accountId(), tipo: this.kind(), categoria: this.categoryId(), q: this.search() || null };
      untracked(() => this.router.navigate([], { queryParams: q, replaceUrl: true }));
    });
  }

  private async load(month: string, acc: string | null) {
    this.loading.set(true);
    try {
      const { start, end } = monthRange(month);
      await this.data.generateRecurrences(end);
      const [list, opening] = await Promise.all([
        this.data.listTransactions(start, end, acc),
        this.data.openingBalance(start, acc, true),
      ]);
      this.all.set(list);
      this.opening.set(opening);
    } catch (e) { this.ui.error(e); } finally { this.loading.set(false); }
  }

  ngOnDestroy() { document.body.classList.remove('has-bottom-bar'); }

  setMonth(m: string) { this.month.set(m); }
  clearFilters() { this.accountId.set(null); this.kind.set(null); this.categoryId.set(null); this.paidFilter.set(null); this.search.set(''); }

  add() { openTransactionDialog(this.dialog, { accountId: this.accountId() ?? undefined, kind: this.kind() ?? 'expense' }); }
  edit(t: Transaction) { openTransactionDialog(this.dialog, { transaction: t }); }

  /** Clicar numa linha abre a folha de detalhe (ver dados + ações); a edição é uma das ações. */
  async open(t: Transaction) {
    const action = await openTransactionDetail(this.dialog, this.sheet, this.back, t);
    if (action === 'edit') this.edit(t);
    else if (action === 'notes') openTransactionDialog(this.dialog, { transaction: t, openNotes: true });
    else if (action === 'duplicate') openTransactionDialog(this.dialog, { prefill: t });
    else if (action === 'toggle') await this.togglePaid(t);
    else if (action === 'delete') await this.remove(t);
  }

  async togglePaid(t: Transaction) {
    try { await this.data.setPaid(t.id, !t.paid); } catch (e) { this.ui.error(e); }
  }

  async remove(t: Transaction) {
    if (t.recurrence_id) {
      const scope = await this.ui.recurrenceScope('Apagar');
      if (!scope) return;
      try { if (scope === 'one') await this.data.deleteTransaction(t.id); else await this.data.deleteAndFollowing(t); } catch (e) { this.ui.error(e); }
      return;
    }
    if (!(await this.ui.confirm('Apagar movimento', `Apagar "${t.description || this.nameOf(t)}" de ${t.amount.toFixed(2).replace('.', ',')} €? Esta ação não pode ser anulada.`, 'Apagar'))) return;
    try { await this.data.deleteTransaction(t.id); } catch (e) { this.ui.error(e); }
  }

  // ---------- Apresentação ----------
  /** Por pagar e com data até hoje (ou em atraso): é o que aparece no aviso do início. */
  isDue(t: Transaction) { return !t.paid && t.date <= this.today; }
  private cat(t: Transaction) { return t.category_id ? this.data.categoryMap().get(t.category_id) : undefined; }
  private acc(id: string | null) { return id ? this.data.accountMap().get(id) : undefined; }
  installmentsOf(t: Transaction) { return this.data.recurrences().find((r) => r.id === t.recurrence_id)?.installments ?? '?'; }

  iconOf(t: Transaction) { return t.kind === 'transfer' ? 'swap_horiz' : (this.cat(t)?.icon ?? (t.kind === 'income' ? 'more_horiz' : 'label')); }
  colorOf(t: Transaction) { return t.kind === 'transfer' ? '#78909c' : (this.cat(t)?.color ?? (t.kind === 'income' ? '#1de9b6' : '#90a4ae')); }
  nameOf(t: Transaction) { return t.kind === 'transfer' ? 'Transferência' : (this.cat(t)?.name ?? (t.kind === 'income' ? 'Receita' : 'Despesa')); }
  subOf(t: Transaction) {
    if (t.kind === 'transfer') return `${this.acc(t.account_id)?.name ?? '?'} → ${this.acc(t.to_account_id)?.name ?? '?'}`;
    return [this.data.categoryLabel(t.category_id), this.acc(t.account_id)?.name].filter(Boolean).join(' · ');
  }
  stateOf(t: Transaction) {
    if (t.kind === 'income') return t.paid ? 'recebido' : 'não recebido';
    return t.paid ? 'pago' : 'não pago';
  }
  signedAmount(t: Transaction) {
    const s = signFor(t, this.accountId());
    return t.kind === 'transfer' && !this.accountId() ? t.amount : s * t.amount;
  }
  amountClass(t: Transaction) {
    const s = signFor(t, this.accountId());
    if (t.kind === 'transfer' && !this.accountId()) return 'transfer';
    return s > 0 ? 'income' : 'expense';
  }
}
