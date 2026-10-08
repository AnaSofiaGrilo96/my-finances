import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatBadgeModule } from '@angular/material/badge';
import { DataService } from '../../core/data.service';
import { Transaction, signFor } from '../../core/models';
import { addDays, currentMonth, eachDay, fromIso, monthRange, shiftMonth, shortMonthLabel, todayIso, toIso } from '../../core/dates';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MoneyPipe, formatMoney } from '../../shared/money.pipe';
import { IconBadge } from '../../shared/icon-badge';
import { MonthNav } from '../../shared/month-nav';
import { DonutChart, DonutSlice, FlowChart, FlowPoint } from '../../shared/charts';
import { UiService } from '../../shared/ui.service';

type Period = 'today' | 'week' | 'month' | '3m' | '6m' | '12m' | 'year' | 'custom';
const PERIODS: { id: Period; label: string; icon: string }[] = [
  { id: 'today', label: 'Hoje', icon: 'today' },
  { id: 'week', label: 'Esta semana', icon: 'date_range' },
  { id: 'month', label: 'Este mês', icon: 'calendar_view_month' },
  { id: '3m', label: 'Últimos 3 meses', icon: 'history' },
  { id: '6m', label: 'Últimos 6 meses', icon: 'history' },
  { id: '12m', label: 'Últimos 12 meses', icon: 'history' },
  { id: 'year', label: 'Este ano', icon: 'calendar_today' },
  { id: 'custom', label: 'Escolher período', icon: 'edit_calendar' },
];
type Granularity = 'daily' | 'weekly' | 'monthly';
interface FlowRow { key: string; label: string; income: number; expense: number; result: number; balance: number; }

