import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { DataService } from '../../core/data.service';
import { AuthService } from '../../core/auth.service';
import { Transaction } from '../../core/models';
import { addDays, currentMonth, fromIso, monthRange, todayIso } from '../../core/dates';
import { MoneyPipe, formatMoney } from '../../shared/money.pipe';
import { IconBadge } from '../../shared/icon-badge';
import { MonthNav } from '../../shared/month-nav';
import { DonutChart, DonutSlice } from '../../shared/charts';
import { UiService } from '../../shared/ui.service';
import { openTransactionDialog } from '../transactions/transaction.dialog';

const DAY_FMT = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatTooltipModule, MoneyPipe, IconBadge, MonthNav, DonutChart],
  template: `
    <div class="page">
      <!-- Saudação -->
      <div class="greet">
        <div class="muted">{{ greeting() }},</div>
        <h1>{{ firstName() }}</h1>
      </div>

      <!-- Aviso: a pagar / a receber hoje e amanhã (e atrasados) -->
      @if (due().length) {
        <div class="card due" [class.open]="dueOpen()">
          <button type="button" class="due-head" (click)="dueOpen.set(!dueOpen())">
            <span class="due-icon"><mat-icon>notifications_active</mat-icon></span>
            <span class="due-text">
              <b>{{ dueTitle() }}</b>
              <span class="muted">{{ dueSubtitle() }}</span>
            </span>
            <mat-icon>{{ dueOpen() ? 'expand_less' : 'chevron_right' }}</mat-icon>
          </button>
          @if (dueOpen()) {
            <div class="rows">
              @for (t of due(); track t.id) {
                <div class="row clickable" (click)="edit(t)">
                  <app-icon-badge [icon]="t.kind === 'income' ? 'call_received' : 'call_made'" [color]="t.kind === 'income' ? '#1eb980' : '#e5484d'" [size]="34" />
                  <div class="main">
                    <div class="title">{{ t.description || (t.kind === 'income' ? 'Receita' : 'Despesa') }}</div>
                    <div class="sub">{{ dueLabel(t.date) }} · {{ accName(t) }}</div>
                  </div>
                  <div class="amount" [class]="t.kind">{{ (t.kind === 'income' ? 1 : -1) * t.amount | money:'signed' }}</div>
                  <button matIconButton class="paid" (click)="pay(t, $event)" [matTooltip]="t.kind === 'income' ? 'Não recebido — tocar para marcar recebido' : 'Não pago — tocar para marcar pago'"><mat-icon>thumb_down</mat-icon></button>
                </div>
              }
            </div>
          }
        </div>
      } @else if (isSmall()) {
        <div class="card due ok">
          <div class="due-head static">
            <span class="due-icon ok"><mat-icon>task_alt</mat-icon></span>
            <span class="due-text"><b>Nada a pagar ou receber</b><span class="muted">hoje e amanhã</span></span>
          </div>
        </div>
      }

      <!-- Resumo do mês + ações (só no computador) -->
      @if (!isSmall()) {
        <div class="card hero">
          <div class="kpis">
            <div><span class="muted">Receita mensal</span><b class="income">{{ totals().income | money }}</b></div>
            <div><span class="muted">Despesa mensal</span><b class="expense">{{ totals().expense | money }}</b></div>
            <div><span class="muted">Resultado</span><b [class.income]="totals().income - totals().expense >= 0" [class.expense]="totals().income - totals().expense < 0">{{ totals().income - totals().expense | money }}</b></div>
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
      }

      <div class="grid-2">
        @if (!isSmall()) {
          <div class="col">
            <div class="card">
              <h2>Maiores gastos do mês</h2>
              @if (topCategories().length) {
                <div class="top">
                  <div class="rows list">
                    @for (s of topCategories(); track s.id) {
                      <a class="row clickable" [routerLink]="['/movimentos']" [queryParams]="{ categoria: s.id, mes: month() }">
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

            <div class="card">
              <h2>Próximos movimentos por pagar</h2>
              <p class="muted small">Depois de amanhã, nos próximos 30 dias.</p>
              @if (pending().length) {
                <div class="rows">
                  @for (t of pending(); track t.id) {
                    <div class="row clickable" (click)="edit(t)">
                      <app-icon-badge [icon]="t.kind === 'income' ? 'call_received' : 'call_made'" [color]="t.kind === 'income' ? '#1eb980' : '#e5484d'" [size]="34" />
                      <div class="main">
                        <div class="title">{{ t.description || (t.kind === 'income' ? 'Receita' : 'Despesa') }}</div>
                        <div class="sub">{{ fmtDay(t.date) }} · {{ accName(t) }}</div>
                      </div>
                      <div class="amount" [class]="t.kind">{{ (t.kind === 'income' ? 1 : -1) * t.amount | money:'signed' }}</div>
                      <button matIconButton class="paid" (click)="pay(t, $event)" [matTooltip]="t.kind === 'income' ? 'Não recebido — tocar para marcar recebido' : 'Não pago — tocar para marcar pago'"><mat-icon>thumb_down</mat-icon></button>
                    </div>
                  }
                </div>
              } @else {
                <p class="empty">Nada por pagar nos próximos 30 dias.</p>
              }
            </div>
          </div>
        }

        <div class="col">
          <div class="card">
            <div class="total">
              <span class="muted">Saldo geral</span>
              <b [class.expense]="data.totalBalance() < 0">{{ data.totalBalance() | money }}</b>
            </div>
            <h2>Minhas contas</h2>
            <div class="rows">
              @for (a of data.activeAccounts(); track a.id) {
                <a class="row clickable" [routerLink]="['/movimentos']" [queryParams]="{ conta: a.id }">
                  <app-icon-badge [icon]="a.icon" [color]="a.color" />
                  <div class="main"><div class="title">{{ a.name }}</div></div>
                  <div class="amount acc" [class.expense]="balance(a.id) < 0">{{ balance(a.id) | money }}</div>
                </a>
              } @empty {
                <p class="empty">Sem contas. <a routerLink="/contas">Criar a primeira</a></p>
              }
            </div>
            <div class="link-row"><a matButton="outlined" routerLink="/contas" class="manage"><mat-icon>tune</mat-icon>Gerir contas</a></div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .greet { padding: 4px 6px 14px; }
    .paid { color: #e5484d; opacity: .8; }
    .greet h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .due { padding: 6px 8px; margin-bottom: 16px; border-left: 4px solid #f5b301; }
    .due.ok { border-left-color: #1eb980; }
    .due-head { display: flex; align-items: center; gap: 12px; width: 100%; background: none; border: none; font: inherit; color: inherit; text-align: left; cursor: pointer; padding: 8px; border-radius: 10px; }
    .due-head.static { cursor: default; }
    .due-head:not(.static):hover { background: var(--mat-sys-surface-container); }
    .due-icon { width: 40px; height: 40px; border-radius: 50%; background: color-mix(in srgb, #f5b301 22%, transparent); color: #b17f00; display: grid; place-items: center; flex-shrink: 0; }
    .due-icon.ok { background: color-mix(in srgb, #1eb980 18%, transparent); color: #1eb980; }
    .due-text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .due-text b { font-size: 15px; }
    .due-text .muted { font-size: 13px; }
    .due .rows { padding: 4px 8px 6px; }
    .hero { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
    .kpis { display: flex; gap: 24px; flex-wrap: wrap; align-items: center; }
    .kpis div { display: flex; flex-direction: column; font-size: 13px; }
    .kpis b { font-size: 20px; }
    .actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .btns { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .top { display: flex; gap: 16px; align-items: center; }
    .top .list { flex: 1; min-width: 0; }
    a.row { text-decoration: none; color: inherit; }
    .link-row { display: flex; justify-content: flex-end; margin-top: 8px; }
    .total { display: flex; flex-direction: column; border-left: 4px solid var(--mat-sys-primary); padding-left: 12px; margin-bottom: 16px; }
    .total b { font-size: 26px; }
    .amount.acc { color: var(--mat-sys-primary); }
    .empty a { color: var(--mat-sys-primary); }
    .small { font-size: 12.5px; margin: -6px 0 8px; }
    @media (max-width: 899px) { .link-row { justify-content: stretch; } .manage { width: 100%; } }
  `],
})
export class DashboardPage {
  readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly ui = inject(UiService);
  private readonly dialog = inject(MatDialog);
  private readonly bp = inject(BreakpointObserver);

