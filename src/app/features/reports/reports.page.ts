import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatBadgeModule } from '@angular/material/badge';
import { DataService } from '../../core/data.service';
import { Account, Transaction, signFor } from '../../core/models';
import { currentMonth, eachDay, fromIso, monthLabel, monthRange, shiftMonth, shortMonthLabel, toIso } from '../../core/dates';
import { MoneyPipe, formatMoney } from '../../shared/money.pipe';
import { IconBadge } from '../../shared/icon-badge';
import { MonthNav } from '../../shared/month-nav';
import { DonutChart, DonutSlice, FlowChart, FlowPoint } from '../../shared/charts';
import { UiService } from '../../shared/ui.service';

type Period = 'month' | 'year' | '12m';
type Granularity = 'daily' | 'weekly' | 'monthly';
interface FlowRow { key: string; label: string; income: number; expense: number; result: number; balance: number; }

const DAY_FMT = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });

@Component({
  selector: 'app-reports-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatTabsModule, MatFormFieldModule, MatSelectModule, MatButtonToggleModule, MatCheckboxModule, MatProgressBarModule, MatTableModule, MatBadgeModule, MoneyPipe, IconBadge, MonthNav, DonutChart, FlowChart],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Relatórios</h1>
        @if (period() === '12m') { <span class="muted range">Últimos 12 meses até {{ monthLabel() }}</span> }
        <button matIconButton (click)="filtersOpen.set(!filtersOpen())" [matBadge]="activeFilters() || null" matBadgeSize="small" matBadgeColor="primary" matTooltip="Filtros" aria-label="Filtros" [class.on]="filtersOpen()">
          <mat-icon>{{ activeFilters() ? 'filter_alt' : 'filter_list' }}</mat-icon>
        </button>
      </div>

      @if (period() !== 'year') {
        <app-month-nav class="months sticky-top" [month]="month()" (monthChange)="month.set($event)" />
      } @else {
        <app-month-nav class="months sticky-top" [month]="month()" mode="year" (monthChange)="month.set($event)" />
      }

      @if (filtersOpen()) {
        <div class="card toolbar filters">
          <mat-button-toggle-group [value]="period()" (change)="period.set($event.value)" hideSingleSelectionIndicator>
            <mat-button-toggle value="month">Mês</mat-button-toggle>
            <mat-button-toggle value="year">Ano</mat-button-toggle>
            <mat-button-toggle value="12m">12 meses</mat-button-toggle>
          </mat-button-toggle-group>
          <mat-form-field class="f" subscriptSizing="dynamic">
            <mat-label>Conta</mat-label>
            <mat-select [ngModel]="accountId()" (ngModelChange)="accountId.set($event)">
              <mat-option [value]="null">Todas as contas</mat-option>
              @for (a of data.accounts(); track a.id) { <mat-option [value]="a.id">{{ a.name }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-checkbox [ngModel]="includeUnpaid()" (ngModelChange)="includeUnpaid.set($event)">Considerar movimentos não pagos</mat-checkbox>
          <span class="spacer"></span>
          <button matButton (click)="exportCsv()"><mat-icon>download</mat-icon>Exportar CSV</button>
        </div>
      }

      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }

      <mat-tab-group mat-stretch-tabs="false" animationDuration="150ms">
        <!-- ---------------- Categorias ---------------- -->
        <mat-tab label="Categorias">
          <div class="grid-2 tabbody">
            <div class="card">
              <h2>Despesas</h2>
              <div class="cat-layout">
                <div class="rows list">
                  @for (s of expenseSlices(); track s.id) {
                    <a class="row clickable" [routerLink]="['/movimentos']" [queryParams]="{ categoria: s.id === 'none' ? null : s.id, mes: month(), conta: accountId() }">
                      <app-icon-badge [icon]="s.icon" [color]="s.color" [size]="34" />
                      <div class="main"><div class="title">{{ s.label }}</div><div class="sub">{{ pct(s.value, totals().expense) }}</div></div>
                      <div class="amount">{{ s.value | money:'plain' }}</div>
                      @if (s.children.length) {
                        <button matIconButton class="exp" (click)="toggle(s.id, $event)" [attr.aria-label]="expanded().has(s.id) ? 'Esconder' : 'Ver sub-categorias'"><mat-icon>{{ expanded().has(s.id) ? 'expand_less' : 'expand_more' }}</mat-icon></button>
                      } @else { <span class="exp-gap"></span> }
                    </a>
                    @if (expanded().has(s.id)) {
                      @for (c of s.children; track c.id) {
                        <a class="row clickable child" [routerLink]="['/movimentos']" [queryParams]="{ categoria: c.id || s.id, mes: month(), conta: accountId() }">
                          <div class="main"><div class="title">{{ c.label }}</div></div>
                          <div class="amount">{{ c.value | money:'plain' }}</div>
                          <span class="pct">{{ pct(c.value, s.value) }}</span>
                        </a>
                      }
                    }
                  } @empty { <p class="empty">Sem despesas no período.</p> }
                  @if (expenseSlices().length) { <div class="row total"><div class="main">Total</div><div class="amount">{{ totals().expense | money:'plain' }}</div></div> }
                </div>
                <div class="donut"><app-donut-chart [slices]="expenseSlices()" [size]="200" centerLabel="Despesas" /></div>
              </div>
            </div>
            <div class="card">
              <h2>Receitas</h2>
              <div class="cat-layout">
                <div class="rows list">
                  @for (s of incomeSlices(); track s.id) {
                    <a class="row clickable" [routerLink]="['/movimentos']" [queryParams]="{ categoria: s.id === 'none' ? null : s.id, mes: month(), conta: accountId() }">
                      <app-icon-badge [icon]="s.icon" [color]="s.color" [size]="34" />
                      <div class="main"><div class="title">{{ s.label }}</div><div class="sub">{{ pct(s.value, totals().income) }}</div></div>
                      <div class="amount">{{ s.value | money:'plain' }}</div>
                      @if (s.children.length) {
                        <button matIconButton class="exp" (click)="toggle(s.id, $event)" [attr.aria-label]="expanded().has(s.id) ? 'Esconder' : 'Ver sub-categorias'"><mat-icon>{{ expanded().has(s.id) ? 'expand_less' : 'expand_more' }}</mat-icon></button>
                      } @else { <span class="exp-gap"></span> }
                    </a>
                    @if (expanded().has(s.id)) {
                      @for (c of s.children; track c.id) {
                        <a class="row clickable child" [routerLink]="['/movimentos']" [queryParams]="{ categoria: c.id || s.id, mes: month(), conta: accountId() }">
                          <div class="main"><div class="title">{{ c.label }}</div></div>
                          <div class="amount">{{ c.value | money:'plain' }}</div>
                          <span class="pct">{{ pct(c.value, s.value) }}</span>
                        </a>
                      }
                    }
                  } @empty { <p class="empty">Sem receitas no período.</p> }
                  @if (incomeSlices().length) { <div class="row total"><div class="main">Total</div><div class="amount">{{ totals().income | money:'plain' }}</div></div> }
                </div>
                <div class="donut"><app-donut-chart [slices]="incomeSlices()" [size]="200" centerLabel="Receitas" /></div>
              </div>
            </div>
          </div>
        </mat-tab>

        <!-- ---------------- Entradas x Saídas ---------------- -->
        <mat-tab label="Entradas x Saídas">
          <div class="card tabbody">
            <div class="toolbar">
              <mat-button-toggle-group [value]="granularity()" (change)="granularity.set($event.value)" hideSingleSelectionIndicator>
                <mat-button-toggle value="daily" [disabled]="period() !== 'month'">diário</mat-button-toggle>
                <mat-button-toggle value="weekly">semanal</mat-button-toggle>
                <mat-button-toggle value="monthly" [disabled]="period() === 'month'">mensal</mat-button-toggle>
              </mat-button-toggle-group>
              <span class="spacer"></span>
              <div class="muted small">Saldo inicial do período: <b>{{ opening() | money }}</b></div>
            </div>
            <app-flow-chart [points]="flowPoints()" />
            <div class="table-wrap">
              <table>
                <thead><tr><th></th><th>Entradas</th><th>Saídas</th><th>Resultado</th><th>Saldo</th></tr></thead>
                <tbody>
                  @for (r of flowRows(); track r.key) {
                    <tr [class.zero]="!r.income && !r.expense">
                      <td class="lbl">{{ r.label }}</td>
                      <td class="income">{{ r.income ? (r.income | money:'plain') : '0,00' }}</td>
                      <td class="expense">{{ r.expense ? '-' + (r.expense | money:'plain') : '0,00' }}</td>
                      <td [class.income]="r.result > 0" [class.expense]="r.result < 0">{{ r.result | money:'signed' }}</td>
                      <td class="bal" [class.expense]="r.balance < 0">{{ r.balance | money:'plain' }}</td>
                    </tr>
                  }
                </tbody>
                <tfoot><tr><td>Total</td><td class="income">{{ totals().income | money:'plain' }}</td><td class="expense">-{{ totals().expense | money:'plain' }}</td><td [class.income]="totals().income - totals().expense >= 0" [class.expense]="totals().income - totals().expense < 0">{{ totals().income - totals().expense | money:'signed' }}</td><td></td></tr></tfoot>
              </table>
            </div>
          </div>
        </mat-tab>

        <!-- ---------------- Contas ---------------- -->
        <mat-tab label="Contas">
          <div class="card tabbody">
            <p class="muted small">Movimento por conta no período (transferências contam como entrada na conta de destino e saída na de origem).</p>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Conta</th><th>Entradas</th><th>Saídas</th><th>Resultado</th><th>Saldo atual</th></tr></thead>
                <tbody>
                  @for (r of accountRows(); track r.account.id) {
                    <tr class="clickable" (click)="accountId.set(r.account.id)">
                      <td class="lbl"><span class="acc"><app-icon-badge [icon]="r.account.icon" [color]="r.account.color" [size]="26" />{{ r.account.name }}</span></td>
                      <td class="income">{{ r.income | money:'plain' }}</td>
                      <td class="expense">-{{ r.expense | money:'plain' }}</td>
                      <td [class.income]="r.income - r.expense > 0" [class.expense]="r.income - r.expense < 0">{{ r.income - r.expense | money:'signed' }}</td>
                      <td class="bal" [class.expense]="r.balance < 0">{{ r.balance | money:'plain' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="muted small">Clica numa conta para filtrar todos os relatórios por essa conta.</p>
          </div>
        </mat-tab>

      </mat-tab-group>
    </div>
  `,
  styles: [`
    .f { width: 200px; }
    .filters { padding: 12px; margin-bottom: 4px; }
    .page-header button.on { background: var(--mat-sys-secondary-container); }
    .range { font-size: 13px; }
    .tabbody { margin-top: 16px; }
    .cat-layout { display: flex; flex-direction: column-reverse; gap: 12px; }
    .cat-layout .list { width: 100%; min-width: 0; }
    .cat-layout .donut { align-self: center; }
    @media (min-width: 1100px) { .cat-layout { flex-direction: row; align-items: flex-start; } .cat-layout .list { flex: 1; } }
    a.row { text-decoration: none; color: inherit; }
    .row.child { padding-left: 46px; min-height: 34px; background: var(--mat-sys-surface-container-low); }
    .row.child .title { font-size: 14px; }
    .row.child .pct { font-size: 12px; color: var(--mat-sys-on-surface-variant); min-width: 52px; text-align: right; }
    .exp-gap { width: 40px; }
    .row.total { font-weight: 500; border-top: 2px solid var(--mat-sys-outline-variant); }
    .small { font-size: 13px; }
    .table-wrap { overflow-x: auto; margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; font-variant-numeric: tabular-nums; }
    th { text-align: right; font-weight: 500; color: var(--mat-sys-on-surface-variant); padding: 8px 10px; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    th:first-child { text-align: left; }
    td { text-align: right; padding: 8px 10px; border-bottom: 1px solid var(--mat-sys-outline-variant); white-space: nowrap; }
    td.lbl { text-align: left; color: var(--mat-sys-on-surface-variant); }
    td.bal { font-weight: 500; }
    tr.zero td { opacity: .55; }
    tr.clickable { cursor: pointer; } tr.clickable:hover td { background: var(--mat-sys-surface-container); }
    tfoot td { font-weight: 500; border-bottom: none; }
    .acc { display: inline-flex; align-items: center; gap: 8px; color: var(--mat-sys-on-surface); }
  `],
})
export class ReportsPage {
  readonly data = inject(DataService);
  private readonly ui = inject(UiService);

  readonly month = signal(currentMonth());
  readonly period = signal<Period>('month');
  readonly granularity = signal<Granularity>('daily');
  readonly accountId = signal<string | null>(null);
  readonly includeUnpaid = signal(true);
  readonly loading = signal(false);
  readonly filtersOpen = signal(false);
  readonly activeFilters = computed(() => (this.accountId() ? 1 : 0) + (this.includeUnpaid() ? 0 : 1) + (this.period() !== 'month' ? 1 : 0));
  monthLabel() { return monthLabel(this.month()); }

  private readonly raw = signal<Transaction[]>([]);
  readonly opening = signal(0);

  readonly range = computed(() => {
    const m = this.month();
    if (this.period() === 'month') return monthRange(m);
    if (this.period() === 'year') { const y = m.slice(0, 4); return { start: `${y}-01-01`, end: `${y}-12-31`, next: `${Number(y) + 1}-01-01` }; }
    const r = monthRange(m);
    return { start: monthRange(shiftMonth(m, -11)).start, end: r.end, next: r.next };
  });

  readonly txs = computed(() => (this.includeUnpaid() ? this.raw() : this.raw().filter((t) => t.paid)));

  readonly totals = computed(() => {
    let income = 0, expense = 0;
    const acc = this.accountId();
    for (const t of this.txs()) { const s = signFor(t, acc); if (s > 0) income += t.amount; else if (s < 0) expense += t.amount; }
    return { income, expense };
  });

  /** Totais por categoria principal; cada fatia traz o detalhe das sub-categorias. */
  private slicesFor(kind: 'expense' | 'income') {
    const acc = this.accountId();
    const m = new Map<string, { value: number; children: Map<string, number> }>();
    for (const t of this.txs()) {
      if (t.kind !== kind || (acc && t.account_id !== acc)) continue;
      const root = this.data.rootOf(t.category_id);
      const rid = root?.id ?? '';
      const e = m.get(rid) ?? m.set(rid, { value: 0, children: new Map() }).get(rid)!;
      e.value += t.amount;
      const leaf = t.category_id && t.category_id !== rid ? t.category_id : '';
      e.children.set(leaf, (e.children.get(leaf) ?? 0) + t.amount);
    }
    return [...m.entries()].map(([id, e]) => {
      const c = this.data.categoryMap().get(id);
      const children = [...e.children.entries()]
        .map(([cid, value]) => ({ id: cid, label: cid ? (this.data.categoryMap().get(cid)?.name ?? '?') : (e.children.size > 1 ? 'Sem sub-categoria' : ''), value }))
        .filter((x) => x.label)
        .sort((a, b) => b.value - a.value);
      return { id: id || 'none', label: c?.name ?? 'Sem categoria', value: e.value, color: c?.color ?? '#90a4ae', icon: c?.icon ?? 'label', children: children.length > 1 || (children.length === 1 && children[0].id) ? children : [] };
    }).sort((a, b) => b.value - a.value);
  }
  readonly expanded = signal<Set<string>>(new Set());
  toggle(id: string, ev: Event) {
    ev.preventDefault(); ev.stopPropagation();
    this.expanded.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  readonly expenseSlices = computed(() => this.slicesFor('expense'));
  readonly incomeSlices = computed(() => this.slicesFor('income'));

  readonly flowRows = computed<FlowRow[]>(() => {
    const { start, end } = this.range();
    const g = this.granularity();
    const acc = this.accountId();
    const buckets = new Map<string, FlowRow>();
    const keyOf = (iso: string) => {
      if (g === 'daily') return iso;
      if (g === 'monthly') return iso.slice(0, 7);
      const d = fromIso(iso); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); // segunda-feira
      return toIso(d);
    };
    const labelOf = (key: string) => g === 'monthly' ? shortMonthLabel(key) : g === 'weekly' ? `Sem. ${DAY_FMT.format(fromIso(key))}` : DAY_FMT.format(fromIso(key));
    // Preenche todos os períodos (mesmo sem movimentos) para o gráfico ficar contínuo
    const seedKeys = g === 'daily' ? eachDay(start, end) : g === 'monthly' ? monthsBetween(start, end) : [...new Set(eachDay(start, end).map(keyOf))];
    for (const k of seedKeys) buckets.set(k, { key: k, label: labelOf(k), income: 0, expense: 0, result: 0, balance: 0 });
    for (const t of this.txs()) {
      const k = keyOf(t.date);
      const b = buckets.get(k) ?? buckets.set(k, { key: k, label: labelOf(k), income: 0, expense: 0, result: 0, balance: 0 }).get(k)!;
      const s = signFor(t, acc);
      if (s > 0) b.income += t.amount; else if (s < 0) b.expense += t.amount;
    }
    let bal = this.opening();
    return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).map((b) => { b.result = b.income - b.expense; bal += b.result; b.balance = bal; return b; });
  });

  readonly flowPoints = computed<FlowPoint[]>(() => this.flowRows().map((r) => ({ label: r.label, income: r.income, expense: r.expense, balance: r.balance })));

  readonly accountRows = computed(() =>
    this.data.activeAccounts().map((account: Account) => {
      let income = 0, expense = 0;
      for (const t of this.txs()) { const s = signFor(t, account.id); if (s > 0) income += t.amount; else if (s < 0) expense += t.amount; }
      return { account, income, expense, balance: this.data.balances()[account.id] ?? account.initial_balance };
    }),
  );

  constructor() {
    effect(() => {
      const { start, end } = this.range();
      const acc = this.accountId(), unpaid = this.includeUnpaid();
      this.data.version();
      untracked(() => this.load(start, end, acc, unpaid));
    });
    effect(() => {
      const p = this.period();
      untracked(() => {
        if (p === 'month' && this.granularity() === 'monthly') this.granularity.set('daily');
        if (p !== 'month' && this.granularity() === 'daily') this.granularity.set('monthly');
      });
    });
  }

  private async load(start: string, end: string, acc: string | null, unpaid: boolean) {
    this.loading.set(true);
    try {
      const [list, opening] = await Promise.all([this.data.listTransactions(start, end, acc), this.data.openingBalance(start, acc, unpaid)]);
      this.raw.set(list);
      this.opening.set(opening);
    } catch (e) { this.ui.error(e); } finally { this.loading.set(false); }
  }

  shift(n: number) { return shiftMonth(this.month(), n); }
  pct(v: number, total: number) { return total ? (100 * v / total).toFixed(2).replace('.', ',') + '%' : ''; }

  exportCsv() {
    const acc = this.data.accountMap(), cat = this.data.categoryMap();
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta', 'Conta destino', 'Valor', 'Pago', 'Notas'].join(';')];
    for (const t of this.txs()) {
      lines.push([
        t.date, t.kind === 'expense' ? 'Despesa' : t.kind === 'income' ? 'Receita' : 'Transferência', t.description,
        cat.get(t.category_id ?? '')?.name ?? '', acc.get(t.account_id)?.name ?? '', acc.get(t.to_account_id ?? '')?.name ?? '',
        formatMoney(t.kind === 'expense' ? -t.amount : t.amount, false), t.paid ? 'Sim' : 'Não', t.notes ?? '',
      ].map(esc).join(';'));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `myfinances_${this.range().start}_${this.range().end}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let m = start.slice(0, 7);
  while (m <= end.slice(0, 7)) { out.push(m); m = shiftMonth(m, 1); }
  return out;
}