const DAY_FMT = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** "Escolher período": intervalo de datas livre. Devolve { start, end } em ISO ou undefined. */
@Component({
  selector: 'app-range-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatDatepickerModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Escolher período</h2>
    <mat-dialog-content>
      <mat-form-field class="full">
        <mat-label>De – até</mat-label>
        <mat-date-range-input [rangePicker]="picker">
          <input matStartDate [(ngModel)]="start" placeholder="Início" />
          <input matEndDate [(ngModel)]="end" placeholder="Fim" />
        </mat-date-range-input>
        <mat-datepicker-toggle matIconSuffix [for]="picker" />
        <mat-date-range-picker #picker touchUi />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancelar</button>
      <button matButton="filled" [disabled]="!start || !end" (click)="ok()">Aplicar</button>
    </mat-dialog-actions>
  `,
  styles: [`.full { width: 100%; margin-top: 8px; }`],
})
export class RangeDialog {
  private readonly ref = inject(MatDialogRef<RangeDialog>);
  private readonly data = inject<{ start: string; end: string }>(MAT_DIALOG_DATA);
  start: Date | null = fromIso(this.data.start);
  end: Date | null = fromIso(this.data.end);
  ok() { if (this.start && this.end) this.ref.close({ start: toIso(this.start), end: toIso(this.end) }); }
}

@Component({
  selector: 'app-reports-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatTabsModule, MatMenuModule, MatTooltipModule, MatButtonToggleModule, MatProgressBarModule, MatTableModule, MatBadgeModule, MoneyPipe, IconBadge, MonthNav, DonutChart, FlowChart],
  template: `
    <div class="page fixed-page">
      <!-- Cabeçalho fixo: roda de meses/anos + filtros (o título só no computador) -->
      <div class="fixed-head"><div class="inner">
        <h1>Relatórios</h1>
        @if (period() === 'month') {
          <app-month-nav [month]="month()" (monthChange)="month.set($event)" />
        } @else if (period() === 'year') {
          <app-month-nav [month]="month()" mode="year" (monthChange)="month.set($event)" />
        } @else {
          <div class="range-head"><mat-icon>date_range</mat-icon>{{ rangeLabel() }}</div>
        }
        <button matIconButton (click)="filtersOpen.set(!filtersOpen())" [matBadge]="activeFilters() || null" matBadgeSize="small" matBadgeColor="primary" matTooltip="Filtros" aria-label="Filtros" [class.on]="filtersOpen()">
          <mat-icon>{{ activeFilters() ? 'filter_alt' : 'filter_list' }}</mat-icon>
        </button>
      </div></div>

      <div class="fixed-body"><div class="inner">
      @if (filtersOpen()) {
        <!-- Barra de filtros em pílulas (igual à de Movimentos) -->
        <div class="fbar">
          <div class="pills">
            <button type="button" class="pill" [class.on]="period() !== 'month'" [matMenuTriggerFor]="periodMenu">
              <mat-icon class="lead">date_range</mat-icon>{{ periodLabel() }}<mat-icon>expand_more</mat-icon>
            </button>
            <button type="button" class="pill" [class.on]="accountId()" [matMenuTriggerFor]="accMenu">
              @if (accSel(); as a) { <app-icon-badge [icon]="a.icon" [color]="a.color" [size]="22" />{{ a.name }} } @else { Conta }
              <mat-icon>expand_more</mat-icon>
            </button>
            <button type="button" class="pill" [class.on]="!includeUnpaid()" [matMenuTriggerFor]="stateMenu">
              @if (!includeUnpaid()) { <mat-icon class="lead income">thumb_up</mat-icon>Só pagos } @else { Estado }
              <mat-icon>expand_more</mat-icon>
            </button>
            @if (activeFilters()) { <button type="button" class="pill clear" (click)="clearFilters()"><mat-icon>close</mat-icon>Limpar</button> }
          </div>
          <div class="search">
            <button type="button" class="sbtn" (click)="exportCsv()" matTooltip="Exportar CSV" aria-label="Exportar CSV"><mat-icon>download</mat-icon></button>
          </div>
        </div>

        <mat-menu #periodMenu="matMenu" class="fmenu">
          @for (p of periods; track p.id) {
            <button mat-menu-item (click)="choosePeriod(p.id)" [class.sel]="period() === p.id"><mat-icon>{{ p.icon }}</mat-icon>{{ p.label }}</button>
          }
        </mat-menu>
        <mat-menu #accMenu="matMenu" class="fmenu">
          <button mat-menu-item (click)="accountId.set(null)" [class.sel]="!accountId()"><span class="all"><span class="ph"></span>Todas as contas</span></button>
          @for (a of data.accounts(); track a.id) {
            <button mat-menu-item (click)="accountId.set(a.id)" [class.sel]="accountId() === a.id"><app-icon-badge [icon]="a.icon" [color]="a.color" [size]="28" />{{ a.name }}</button>
          }
        </mat-menu>
        <mat-menu #stateMenu="matMenu" class="fmenu">
          <button mat-menu-item (click)="includeUnpaid.set(true)" [class.sel]="includeUnpaid()"><span class="all"><span class="ph"></span>Todos os movimentos</span></button>
          <button mat-menu-item (click)="includeUnpaid.set(false)" [class.sel]="!includeUnpaid()"><mat-icon class="income">thumb_up</mat-icon>Só pagos / recebidos</button>
        </mat-menu>
      }

      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }

      <mat-tab-group mat-stretch-tabs="false" animationDuration="150ms" [selectedIndex]="tab()" (selectedIndexChange)="tab.set($event)">
        <!-- ---------------- Categorias ---------------- -->
        <mat-tab label="Categorias">
          <div class="grid-2 tabbody">
            <div class="card">
              <h2>Despesas</h2>
              <div class="cat-layout">
                <div class="rows list">
                  @for (s of expenseSlices(); track s.id) {
                    <a class="row clickable" [routerLink]="['/movimentos']" [queryParams]="linkParams(s.id === 'none' ? null : s.id)">
                      <app-icon-badge [icon]="s.icon" [color]="s.color" [size]="34" />
                      <div class="main"><div class="title">{{ s.label }}</div><div class="sub">{{ pct(s.value, totals().expense) }}</div></div>
                      <div class="amount">{{ s.value | money:'plain' }}</div>
                      @if (s.children.length) {
                        <button matIconButton class="exp" (click)="toggle(s.id, $event)" [attr.aria-label]="expanded().has(s.id) ? 'Esconder' : 'Ver sub-categorias'"><mat-icon>{{ expanded().has(s.id) ? 'expand_less' : 'expand_more' }}</mat-icon></button>
                      } @else { <span class="exp-gap"></span> }
                    </a>
                    @if (expanded().has(s.id)) {
                      @for (c of s.children; track c.id) {
                        <a class="row clickable child" [routerLink]="['/movimentos']" [queryParams]="linkParams(c.id || s.id)">
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
                    <a class="row clickable" [routerLink]="['/movimentos']" [queryParams]="linkParams(s.id === 'none' ? null : s.id)">
                      <app-icon-badge [icon]="s.icon" [color]="s.color" [size]="34" />
                      <div class="main"><div class="title">{{ s.label }}</div><div class="sub">{{ pct(s.value, totals().income) }}</div></div>
                      <div class="amount">{{ s.value | money:'plain' }}</div>
                      @if (s.children.length) {
                        <button matIconButton class="exp" (click)="toggle(s.id, $event)" [attr.aria-label]="expanded().has(s.id) ? 'Esconder' : 'Ver sub-categorias'"><mat-icon>{{ expanded().has(s.id) ? 'expand_less' : 'expand_more' }}</mat-icon></button>
                      } @else { <span class="exp-gap"></span> }
                    </a>
                    @if (expanded().has(s.id)) {
                      @for (c of s.children; track c.id) {
                        <a class="row clickable child" [routerLink]="['/movimentos']" [queryParams]="linkParams(c.id || s.id)">
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
                <mat-button-toggle value="daily" [disabled]="rangeDays() > 93">diário</mat-button-toggle>
                <mat-button-toggle value="weekly" [disabled]="rangeDays() < 8">semanal</mat-button-toggle>
                <mat-button-toggle value="monthly" [disabled]="rangeDays() < 45">mensal</mat-button-toggle>
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
                      <td class="income">{{ r.income ? (r.income | money:'plain') : '€ 0,00' }}</td>
                      <td class="expense">{{ r.expense ? '-' + (r.expense | money:'plain') : '€ 0,00' }}</td>
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

      </mat-tab-group>
      <div class="end-space"></div>
      </div></div>
    </div>
  `,
  styles: [`
    .range-head { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; height: 40px; font-size: 15px; font-weight: 500; }
    .range-head mat-icon { color: var(--mat-sys-on-surface-variant); }
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
    table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
    th { text-align: right; font-weight: 500; color: var(--mat-sys-on-surface-variant); padding: 12px 14px; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    th:first-child { text-align: left; }
    td { text-align: right; padding: 14px 14px; border-bottom: 1px solid color-mix(in srgb, var(--mat-sys-outline-variant) 55%, transparent); white-space: nowrap; }
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
  private readonly dialog = inject(MatDialog);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly qp = this.route.snapshot.queryParamMap;
  // Estado inicial a partir da URL (?periodo=&mes=&conta=&pagos=&de=&ate=&vista=&separador=) para partilhar/voltar atrás
  readonly month = signal(this.qp.get('mes') ?? currentMonth());
  readonly period = signal<Period>((PERIODS.some((p) => p.id === this.qp.get('periodo')) ? this.qp.get('periodo') : 'month') as Period);
  readonly granularity = signal<Granularity>((['daily', 'weekly', 'monthly'].includes(this.qp.get('vista') ?? '') ? this.qp.get('vista') : 'daily') as Granularity);
  readonly accountId = signal<string | null>(this.qp.get('conta'));
  readonly includeUnpaid = signal(this.qp.get('pagos') !== '1');
  readonly tab = signal(Number(this.qp.get('separador') ?? 0) || 0);
  readonly loading = signal(false);
  readonly filtersOpen = signal(window.matchMedia('(min-width: 900px)').matches); // no computador a barra está sempre visível
  readonly accSel = computed(() => this.accountId() ? this.data.accountMap().get(this.accountId()!) : undefined);
  readonly periods = PERIODS;
  readonly customRange = signal<{ start: string; end: string } | null>(this.qp.get('de') && this.qp.get('ate') ? { start: this.qp.get('de')!, end: this.qp.get('ate')! } : null);
  periodLabel() { return PERIODS.find((p) => p.id === this.period())?.label ?? ''; }
  clearFilters() { this.period.set('month'); this.month.set(currentMonth()); this.accountId.set(null); this.includeUnpaid.set(true); }
  async choosePeriod(p: Period) {
    if (p === 'custom') {
      const r = await this.dialog.open(RangeDialog, { data: this.customRange() ?? this.range(), width: '360px', autoFocus: false }).afterClosed().toPromise();
      if (!r) return;
      this.customRange.set(r);
    }
    if (p === 'month' || p === 'year') this.month.set(currentMonth());
    this.period.set(p);
  }
  /** Link para Movimentos com o MESMO intervalo do relatório (mês → ?mes=; outros → ?de=&ate=) e os mesmos filtros. */
  linkParams(categoryId: string | null) {
    const base = { categoria: categoryId, conta: this.accountId(), estado: this.includeUnpaid() ? null : 'paid' };
    if (this.period() === 'month') return { ...base, mes: this.month() };
    const { start, end } = this.range();
    return { ...base, de: start, ate: end };
  }
  /** Texto do intervalo no cabeçalho (fora de mês/ano). */
  rangeLabel() {
    const { start, end } = this.range();
    const f = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
    return start === end ? f(start) : `${f(start)} – ${f(end)}`;
  }
  readonly rangeDays = computed(() => Math.round((fromIso(this.range().end).getTime() - fromIso(this.range().start).getTime()) / 86400000) + 1);
  readonly activeFilters = computed(() => (this.accountId() ? 1 : 0) + (this.includeUnpaid() ? 0 : 1) + (this.period() !== 'month' || this.month() !== currentMonth() ? 1 : 0));

  private readonly raw = signal<Transaction[]>([]);
  readonly opening = signal(0);

  readonly range = computed(() => {
    const m = this.month(), p = this.period(), today = todayIso();
    const mk = (start: string, end: string) => ({ start, end, next: addDays(end, 1) });
    switch (p) {
      case 'today': return mk(today, today);
      case 'week': { const d = fromIso(today); const dow = (d.getDay() + 6) % 7; const mon = addDays(today, -dow); return mk(mon, addDays(mon, 6)); }
      case 'month': return monthRange(m);
      case 'year': { const y = m.slice(0, 4); return mk(`${y}-01-01`, `${y}-12-31`); }
      case '3m': case '6m': case '12m': { const n = Number(p.slice(0, -1)); const cur = currentMonth(); return mk(monthRange(shiftMonth(cur, -(n - 1))).start, monthRange(cur).end); }
      case 'custom': { const c = this.customRange(); return c ? mk(c.start, c.end) : monthRange(m); }
    }
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

  constructor() {
    effect(() => {
      const { start, end } = this.range();
      const acc = this.accountId(), unpaid = this.includeUnpaid();
      this.data.version();
      untracked(() => this.load(start, end, acc, unpaid));
    });
    // Reflete os filtros na URL (sem criar entradas no histórico) — permite partilhar o link e voltar ao mesmo sítio
    effect(() => {
      const p = this.period(), c = this.customRange();
      const q: Record<string, string | null> = {
        periodo: p === 'month' ? null : p,
        mes: (p === 'month' || p === 'year') && this.month() !== currentMonth() ? this.month() : null,
        conta: this.accountId(),
        pagos: this.includeUnpaid() ? null : '1',
        de: p === 'custom' && c ? c.start : null,
        ate: p === 'custom' && c ? c.end : null,
        vista: this.granularity() === 'daily' ? null : this.granularity(),
        separador: this.tab() ? String(this.tab()) : null,
      };
      untracked(() => this.router.navigate([], { queryParams: q, replaceUrl: true }));
    });
    // Granularidade automática conforme o tamanho do intervalo (o utilizador pode mudar nos botões, dentro do permitido)
    effect(() => {
      const days = this.rangeDays();
      untracked(() => {
        const g = this.granularity();
        if (days > 93 && g === 'daily') this.granularity.set('monthly');
        else if (days < 8 && g !== 'daily') this.granularity.set('daily');
        else if (days < 45 && g === 'monthly') this.granularity.set('daily');
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
