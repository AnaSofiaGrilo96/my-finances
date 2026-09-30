import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { DataService } from '../../core/data.service';
import { Transaction, TransactionKind, signFor } from '../../core/models';
import { currentMonth, fromIso, monthRange } from '../../core/dates';
import { MoneyPipe } from '../../shared/money.pipe';
import { IconBadge } from '../../shared/icon-badge';
import { MonthNav } from '../../shared/month-nav';
import { UiService } from '../../shared/ui.service';
import { TransactionDialog } from './transaction.dialog';

interface DayGroup { date: string; label: string; items: Transaction[]; balance: number | null; }

const DAY_FMT = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });

@Component({
  selector: 'app-transactions-page',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatTooltipModule, MatProgressBarModule, MoneyPipe, IconBadge, MonthNav],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Lançamentos</h1>
        <app-month-nav [month]="month()" (monthChange)="setMonth($event)" />
      </div>

      <div class="toolbar filters">
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
        <mat-form-field class="f search" subscriptSizing="dynamic">
          <mat-label>Pesquisar</mat-label>
          <input matInput [ngModel]="search()" (ngModelChange)="search.set($event)" placeholder="descrição, tag…" />
          @if (search()) { <button matIconButton matSuffix (click)="search.set('')"><mat-icon>close</mat-icon></button> }
        </mat-form-field>
        @if (hasFilters()) {
          <button matButton (click)="clearFilters()"><mat-icon>filter_alt_off</mat-icon>Limpar</button>
        }
      </div>

      <div class="summary card">
        <div><span class="muted">Entradas</span><b class="income">{{ totals().income | money }}</b></div>
        <div><span class="muted">Saídas</span><b class="expense">{{ totals().expense | money }}</b></div>
        <div><span class="muted">Resultado</span><b [class.income]="totals().result >= 0" [class.expense]="totals().result < 0">{{ totals().result | money }}</b></div>
      </div>

      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }

      @if (!loading() && !groups().length) {
        <div class="card empty">
          <mat-icon>receipt_long</mat-icon>
          <p>Sem lançamentos {{ hasFilters() ? 'para estes filtros' : 'neste mês' }}.</p>
          <button matButton="filled" (click)="add()"><mat-icon>add</mat-icon>Novo lançamento</button>
        </div>
      }

      @for (g of groups(); track g.date) {
        <section class="day">
          <div class="day-head">
            <span>{{ g.label }}</span>
            @if (g.balance !== null) { <span class="muted">Saldo no dia <b [class.expense]="g.balance < 0">{{ g.balance | money }}</b></span> }
          </div>
          <div class="card rows">
            @for (t of g.items; track t.id) {
              <div class="row clickable" (click)="edit(t)">
                <app-icon-badge [icon]="iconOf(t)" [color]="colorOf(t)" [size]="38" />
                <div class="main">
                  <div class="title">{{ t.description || nameOf(t) }} @if (t.recurrence_id) { <mat-icon class="rep" matTooltip="Repetição">repeat</mat-icon> }</div>
                  <div class="sub">
                    {{ subOf(t) }}
                    @for (tag of t.tags; track tag) { <span class="tag">#{{ tag }}</span> }
                  </div>
                </div>
                <div class="amount" [class]="amountClass(t)">{{ signedAmount(t) | money:'signed' }}</div>
                <button matIconButton class="paid" [class.is-paid]="t.paid" (click)="togglePaid(t, $event)" [matTooltip]="t.paid ? (t.kind === 'income' ? 'Recebido' : 'Pago') : 'Por pagar'">
                  <mat-icon>{{ t.paid ? 'thumb_up' : 'schedule' }}</mat-icon>
                </button>
              </div>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    .filters .f { width: 160px; }
    .filters .search { width: 220px; }
    @media (max-width: 700px) { .filters .f { width: calc(50% - 5px); } .filters .search { width: 100%; } }
    .summary { display: flex; justify-content: space-around; gap: 8px; text-align: center; padding: 12px; margin-bottom: 16px; }
    .summary div { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
    .summary b { font-size: 16px; }
    .day { margin-bottom: 14px; }
    .day-head { display: flex; justify-content: space-between; align-items: baseline; padding: 0 6px 6px; font-size: 13px; font-weight: 500; text-transform: capitalize; }
    .day-head .muted { text-transform: none; font-weight: 400; }
    .rows { padding: 4px 12px; }
    .rep { font-size: 14px; width: 14px; height: 14px; vertical-align: -2px; color: var(--mat-sys-on-surface-variant); }
    .tag { margin-left: 6px; color: var(--mat-sys-primary); }
    .sub-opt { padding-left: 18px; }
    .paid { color: var(--mat-sys-outline); }
    .paid.is-paid { color: #1eb980; }
  `],
})
export class TransactionsPage {
  readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly month = signal(this.route.snapshot.queryParamMap.get('mes') ?? currentMonth());
  readonly accountId = signal<string | null>(this.route.snapshot.queryParamMap.get('conta'));
  readonly kind = signal<TransactionKind | null>((this.route.snapshot.queryParamMap.get('tipo') as TransactionKind) || null);
  readonly categoryId = signal<string | null>(this.route.snapshot.queryParamMap.get('categoria'));
  readonly search = signal('');
  readonly loading = signal(false);

  private readonly all = signal<Transaction[]>([]);
  private readonly opening = signal<number | null>(null);

  readonly hasFilters = computed(() => !!(this.accountId() || this.kind() || this.categoryId() || this.search()));

  readonly filtered = computed(() => {
    const k = this.kind(), c = this.categoryId(), s = this.search().trim().toLowerCase();
    const fam = c ? this.data.categoryFamily(c) : null;
    return this.all().filter((t) =>
      (!k || t.kind === k) &&
      (!fam || (t.category_id !== null && fam.has(t.category_id))) &&
      (!s || t.description.toLowerCase().includes(s) || t.tags.some((x) => x.toLowerCase().includes(s)) || (t.notes ?? '').toLowerCase().includes(s)),
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
    const showBalance = this.opening() !== null && !this.kind() && !this.categoryId() && !this.search();
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
    effect(() => {
      const month = this.month(), acc = this.accountId();
      this.data.version();
      untracked(() => this.load(month, acc));
    });
    effect(() => {
      const q: Record<string, string | null> = { mes: this.month(), conta: this.accountId(), tipo: this.kind(), categoria: this.categoryId() };
      untracked(() => this.router.navigate([], { queryParams: q, replaceUrl: true }));
    });
  }

  private async load(month: string, acc: string | null) {
    this.loading.set(true);
    try {
      const { start, end } = monthRange(month);
      const [list, opening] = await Promise.all([
        this.data.listTransactions(start, end, acc),
        this.data.openingBalance(start, acc, true),
      ]);
      this.all.set(list);
      this.opening.set(opening);
    } catch (e) { this.ui.error(e); } finally { this.loading.set(false); }
  }

  setMonth(m: string) { this.month.set(m); }
  clearFilters() { this.accountId.set(null); this.kind.set(null); this.categoryId.set(null); this.search.set(''); }

  add() { this.dialog.open(TransactionDialog, { width: '520px', maxWidth: '96vw', data: { accountId: this.accountId(), kind: this.kind() ?? 'expense' } }); }
  edit(t: Transaction) { this.dialog.open(TransactionDialog, { width: '520px', maxWidth: '96vw', data: { transaction: t } }); }

  async togglePaid(t: Transaction, ev: Event) {
    ev.stopPropagation();
    try { await this.data.setPaid(t.id, !t.paid); } catch (e) { this.ui.error(e); }
  }

  // ---------- Apresentação ----------
  private cat(t: Transaction) { return t.category_id ? this.data.categoryMap().get(t.category_id) : undefined; }
  private acc(id: string | null) { return id ? this.data.accountMap().get(id) : undefined; }

  iconOf(t: Transaction) { return t.kind === 'transfer' ? 'swap_horiz' : (this.cat(t)?.icon ?? (t.kind === 'income' ? 'more_horiz' : 'label')); }
  colorOf(t: Transaction) { return t.kind === 'transfer' ? '#78909c' : (this.cat(t)?.color ?? (t.kind === 'income' ? '#1de9b6' : '#90a4ae')); }
  nameOf(t: Transaction) { return t.kind === 'transfer' ? 'Transferência' : (this.cat(t)?.name ?? (t.kind === 'income' ? 'Receita' : 'Despesa')); }
  subOf(t: Transaction) {
    if (t.kind === 'transfer') return `${this.acc(t.account_id)?.name ?? '?'} → ${this.acc(t.to_account_id)?.name ?? '?'}`;
    const parts = [this.data.categoryLabel(t.category_id), this.acc(t.account_id)?.name].filter(Boolean);
    return parts.join(' · ');
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
