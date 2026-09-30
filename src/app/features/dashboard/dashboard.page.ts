import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { DataService } from '../../core/data.service';
import { AuthService } from '../../core/auth.service';
import { Transaction } from '../../core/models';
import { addDays, currentMonth, fromIso, monthRange, todayIso } from '../../core/dates';
import { MoneyPipe } from '../../shared/money.pipe';
import { IconBadge } from '../../shared/icon-badge';
import { MonthNav } from '../../shared/month-nav';
import { DonutChart, DonutSlice } from '../../shared/charts';
import { UiService } from '../../shared/ui.service';
import { TransactionDialog } from '../transactions/transaction.dialog';

const DAY_FMT = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatTooltipModule, MoneyPipe, IconBadge, MonthNav, DonutChart],
  template: `
    <div class="page">
      <div class="card hero">
        <div>
          <div class="muted">{{ greeting() }},</div>
          <h1>{{ firstName() }}</h1>
          <div class="kpis">
            <div><span class="muted">Receita mensal</span><b class="income">{{ totals().income | money }}</b></div>
            <div><span class="muted">Despesa mensal</span><b class="expense">{{ totals().expense | money }}</b></div>
            <div><span class="muted">Resultado</span><b [class.income]="totals().income - totals().expense >= 0" [class.expense]="totals().income - totals().expense < 0">{{ totals().income - totals().expense | money }}</b></div>
          </div>
        </div>
        <div class="actions">
          <app-month-nav [month]="month()" (monthChange)="month.set($event)" />
          <div class="btns">
            <button matButton="outlined" (click)="add('expense')"><mat-icon class="expense">remove_circle</mat-icon>Despesa</button>
            <button matButton="outlined" (click)="add('income')"><mat-icon class="income">add_circle</mat-icon>Entrada</button>
            <button matButton="outlined" (click)="add('transfer')"><mat-icon>swap_horiz</mat-icon>Transferência</button>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="col">
          <div class="card">
            <h2>Maiores gastos do mês</h2>
            @if (topCategories().length) {
              <div class="top">
                <div class="rows list">
                  @for (s of topCategories(); track s.id) {
                    <a class="row clickable" [routerLink]="['/lancamentos']" [queryParams]="{ categoria: s.id, mes: month() }">
                      <app-icon-badge [icon]="s.icon" [color]="s.color" [size]="34" />
                      <div class="main"><div class="title">{{ s.label }}</div><div class="sub">{{ s.value | money }}</div></div>
                      <div class="amount">{{ pct(s.value) }}</div>
                    </a>
                  }
                </div>
                <div class="donut"><app-donut-chart [slices]="slices()" [size]="190" centerLabel="Despesas" /></div>
              </div>
              <div class="link-row"><a matButton routerLink="/relatorios">Ver relatório</a></div>
            } @else {
              <p class="empty">Sem despesas neste mês.</p>
            }
          </div>

        </div>

        <div class="col">
          <div class="card">
            <div class="total">
              <span class="muted">Saldo geral</span>
              <b [class.expense]="data.totalBalance() < 0">{{ data.totalBalance() | money }}</b>
            </div>
            <h2>Minhas contas</h2>
            <div class="rows">
              @for (a of data.activeAccounts(); track a.id) {
                <a class="row clickable" [routerLink]="['/lancamentos']" [queryParams]="{ conta: a.id }">
                  <app-icon-badge [icon]="a.icon" [color]="a.color" />
                  <div class="main"><div class="title">{{ a.name }}</div></div>
                  <div class="amount acc" [class.expense]="balance(a.id) < 0">{{ balance(a.id) | money }}</div>
                </a>
              } @empty {
                <p class="empty">Sem contas. <a routerLink="/contas">Criar a primeira</a></p>
              }
            </div>
            <div class="link-row"><a matButton routerLink="/contas">Gerir contas</a></div>
          </div>

          <div class="card">
            <h2>Próximos movimentos por pagar</h2>
            @if (pending().length) {
              <div class="rows">
                @for (t of pending(); track t.id) {
                  <div class="row clickable" (click)="edit(t)">
                    <app-icon-badge [icon]="t.kind === 'income' ? 'call_received' : 'call_made'" [color]="t.kind === 'income' ? '#1eb980' : '#e5484d'" [size]="34" />
                    <div class="main">
                      <div class="title">{{ t.description || (t.kind === 'income' ? 'Receita' : 'Despesa') }}</div>
                      <div class="sub">{{ fmtDay(t.date) }} @if (t.date < today) { <span class="expense">· em atraso</span> }</div>
                    </div>
                    <div class="amount" [class]="t.kind">{{ (t.kind === 'income' ? 1 : -1) * t.amount | money:'signed' }}</div>
                    <button matIconButton (click)="pay(t, $event)" [matTooltip]="t.kind === 'income' ? 'Marcar como recebido' : 'Marcar como pago'"><mat-icon>check_circle</mat-icon></button>
                  </div>
                }
              </div>
            } @else {
              <p class="empty">Nada por pagar nos próximos 30 dias.</p>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .hero { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
    .hero h1 { margin: 0 0 12px; font-size: 22px; font-weight: 500; }
    .kpis { display: flex; gap: 24px; flex-wrap: wrap; }
    .kpis div { display: flex; flex-direction: column; font-size: 13px; }
    .kpis b { font-size: 20px; }
    .actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .btns { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    @media (max-width: 700px) { .actions { align-items: stretch; width: 100%; min-width: 0; } .btns button { flex: 1 1 auto; } }
    .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .top { display: flex; gap: 16px; align-items: center; }
    .top .list { flex: 1; min-width: 0; }
    @media (max-width: 520px) { .top { flex-direction: column-reverse; } .top .list { width: 100%; } }
    a.row { text-decoration: none; color: inherit; }
    .link-row { display: flex; justify-content: flex-end; margin-top: 8px; }
    .total { display: flex; flex-direction: column; border-left: 4px solid var(--mat-sys-primary); padding-left: 12px; margin-bottom: 16px; }
    .total b { font-size: 26px; }
    .amount.acc { color: var(--mat-sys-primary); }
    .empty a { color: var(--mat-sys-primary); }
  `],
})
export class DashboardPage {
  readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly ui = inject(UiService);
  private readonly dialog = inject(MatDialog);

