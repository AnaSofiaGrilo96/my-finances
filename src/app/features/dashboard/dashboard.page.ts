import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
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
import { ACCOUNT_TYPES, AccountType, Transaction, isAdjustment } from '../../core/models';
import { addDays, currentMonth, fromIso, monthRange, todayIso } from '../../core/dates';
import { MoneyPipe, formatMoney } from '../../shared/money.pipe';
import { IconBadge } from '../../shared/icon-badge';
import { DonutChart, DonutSlice } from '../../shared/charts';
import { UiService } from '../../shared/ui.service';
import { openTransactionDialog } from '../transactions/transaction.dialog';

const DAY_FMT = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });

@Component({
  selector: 'app-dashboard-page',
  imports: [NgTemplateOutlet, RouterLink, MatButtonModule, MatIconModule, MatTooltipModule, MoneyPipe, IconBadge, DonutChart],
  template: `
    <div class="page" [class.wide]="!isSmall()">
      @if (isSmall()) {
        <!-- Saudação (telemóvel) -->
        <div class="greet">
          <div class="muted">{{ greeting() }},</div>
          <h1>{{ firstName() }}</h1>
        </div>
      } @else {
        <!-- Computador: saudação, receita/despesa do mês e ações num só cartão (à imagem da outra aplicação de gestão de finanças, 20/10) -->
        <div class="card hero">
          <div class="hero-left">
            <div class="hello">{{ greeting() }},</div>
            <div class="name">{{ firstName() }}!</div>
            <div class="kpis">
              <div><span>Receita mensal</span><b class="income">{{ totals().income | money }}</b></div>
              <div><span>Despesa mensal</span><b class="expense">{{ totals().expense | money }}</b></div>
              <a class="sq" routerLink="/relatorios" matTooltip="Ver relatórios" aria-label="Ver relatórios"><mat-icon>bar_chart</mat-icon></a>
            </div>
          </div>
          <div class="btns">
            <button type="button" class="act" (click)="add('expense')"><mat-icon class="expense">do_not_disturb_on</mat-icon>Despesa</button>
            <button type="button" class="act" (click)="add('income')"><mat-icon class="income">add_circle</mat-icon>Entrada</button>
            <button type="button" class="act" (click)="add('transfer')"><mat-icon>swap_horiz</mat-icon>Transferência</button>
          </div>
        </div>
      }

      <!-- Aviso: a pagar / a receber hoje (e atrasados) -->
      @if (due().length) {
        <div class="card due" [class.open]="dueOpen()">
          <button type="button" class="due-head" (click)="dueOpen.set(!dueOpen())">
            <span class="due-icon"><mat-icon>notifications_active</mat-icon></span>
            <span class="due-text">
              <b>{{ dueTitle() }}</b>
              <span class="muted">{{ dueSubtitle() }}</span>
            </span>
            <mat-icon class="chev" [class.closed]="!dueOpen()">expand_more</mat-icon>
          </button>
          <div class="collapse" [class.open]="dueOpen()">
            <div class="rows">
              @for (t of due(); track t.id) {
                <div class="row clickable" (click)="edit(t)">
                  <app-icon-badge [icon]="iconOf(t)" [color]="colorOf(t)" [size]="34" />
                  <div class="main">
                    <div class="title">{{ t.description || (t.kind === 'income' ? 'Receita' : 'Despesa') }}</div>
                    <div class="sub">{{ dueLabel(t.date) }} · {{ accName(t) }}</div>
                  </div>
                  <div class="amount" [class]="t.kind">{{ (t.kind === 'income' ? 1 : -1) * t.amount | money:'signed' }}</div>
                  <button matIconButton class="paid" (click)="pay(t, $event)" [matTooltip]="t.kind === 'income' ? 'Não recebido — tocar para marcar recebido' : 'Não pago — tocar para marcar pago'"><mat-icon>thumb_down</mat-icon></button>
                </div>
              }
            </div>
          </div>
        </div>
      } @else if (isSmall()) {
        <div class="card due ok">
          <div class="due-head static">
            <span class="due-icon ok"><mat-icon>task_alt</mat-icon></span>
            <span class="due-text"><b>Nada a pagar ou receber</b><span class="muted">hoje</span></span>
          </div>
        </div>
      }

      <div class="grid-2">
        @if (!isSmall()) {
          <div class="col">
            <div class="card">
              <h2>Maiores gastos do mês atual</h2>
              @if (topCategories().length) {
                <div class="top">
                  <div class="rows lined list">
                    @for (s of topCategories(); track s.id) {
                      <a class="row clickable" [routerLink]="['/movimentos']" [queryParams]="{ categoria: s.id, mes: month() }" [matTooltip]="(s.value | money)" matTooltipPosition="left">
                        <app-icon-badge [icon]="s.icon" [color]="s.color" [size]="32" />
                        <div class="main"><div class="title">{{ s.label }}</div></div>
                        <div class="amount">{{ pct(s.value) }}</div>
                      </a>
                    }
                  </div>
                  <div class="donut">
                    <app-donut-chart [slices]="slices()" [size]="150" [stroke]="34" centerLabel="" />
                    <a class="act ghost" routerLink="/relatorios">Ver relatório</a>
                  </div>
                </div>
              } @else {
                <p class="empty">Sem despesas neste mês.</p>
              }
            </div>

            <div class="card">
              <h2>Contas a pagar</h2>
              @if (pendingPay().length) {
                <ng-container *ngTemplateOutlet="pendingList; context: { $implicit: pendingPay() }" />
              } @else {
                <p class="empty">Nada a pagar nos próximos 30 dias.</p>
              }
            </div>
          </div>
        }

        <div class="col">
          <div class="card accounts">
            <div class="total">
              <span class="muted">Saldo geral</span>
              @if (isSmall()) {
                <b [class.expense]="data.totalBalance() < 0">{{ data.totalBalance() | money }}</b>
              } @else {
                <b [class.expense]="data.totalBalance() < 0"><small>€</small>{{ num(data.totalBalance()) }}</b>
              }
            </div>
            <h2>Minhas contas</h2>
            <div class="rows lined">
              @for (a of data.activeAccounts(); track a.id) {
                <a class="row clickable" [routerLink]="['/movimentos']" [queryParams]="{ conta: a.id }">
                  <app-icon-badge [icon]="a.icon" [color]="a.color" [size]="isSmall() ? 40 : 44" />
                  <div class="main"><div class="title">{{ a.name }}</div><div class="sub">{{ typeLabel(a.type) }}</div></div>
                  <div class="amount acc" [class.expense]="balance(a.id) < 0">{{ balance(a.id) | money }}</div>
                </a>
              } @empty {
                <p class="empty">Sem contas. <a routerLink="/contas">Criar a primeira</a></p>
              }
            </div>
            <div class="link-row"><a matButton="outlined" routerLink="/contas" class="manage"><mat-icon>tune</mat-icon>Gerir contas</a></div>
          </div>

          @if (!isSmall()) {
            <div class="card">
              <h2>Contas a receber</h2>
              @if (pendingRecv().length) {
                <ng-container *ngTemplateOutlet="pendingList; context: { $implicit: pendingRecv() }" />
              } @else {
                <p class="empty">Nada a receber nos próximos 30 dias.</p>
              }
            </div>
          }
        </div>
      </div>
    </div>

    <!-- Lista de movimentos por pagar/receber (de hoje a 30 dias), dividida em "Vence hoje" (inclui atrasados) e "Próximas" -->
    <ng-template #pendingList let-list>
      @if (dueOf(list).length) {
        <div class="band today">Vence hoje</div>
        <div class="rows lined">
          @for (t of dueOf(list); track t.id) { <ng-container *ngTemplateOutlet="pendingRow; context: { $implicit: t }" /> }
        </div>
      }
      @if (nextOf(list).length) {
        <div class="band">Próximas</div>
        <div class="rows lined">
          @for (t of nextOf(list); track t.id) { <ng-container *ngTemplateOutlet="pendingRow; context: { $implicit: t }" /> }
        </div>
      }
    </ng-template>

    <ng-template #pendingRow let-t>
      <div class="row clickable pend" (click)="edit(t)">
        <app-icon-badge [icon]="iconOf(t)" [color]="colorOf(t)" [size]="30" />
        <div class="main">
          <div class="title">{{ t.description || (t.kind === 'income' ? 'Receita' : 'Despesa') }}</div>
          <div class="sub">{{ fmtDay(t.date) }}</div>
        </div>
        <div class="amount" [matTooltip]="accName(t)">{{ t.amount | money }}</div>
        <button matIconButton class="paid" (click)="pay(t, $event)" [matTooltip]="t.kind === 'income' ? 'Não recebido — clicar para marcar recebido' : 'Não pago — clicar para marcar pago'"><mat-icon>thumb_down</mat-icon></button>
      </div>
    </ng-template>
  `,
  styles: [`
    :host { --line: color-mix(in srgb, var(--mat-sys-on-surface) 9%, transparent); --line-strong: #dbded8; --acc-blue: #3062d4; }
    :host-context(html.dark) { --acc-blue: #8fb0ff; --line-strong: var(--mat-sys-outline-variant); }
    .greet { padding: 4px 6px 14px; }
    .paid { color: #e5484d; opacity: .8; }
    .greet h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .due { padding: 6px 8px; margin-bottom: var(--gap); border-left: 4px solid #f5b301; }
    .due.ok { border-left-color: #1eb980; }
    .due-head { display: flex; align-items: center; gap: 12px; width: 100%; background: none; border: none; font: inherit; color: inherit; text-align: left; cursor: pointer; padding: 8px; border-radius: 10px; }
    .due-head.static { cursor: default; }
    @media (hover: hover) { .due-head:not(.static):hover { background: var(--mat-sys-surface-container); } }
    .due-icon { width: 40px; height: 40px; border-radius: 50%; background: color-mix(in srgb, #f5b301 22%, transparent); color: #b17f00; display: grid; place-items: center; flex-shrink: 0; }
    .due-icon.ok { background: color-mix(in srgb, #1eb980 18%, transparent); color: #1eb980; }
    .due-text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .due-text b { font-size: 15px; }
    .due-text .muted { font-size: 13px; }
    .due .rows { padding: 4px 8px 6px; }
    .col { display: flex; flex-direction: column; gap: var(--gap); min-width: 0; }
    a.row { text-decoration: none; color: inherit; }
    .link-row { display: flex; justify-content: flex-end; margin-top: 8px; }
    .total { display: flex; flex-direction: column; border-left: 4px solid var(--mat-sys-primary); padding-left: 12px; margin-bottom: 16px; }
    .total b { font-size: 26px; }
    .amount.acc { color: var(--mat-sys-primary); } .amount.acc.expense { color: #e5484d; } /* saldo negativo a vermelho (a regra .amount.acc ganhava à .expense global) */
    .empty a { color: var(--mat-sys-primary); }
    .band { text-align: center; font-size: 14px; font-weight: 500; padding: 8px; border-radius: 10px; margin: 6px 0 2px; background: var(--mat-sys-surface-container); color: var(--mat-sys-on-surface-variant); }
    .band.today { background: color-mix(in srgb, #e5484d 14%, transparent); color: #e5484d; }
    .top { display: flex; gap: 16px; align-items: center; }
    .top .list { flex: 1; min-width: 0; }
    @media (max-width: 899px) {
      .link-row { justify-content: stretch; } .manage { width: 100%; }
      /* telemóvel (21/10, como na outra aplicação): saudação maior, saldo sem a barra verde, contas com tipo por baixo e saldo a azul */
      .greet { padding: 8px 4px 18px; }
      .greet .muted { font-size: 17px; color: var(--mat-sys-on-surface); }
      .greet h1 { font-size: 22px; font-weight: 700; }
      .card { padding: 20px; border-radius: 12px; }
      .due { border-left: none; padding: 8px; }
      .total { border-left: none; padding-left: 0; padding-bottom: 18px; margin-bottom: 18px; border-bottom: 1px solid var(--line); }
      .total .muted { font-size: 15px; }
      .total b { font-size: 22px; font-weight: 700; }
      .accounts h2 { font-size: 17px; font-weight: 600; margin: 0 0 8px; }
      .accounts .rows.lined > .row + .row { border-top: 1px solid var(--line); }
      .accounts .row { padding: 14px 0; gap: 16px; border-radius: 0; }
      .accounts .row .title { font-size: 16px; }
      .accounts .row .sub { font-size: 14px; }
      .amount.acc { color: var(--acc-blue); font-size: 16px; font-weight: 400; }
    }

    /* ---------- Computador: à imagem da outra aplicação de gestão de finanças (20/10) ---------- */
    .wide .card { padding: 25px; }
    .wide .card h2 { font-size: 18px; font-weight: 600; margin: 0 0 20px; }
    .wide .rows.lined > .row { border-radius: 0; min-height: 0; padding: 12px 4px; }
    .wide .rows.lined > .row + .row { border-top: 1px solid var(--line); }
    @media (hover: hover) { .wide .rows.lined > .row.clickable:hover { background: color-mix(in srgb, var(--mat-sys-on-surface) 4%, transparent); } }
    .wide .rows.lined > .row:active { transform: none; }
    /* cartão de topo: saudação + receita/despesa à esquerda, botões à direita */
    .hero { display: flex; justify-content: space-between; align-items: center; gap: 24px; flex-wrap: wrap; margin-bottom: var(--gap); }
    .wide .hero { padding: 30px; }
    .hello { font-size: 14px; font-weight: 400; color: var(--ink-soft, var(--mat-sys-on-surface-variant)); }
    .name { font-size: 16.5px; font-weight: 600; margin: 4px 0 22px; }
    .kpis { display: flex; gap: 22px; align-items: center; }
    .kpis div { display: flex; flex-direction: column; gap: 6px; }
    .kpis span { font-size: 14px; font-weight: 400; color: var(--ink-soft, var(--mat-sys-on-surface-variant)); }
    .kpis b { font-size: 17px; font-weight: 600; }
    .sq { width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--mat-sys-outline-variant); display: grid; place-items: center; color: var(--mat-sys-on-surface); align-self: center; transition: background-color .15s; }
    @media (hover: hover) { .sq:hover { background: var(--mat-sys-surface-container); } }
    .sq mat-icon { font-size: 19px; width: 19px; height: 19px; }
    .btns { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
    .act { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--line-strong); background: transparent; color: var(--ink, var(--mat-sys-on-surface)); font: inherit; font-size: 16px; font-weight: 600; cursor: pointer; text-decoration: none; transition: background-color .15s, transform .12s; }
    @media (hover: hover) { .act:hover { background: var(--mat-sys-surface-container); } }
    .act:active { transform: scale(.97); }
    .act mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .act.ghost { color: #a0a0a0; font-weight: 500; font-size: 15px; height: 40px; width: 120px; justify-content: center; padding: 0; border-radius: 6px; border-color: var(--line); }
    /* maiores gastos: lista com percentagens + anel e "Ver relatório" por baixo */
    .wide .top { gap: 40px; align-items: flex-start; }
    .wide .top .row .title { font-size: 13.5px; }
    .wide .top .row .amount { font-size: 13.5px; }
    .wide .donut { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 8px 14px 0 0; }
    /* saldo geral + contas */
    .wide .accounts .total { border-left-width: 3px; padding: 2px 0 2px 14px; margin-bottom: 22px; gap: 2px; }
    .wide .accounts .total .muted { font-size: 14px; font-weight: 400; }
    .wide .accounts .total b { font-size: 19px; font-weight: 600; }
    .wide .accounts .total small { font-size: 14px; font-weight: 400; color: var(--ink-soft); margin-right: 6px; }
    .wide .accounts h2 { border-top: 1px solid var(--line); padding-top: 22px; }
    .wide .accounts .row { padding: 18px 4px; gap: 14px; }
    .wide .accounts .row .title { font-size: 16px; font-weight: 500; }
    .wide .accounts .row .sub { font-size: 14px; }
    .wide .amount.acc { color: var(--acc-blue); font-size: 18px; font-weight: 600; }
    .wide .amount.acc.expense { color: #e5484d; }
    /* contas a pagar / a receber */
    .wide .band { font-size: 15px; font-weight: 500; padding: 0; line-height: 35px; border-radius: 6px; margin: 0 0 4px; color: var(--ink-soft); background: color-mix(in srgb, var(--mat-sys-on-surface) 3%, transparent); }
    .wide .band.today { background: color-mix(in srgb, #e5484d 10%, transparent); }
    .wide .rows + .band { margin-top: 14px; }
    .wide .pend { gap: 10px; padding: 9px 4px !important; }
    .wide .pend .title { font-size: 13.5px; }
    .wide .pend .sub { font-size: 12px; }
    .wide .pend .amount { font-size: 13.5px; font-weight: 400; }
    .wide .pend .paid { --mat-icon-button-state-layer-size: 32px; width: 32px; height: 32px; padding: 6px; color: #b8bab5; opacity: 1; } /* polegar cinzento = não pago, como em Movimentos */
    .wide .pend .paid mat-icon { font-size: 18px; width: 18px; height: 18px; }
    @media (hover: hover) { .wide .pend:hover .paid { opacity: .9; } }
    /* telemóvel (22/10): letra 1–2px mais pequena (gerado a partir dos tamanhos acima) */
    @media (max-width: 899px) { .greet h1 { font-size: 20px; } .due-text b { font-size: 13px; } .due-text .muted { font-size: 12px; } .total b { font-size: 20px; } .band { font-size: 13px; } .greet .muted { font-size: 15px; } .total .muted { font-size: 13px; } .accounts h2 { font-size: 15px; } .accounts .row .title { font-size: 14px; } .accounts .row .sub { font-size: 13px; } .amount.acc { font-size: 14px; } .wide .card h2 { font-size: 16px; } .hello { font-size: 13px; } .name { font-size: 14.5px; } .kpis span { font-size: 13px; } .kpis b { font-size: 15px; } .act { font-size: 14px; } .act.ghost { font-size: 13px; } .wide .top .row .title { font-size: 12.5px; } .wide .top .row .amount { font-size: 12.5px; } .wide .accounts .total .muted { font-size: 13px; } .wide .accounts .total b { font-size: 17px; } .wide .accounts .total small { font-size: 13px; } .wide .accounts .row .title { font-size: 14px; } .wide .accounts .row .sub { font-size: 13px; } .wide .amount.acc { font-size: 16px; } .wide .band { font-size: 13px; } .wide .pend .title { font-size: 12.5px; } .wide .pend .sub { font-size: 11px; } .wide .pend .amount { font-size: 12.5px; } }
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
  readonly pendingPay = computed(() => this.pending().filter((t) => t.kind !== 'income').slice(0, 8));
  readonly pendingRecv = computed(() => this.pending().filter((t) => t.kind === 'income').slice(0, 8));
  readonly due = signal<Transaction[]>([]);
  readonly dueOpen = signal(false);

  readonly totals = computed(() => {
    let income = 0, expense = 0;
    for (const t of this.txs()) { if (isAdjustment(t)) continue; if (t.kind === 'income') income += t.amount; else if (t.kind === 'expense') expense += t.amount; }
    return { income, expense };
  });

  readonly byCategory = computed(() => {
    const m = new Map<string, number>();
    for (const t of this.txs()) if (t.kind === 'expense' && !isAdjustment(t)) { const id = this.data.rootOf(t.category_id)?.id ?? ''; m.set(id, (m.get(id) ?? 0) + t.amount); }
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
    return `Hoje: ${parts.join(' · ')}${overdue ? ` · ${overdue} em atraso` : ''}`;
  });

  constructor() {
    effect(() => {
      const month = this.month();
      this.data.version();
      untracked(() => this.load(month));
    });
  }

  private async load(month: string) {
    const { start, end } = monthRange(month);
    // Já lido antes? mostra logo e atualiza por trás (21/10)
    const cTx = this.data.peekTransactions(start, end), cPend = this.data.peekPending('1900-01-01', addDays(this.today, 30));
    if (cTx) this.txs.set(cTx);
    if (cPend) this.applyPending(cPend);
    try {
      await this.data.generateRecurrences(end);
      const [txs, pending] = await Promise.all([
        this.data.listTransactions(start, end),
        this.data.listPending('1900-01-01', addDays(this.today, 30)),
      ]);
      this.txs.set(txs);
      this.applyPending(pending);
    } catch (e) { this.ui.error(e); }
  }

  private applyPending(pending: Transaction[]) {
    const nonTransfer = pending.filter((t) => t.kind !== 'transfer');
    this.due.set(nonTransfer.filter((t) => t.date <= this.today));
    this.pending.set(nonTransfer.filter((t) => t.date >= this.today));
  }

  greeting() { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite'; }
  /** Nome completo definido em "O meu nome"; senão o nome da conta Google; senão a parte do email. */
  firstName() {
    const name = this.data.displayName() || this.auth.displayName();
    return name.includes('@') ? name.split('@')[0] : name || 'Olá';
  }
  typeLabel(t: AccountType) { return ACCOUNT_TYPES.find((x) => x.id === t)?.label ?? ''; }
  /** Valor sem o símbolo (o € aparece à parte, mais pequeno, no saldo geral). */
  num(v: number) { return (v < 0 ? '-' : '') + formatMoney(Math.abs(v)).replace('€', '').trim(); }
  balance(id: string) { return this.data.balances()[id] ?? 0; }
  pct(v: number) { const t = this.totals().expense; return t ? (100 * v / t).toFixed(2).replace('.', ',') + '%' : ''; }
  fmtDay(iso: string) { return DAY_FMT.format(fromIso(iso)); }
  dueLabel(iso: string) { return iso === this.today ? 'Hoje' : `${this.fmtDay(iso)} · em atraso`; }
  accName(t: Transaction) { return this.data.accountMap().get(t.account_id)?.name ?? ''; }
  iconOf(t: Transaction) { return this.data.categoryMap().get(t.category_id ?? '')?.icon ?? (t.kind === 'income' ? 'call_received' : 'call_made'); }
  colorOf(t: Transaction) { return this.data.categoryMap().get(t.category_id ?? '')?.color ?? (t.kind === 'income' ? '#1eb980' : '#e5484d'); }
  dueOf(list: Transaction[]) { return list.filter((t) => t.date <= this.today); }
  nextOf(list: Transaction[]) { return list.filter((t) => t.date > this.today); }

  add(kind: 'expense' | 'income' | 'transfer') { openTransactionDialog(this.dialog, { kind }); }
  edit(t: Transaction) { openTransactionDialog(this.dialog, { transaction: t }); }
  async pay(t: Transaction, ev: Event) {
    ev.stopPropagation();
    // otimista (21/10): sai logo das listas
    this.due.update((l) => l.filter((x) => x.id !== t.id));
    this.pending.update((l) => l.filter((x) => x.id !== t.id));
    try { await this.data.setPaid(t.id, true, t); } catch (e) { this.ui.error(e); }
  }
}
