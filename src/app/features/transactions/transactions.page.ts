import { Component, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatBadgeModule } from '@angular/material/badge';
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
  imports: [FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatTooltipModule, MatProgressBarModule, MatBadgeModule, MoneyPipe, IconBadge, MonthNav, SwipeRow],
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
        <div class="card filters">
          <mat-form-field class="f" subscriptSizing="dynamic">
            <mat-label>Conta</mat-label>
            <mat-select [ngModel]="accountId()" (ngModelChange)="accountId.set($event)">
              <mat-option [value]="null">Todas</mat-option>
              @for (a of data.accounts(); track a.id) { <mat-option [value]="a.id">{{ a.name }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="f" subscriptSizing="dynamic">
            <mat-label>Tipo</mat-label>
            <mat-select [ngModel]="kind()" (ngModelChange)="kind.set($event)">
              <mat-option [value]="null">Todos</mat-option>
              <mat-option value="expense">Despesas</mat-option>
              <mat-option value="income">Receitas</mat-option>
              <mat-option value="transfer">Transferências</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field class="f" subscriptSizing="dynamic">
            <mat-label>Categoria</mat-label>
            <mat-select [ngModel]="categoryId()" (ngModelChange)="categoryId.set($event)">
              <mat-option [value]="null">Todas</mat-option>
              @for (g of data.categoryGroups(); track g.parent.id) {
                <mat-option [value]="g.parent.id">{{ g.parent.name }}</mat-option>
                @for (c of g.children; track c.id) { <mat-option [value]="c.id"><span class="sub-opt">{{ c.name }}</span></mat-option> }
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="f" subscriptSizing="dynamic">
            <mat-label>Estado</mat-label>
            <mat-select [ngModel]="paidFilter()" (ngModelChange)="paidFilter.set($event)">
              <mat-option [value]="null">Todos</mat-option>
              <mat-option value="paid">Pagos</mat-option>
              <mat-option value="unpaid">Por pagar</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field class="f search" subscriptSizing="dynamic">
            <mat-label>Pesquisar</mat-label>
            <input matInput [ngModel]="search()" (ngModelChange)="search.set($event)" placeholder="descrição, observação…" />
            @if (search()) { <button matIconButton matSuffix (click)="search.set('')"><mat-icon>close</mat-icon></button> }
          </mat-form-field>
          @if (activeFilters()) {
            <button matButton (click)="clearFilters()"><mat-icon>filter_alt_off</mat-icon>Limpar filtros</button>
          }
        </div>
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
    .filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; padding: 12px; }
    .filters .f { width: 160px; }
    .filters .search { width: 220px; }
    @media (max-width: 700px) { .filters .f { width: calc(50% - 5px); } .filters .search { width: 100%; } }
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
    .sub-opt { padding-left: 18px; }
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
  readonly filtersOpen = signal(false);

  private readonly all = signal<Transaction[]>([]);
  private readonly opening = signal<number | null>(null);

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