  readonly month = signal(currentMonth());
  readonly today = todayIso();
  private readonly txs = signal<Transaction[]>([]);
  readonly pending = signal<Transaction[]>([]);

  readonly totals = computed(() => {
    let income = 0, expense = 0;
    for (const t of this.txs()) { if (t.kind === 'income') income += t.amount; else if (t.kind === 'expense') expense += t.amount; }
    return { income, expense };
  });

  readonly byCategory = computed(() => {
    const m = new Map<string, number>();
    for (const t of this.txs()) if (t.kind === 'expense') { const id = this.data.rootOf(t.category_id)?.id ?? ''; m.set(id, (m.get(id) ?? 0) + t.amount); }
    return m;
  });

  readonly slices = computed<(DonutSlice & { icon: string })[]>(() =>
    [...this.byCategory().entries()]
      .map(([id, value]) => {
        const c = this.data.categoryMap().get(id);
        return { id: id || 'none', label: c?.name ?? 'Sem categoria', value, color: c?.color ?? '#90a4ae', icon: c?.icon ?? 'label' };
      })
      .sort((a, b) => b.value - a.value),
  );
  readonly topCategories = computed(() => this.slices().slice(0, 5));

  constructor() {
    effect(() => {
      const month = this.month();
      this.data.version();
      untracked(() => this.load(month));
    });
  }

  private async load(month: string) {
    try {
      const { start, end } = monthRange(month);
      const [txs, pending] = await Promise.all([
        this.data.listTransactions(start, end),
        this.data.listPending('1900-01-01', addDays(this.today, 30)),
      ]);
      this.txs.set(txs);
      this.pending.set(pending.filter((t) => t.kind !== 'transfer').slice(0, 8));
    } catch (e) { this.ui.error(e); }
  }

  greeting() { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite'; }
  firstName() {
    const name = this.data.displayName() || this.auth.displayName();
    return name.includes('@') ? name.split('@')[0] : name.split(' ')[0] || 'Olá';
  }
  balance(id: string) { return this.data.balances()[id] ?? 0; }
  pct(v: number) { const t = this.totals().expense; return t ? (100 * v / t).toFixed(2).replace('.', ',') + '%' : ''; }
  fmtDay(iso: string) { return DAY_FMT.format(fromIso(iso)); }

  add(kind: 'expense' | 'income' | 'transfer') { this.dialog.open(TransactionDialog, { width: '520px', maxWidth: '96vw', data: { kind } }); }
  edit(t: Transaction) { this.dialog.open(TransactionDialog, { width: '520px', maxWidth: '96vw', data: { transaction: t } }); }
  async pay(t: Transaction, ev: Event) {
    ev.stopPropagation();
    try { await this.data.setPaid(t.id, true); } catch (e) { this.ui.error(e); }
  }
}