  /** No telemóvel a visão geral mostra só saudação, aviso, saldo geral e contas. */
  readonly isSmall = toSignal(this.bp.observe('(max-width: 899px)').pipe(map((r) => r.matches)), { initialValue: false });

  readonly month = signal(currentMonth());
  readonly today = todayIso();
  readonly tomorrow = addDays(this.today, 1);
  private readonly txs = signal<Transaction[]>([]);
  readonly pending = signal<Transaction[]>([]);
  readonly due = signal<Transaction[]>([]);
  readonly dueOpen = signal(false);

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

  readonly dueTitle = computed(() => {
    const list = this.due();
    const pay = list.filter((t) => t.kind !== 'income').length, recv = list.filter((t) => t.kind === 'income').length;
    const parts = [];
    if (pay) parts.push(`${pay} conta${pay > 1 ? 's' : ''} a pagar`);
    if (recv) parts.push(`${recv} conta${recv > 1 ? 's' : ''} a receber`);
    return `Tens ${parts.join(' e ')}`;
  });
  readonly dueSubtitle = computed(() => {
    const list = this.due();
    const pay = list.filter((t) => t.kind !== 'income').reduce((s, t) => s + t.amount, 0);
    const recv = list.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
    const overdue = list.filter((t) => t.date < this.today).length;
    const parts = [];
    if (pay) parts.push(`a pagar ${formatMoney(pay)}`);
    if (recv) parts.push(`a receber ${formatMoney(recv)}`);
    return `Hoje e amanhã: ${parts.join(' · ')}${overdue ? ` · ${overdue} em atraso` : ''}`;
  });

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
      await this.data.generateRecurrences(end);
      const [txs, pending] = await Promise.all([
        this.data.listTransactions(start, end),
        this.data.listPending('1900-01-01', addDays(this.today, 30)),
      ]);
      this.txs.set(txs);
      const nonTransfer = pending.filter((t) => t.kind !== 'transfer');
      this.due.set(nonTransfer.filter((t) => t.date <= this.tomorrow));
      this.pending.set(nonTransfer.filter((t) => t.date > this.tomorrow).slice(0, 8));
    } catch (e) { this.ui.error(e); }
  }

  greeting() { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite'; }
  /** Nome completo definido em "O meu nome"; senão o nome da conta Google; senão a parte do email. */
  firstName() {
    const name = this.data.displayName() || this.auth.displayName();
    return name.includes('@') ? name.split('@')[0] : name || 'Olá';
  }
  balance(id: string) { return this.data.balances()[id] ?? 0; }
  pct(v: number) { const t = this.totals().expense; return t ? (100 * v / t).toFixed(2).replace('.', ',') + '%' : ''; }
  fmtDay(iso: string) { return DAY_FMT.format(fromIso(iso)); }
  dueLabel(iso: string) { return iso === this.today ? 'Hoje' : iso === this.tomorrow ? 'Amanhã' : `${this.fmtDay(iso)} · em atraso`; }
  accName(t: Transaction) { return this.data.accountMap().get(t.account_id)?.name ?? ''; }

  add(kind: 'expense' | 'income' | 'transfer') { openTransactionDialog(this.dialog, { kind }); }
  edit(t: Transaction) { openTransactionDialog(this.dialog, { transaction: t }); }
  async pay(t: Transaction, ev: Event) {
    ev.stopPropagation();
    try { await this.data.setPaid(t.id, true); } catch (e) { this.ui.error(e); }
  }
}
