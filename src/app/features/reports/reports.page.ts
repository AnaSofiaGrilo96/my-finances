import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule } from '@angular/material/table';
import { MatBadgeModule } from '@angular/material/badge';
import { DataService } from '../../core/data.service';
import { Transaction, isAdjustment, signFor } from '../../core/models';
import { addDays, currentMonth, eachDay, fromIso, monthRange, monthLabel, shiftMonth, shortMonthLabel, todayIso, toIso } from '../../core/dates';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MoneyPipe, formatMoney } from '../../shared/money.pipe';
import { IconBadge } from '../../shared/icon-badge';
import { MonthNav } from '../../shared/month-nav';
import { DonutChart, DonutSlice, FlowChart, FlowPoint } from '../../shared/charts';
import { UiService } from '../../shared/ui.service';
import { PERIODS, Period, RangeDialog, periodRange } from '../../shared/periods';

const FULL_DAY = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
const MON3 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
function weekLabel(mondayIso: string) {
  const a = fromIso(mondayIso), b = fromIso(mondayIso); b.setDate(b.getDate() + 6);
  const f = (d: Date) => `${String(d.getDate()).padStart(2, '0')} ${MON3[d.getMonth()]}`;
  return `${f(a)} à ${f(b)}`;
}
function monthLabelCap(month: string) { const l = monthLabel(month); return l.charAt(0).toUpperCase() + l.slice(1); }
type Granularity = 'daily' | 'weekly' | 'monthly';
interface FlowRow { key: string; label: string; income: number; expense: number; result: number; balance: number; }

const DAY_FMT = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });

@Component({
  selector: 'app-reports-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatTabsModule, MatMenuModule, MatTooltipModule, MatButtonToggleModule, MatTableModule, MatBadgeModule, MoneyPipe, IconBadge, MonthNav, DonutChart, FlowChart],
  template: `
    <div class="page fixed-page one-card no-foot page-scroll">
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
      </div>
      <!-- Computador: separadores logo abaixo do mês, com sublinhado verde (como na outra aplicação de gestão de finanças, 20/10); no telemóvel ficam os do mat-tab-group -->
      <nav class="htabs" role="tablist">
        <button type="button" role="tab" [class.on]="tab() === 0" [attr.aria-selected]="tab() === 0" (click)="tab.set(0)">Categorias</button>
        <button type="button" role="tab" [class.on]="tab() === 1" [attr.aria-selected]="tab() === 1" (click)="tab.set(1)">Entradas x Saídas</button>
      </nav>
      <!-- Painel de filtros: fica no cabeçalho fixo (não faz scroll com a lista) -->
      <div class="collapse filters" [class.open]="filtersOpen()"><div>
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
      </div></div>
      </div>

      <div class="fixed-body"><div class="inner">

      <mat-tab-group class="rep-tabs" mat-stretch-tabs="false" animationDuration="260ms" [selectedIndex]="tab()" (selectedIndexChange)="tab.set($event)">
        <!-- ---------------- Categorias ---------------- -->
        <mat-tab label="Categorias">
          <div class="tabbody cat-sections">
            <div class="card">
              <h2>Despesas</h2>
              <div class="cat-layout">
                <div class="rows list">
                  @for (s of expenseSlices(); track s.id) {
                    @if (s.children.length) {
                      <button type="button" class="row clickable parent" (mouseenter)="hover.set(s.id)" (mouseleave)="hover.set(null)" (click)="toggle(s.id, $event)" [class.open]="expanded().has(s.id)" [attr.aria-expanded]="expanded().has(s.id)">
                        <app-icon-badge [icon]="s.icon" [color]="s.color" [size]="34" />
                        <div class="main"><div class="title">{{ s.label }}</div><div class="sub">{{ subCount(s.children) }} {{ subCount(s.children) === 1 ? 'sub-categoria' : 'sub-categorias' }}</div></div>
                        <div class="amt"><div class="amount">{{ s.value | money:'plain' }}</div><div class="pct">{{ pct(s.value, totals().expense) }}</div></div>
                      </button>
                    } @else {
                      <a class="row clickable" (mouseenter)="hover.set(s.id)" (mouseleave)="hover.set(null)" [routerLink]="['/movimentos']" [queryParams]="linkParams(s.id === 'none' ? null : s.id)">
                        <app-icon-badge [icon]="s.icon" [color]="s.color" [size]="34" />
                        <div class="main"><div class="title">{{ s.label }}</div></div>
                        <div class="amt"><div class="amount">{{ s.value | money:'plain' }}</div><div class="pct">{{ pct(s.value, totals().expense) }}</div></div>
                      </a>
                    }
                    @if (s.children.length) {
                      <div class="collapse" [class.open]="expanded().has(s.id)"><div>
                        @for (c of s.children; track c.id) {
                          <a class="row clickable child" [routerLink]="['/movimentos']" [queryParams]="linkParams(c.id || s.id)">
                            <app-icon-badge [icon]="c.id ? iconOfCat(c.id, s.icon) : s.icon" [color]="c.id ? colorOfCat(c.id, s.color) : s.color" [size]="22" />
                            <div class="main"><div class="title">{{ c.id ? c.label : s.label }}@if (!c.id) { <span class="note">(categoria principal)</span> }</div></div>
                            <div class="amount">{{ c.value | money:'plain' }}</div>
                          </a>
                        }
                      </div></div>
                    }
                  } @empty { <p class="empty">Sem despesas no período.</p> }
                  @if (expenseSlices().length) { <div class="row total"><div class="main">Total</div><div class="amount">{{ totals().expense | money:'plain' }}</div></div> }
                </div>
                <div class="donut"><app-donut-chart [slices]="expenseSlices()" [highlight]="hover()" [size]="210" [stroke]="46" centerLabel="" /></div>
              </div>
            </div>
            <div class="card">
              <h2>Receitas</h2>
              <div class="cat-layout">
                <div class="rows list">
                  @for (s of incomeSlices(); track s.id) {
                    @if (s.children.length) {
                      <button type="button" class="row clickable parent" (mouseenter)="hover.set(s.id)" (mouseleave)="hover.set(null)" (click)="toggle(s.id, $event)" [class.open]="expanded().has(s.id)" [attr.aria-expanded]="expanded().has(s.id)">
                        <app-icon-badge [icon]="s.icon" [color]="s.color" [size]="34" />
                        <div class="main"><div class="title">{{ s.label }}</div><div class="sub">{{ subCount(s.children) }} {{ subCount(s.children) === 1 ? 'sub-categoria' : 'sub-categorias' }}</div></div>
                        <div class="amt"><div class="amount">{{ s.value | money:'plain' }}</div><div class="pct">{{ pct(s.value, totals().income) }}</div></div>
                      </button>
                    } @else {
                      <a class="row clickable" (mouseenter)="hover.set(s.id)" (mouseleave)="hover.set(null)" [routerLink]="['/movimentos']" [queryParams]="linkParams(s.id === 'none' ? null : s.id)">
                        <app-icon-badge [icon]="s.icon" [color]="s.color" [size]="34" />
                        <div class="main"><div class="title">{{ s.label }}</div></div>
                        <div class="amt"><div class="amount">{{ s.value | money:'plain' }}</div><div class="pct">{{ pct(s.value, totals().income) }}</div></div>
                      </a>
                    }
                    @if (s.children.length) {
                      <div class="collapse" [class.open]="expanded().has(s.id)"><div>
                        @for (c of s.children; track c.id) {
                          <a class="row clickable child" [routerLink]="['/movimentos']" [queryParams]="linkParams(c.id || s.id)">
                            <app-icon-badge [icon]="c.id ? iconOfCat(c.id, s.icon) : s.icon" [color]="c.id ? colorOfCat(c.id, s.color) : s.color" [size]="22" />
                            <div class="main"><div class="title">{{ c.id ? c.label : s.label }}@if (!c.id) { <span class="note">(categoria principal)</span> }</div></div>
                            <div class="amount">{{ c.value | money:'plain' }}</div>
                          </a>
                        }
                      </div></div>
                    }
                  } @empty { <p class="empty">Sem receitas no período.</p> }
                  @if (incomeSlices().length) { <div class="row total"><div class="main">Total</div><div class="amount">{{ totals().income | money:'plain' }}</div></div> }
                </div>
                <div class="donut"><app-donut-chart [slices]="incomeSlices()" [highlight]="hover()" [size]="210" [stroke]="46" centerLabel="" /></div>
              </div>
            </div>
          </div>
        </mat-tab>

        <!-- ---------------- Entradas x Saídas ---------------- -->
        <mat-tab label="Entradas x Saídas">
          <!-- Entradas x Saídas (22/10, à imagem da outra aplicação de gestão de finanças): granularidade em links de texto, caixa
               para contar os não pagos, gráfico com área do saldo suave e barras finas, tabela com linhas separadoras -->
          <div class="card tabbody flow">
            <div class="flow-tools">
              <div class="gran" role="tablist" aria-label="Agrupar por">
                <button type="button" [class.on]="granularity() === 'daily'" [disabled]="rangeDays() > 93" (click)="granularity.set('daily')">diário</button>
                <button type="button" [class.on]="granularity() === 'weekly'" [disabled]="rangeDays() < 8" (click)="granularity.set('weekly')">semanal</button>
                <button type="button" [class.on]="granularity() === 'monthly'" [disabled]="rangeDays() < 45" (click)="granularity.set('monthly')">mensal</button>
              </div>
              <label class="unpaid">
                <input type="checkbox" [checked]="includeUnpaid()" (change)="includeUnpaid.set($any($event.target).checked)" />
                <span class="box"><mat-icon>check</mat-icon></span>
                Considerar movimentações não pagas
              </label>
            </div>
            <app-flow-chart [points]="flowPoints()" />
            <div class="table-wrap">
              <table class="ftable">
                <thead><tr><th></th><th>Entradas</th><th>Saídas</th><th>Resultado</th><th>Saldo</th></tr></thead>
                <tbody>
                  @for (r of flowRows(); track r.key) {
                    <tr [class.zero]="!r.income && !r.expense">
                      <td class="lbl">{{ r.label }}</td>
                      <td [class.income]="r.income > 0" [class.nil]="!r.income">{{ r.income | money }}</td>
                      <td [class.expense]="r.expense > 0" [class.nil]="!r.expense">{{ -r.expense | money }}</td>
                      <td [class.income]="r.result > 0" [class.expense]="r.result < 0" [class.nil]="!r.result">{{ r.result | money:'signed' }}</td>
                      <td class="bal" [class.neg]="r.balance < 0">{{ r.balance | money }}</td>
                    </tr>
                  }
                </tbody>
                <tfoot><tr><td class="lbl">Total</td><td class="income">{{ totals().income | money }}</td><td class="expense">{{ -totals().expense | money }}</td><td [class.income]="totals().income - totals().expense >= 0" [class.expense]="totals().income - totals().expense < 0">{{ totals().income - totals().expense | money:'signed' }}</td><td></td></tr></tfoot>
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
    .tabbody { margin-top: var(--gap); }
    .cat-layout { display: flex; flex-direction: column-reverse; gap: 12px; }
    .cat-layout .list { width: 100%; min-width: 0; }
    .cat-layout .donut { align-self: center; }
    .cat-sections { display: flex; flex-direction: column; gap: var(--gap); }
    .htabs { display: none; }
    @media (min-width: 900px) {
      .htabs { display: flex; gap: 30px; max-width: var(--content-max); width: 100%; margin: 0 auto; box-sizing: border-box; background: var(--app-card-bg); padding: 0 28px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
      .htabs button { border: none; background: none; font: inherit; font-size: 13px; font-weight: 500; color: var(--ink-soft); padding: 12px 0 10px; border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer; transition: color .15s, border-color .15s; }
      @media (hover: hover) { .htabs button:hover { color: var(--ink); } }
      .htabs button.on { color: #129e3f; border-bottom-color: #129e3f; }
      :host-context(html.dark) .htabs button.on { color: #4cd47a; border-bottom-color: #4cd47a; }
      .one-card .fixed-head > .inner { border-bottom: none; }
    }
    .amt { display: flex; flex-direction: column; align-items: flex-end; }
    .note { font-size: 11.5px; color: var(--mat-sys-on-surface-variant); margin-left: 4px; font-weight: 400; }
    .amt .pct { font-size: 11.5px; color: var(--mat-sys-on-surface-variant); }
    /* Computador: Despesas e Receitas uma por baixo da outra no mesmo cartão (.one-card), lista à esquerda e anel à direita (20/10) */
    @media (min-width: 900px) {
      .cat-sections { gap: 0; }
      .cat-sections > .card + .card { border-top: 1px solid var(--line); margin-top: 28px; padding-top: 28px; }
      .cat-sections h2 { font-size: 14px; font-weight: 400; color: var(--mat-sys-on-surface-variant); margin: 0 0 10px; }
      .cat-layout { flex-direction: row; align-items: flex-start; gap: 40px; }
      .cat-layout .list { flex: 0 0 50%; }
      .cat-layout .donut { flex: 1; display: flex; justify-content: center; align-self: flex-start; padding-top: 16px; }
      .cat-layout .row { border-radius: 0; padding: 9px 4px; min-height: 0; }
      .cat-layout .row:not(.child) + .row, .cat-layout .collapse + .row { border-top: 1px solid var(--line); }
      .cat-layout .row .title { font-size: 14px; }
      .cat-layout .row .amount { font-size: 14px; }
      /* Sub-categorias expandidas (20/10, como na outra aplicação): a principal fica com fundo cinzento claro, as filhas com o
         ícone pequeno, ligeiramente recuadas, separadas por linhas, só com o valor */
      .row.parent.open { background: color-mix(in srgb, var(--mat-sys-on-surface) 4%, transparent); border-radius: 6px; }
      .cat-layout .row.child { background: transparent; padding: 9px 4px 9px 10px; gap: 10px; min-height: 0; }
      .cat-layout .row.child + .row.child { border-top: 1px solid var(--line); }
      .cat-layout .row.child .title { font-size: 13px; }
      @media (hover: hover) { .cat-layout .row.child:hover { background: color-mix(in srgb, var(--mat-sys-on-surface) 4%, transparent); } }
      .cat-layout .collapse.open { margin-bottom: 8px; }
      .row.total { border-top: 1px solid var(--line) !important; justify-content: flex-end; padding-top: 16px; }
      .row.total .main { flex: 0 0 auto; font-size: 12.5px; font-weight: 400; color: var(--mat-sys-on-surface-variant); }
      .row.total .amount { font-size: 16px; }
    }
    a.row { text-decoration: none; color: inherit; }
    button.row { width: 100%; background: none; border: none; font: inherit; color: inherit; text-align: left; }
    .row.parent { transition: background-color .25s ease; } .row.parent.open { background: var(--mat-sys-surface-container-low); }
    .row.child { padding-left: 16px; min-height: 34px; background: var(--mat-sys-surface-container-low); }
    .row.child .title { font-size: 14px; }
    .row.total { font-weight: 500; border-top: 2px solid var(--mat-sys-outline-variant); }
    .small { font-size: 13px; }
    /* Entradas x Saídas (22/10) */
    .flow-tools { display: flex; align-items: center; gap: 32px; flex-wrap: wrap; margin: 4px 0 18px; }
    .gran { display: flex; gap: 14px; }
    .gran button { position: relative; border: none; background: none; padding: 4px 0 8px; font: inherit; font-size: 14px; font-weight: 500; color: var(--mat-sys-on-surface-variant); cursor: pointer; }
    .gran button.on { color: #129e3f; }
    .gran button.on::after { content: ''; position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); border: 4px solid transparent; border-top-color: #129e3f; border-bottom: 0; }
    .gran button:disabled { color: color-mix(in srgb, var(--mat-sys-on-surface-variant) 45%, transparent); cursor: default; }
    :host-context(html.dark) .gran button.on { color: #4cd47a; } :host-context(html.dark) .gran button.on::after { border-top-color: #4cd47a; }
    .unpaid { display: inline-flex; align-items: center; gap: 10px; font-size: 14px; color: var(--mat-sys-on-surface-variant); cursor: pointer; user-select: none; }
    .unpaid input { position: absolute; opacity: 0; pointer-events: none; }
    .unpaid .box { width: 18px; height: 18px; border-radius: 4px; border: 1.5px solid var(--mat-sys-outline); display: grid; place-items: center; transition: background-color .15s, border-color .15s; }
    .unpaid .box mat-icon { font-size: 14px; width: 14px; height: 14px; color: #fff; opacity: 0; }
    .unpaid input:checked + .box { background: #1eb980; border-color: #1eb980; } .unpaid input:checked + .box mat-icon { opacity: 1; }
    .unpaid input:focus-visible + .box { outline: 2px solid #1eb980; outline-offset: 2px; }
    .ftable { margin-top: 18px; font-size: 14px; }
    .ftable th { font-weight: 500; color: var(--mat-sys-on-surface-variant); padding: 14px 4px; border-bottom: 1px solid var(--line, var(--mat-sys-outline-variant)); }
    .ftable td { padding: 14px 4px; border-bottom: 1px solid var(--line, var(--mat-sys-outline-variant)); color: var(--mat-sys-on-surface-variant); }
    .ftable td.lbl { padding-left: 16px; color: var(--mat-sys-on-surface-variant); }
    .ftable td.income { color: #129e3f; } .ftable td.expense { color: #e5484d; }
    :host-context(html.dark) .ftable td.income { color: #4cd47a; }
    .ftable td.bal { font-weight: 600; color: #129e3f; } .ftable td.bal.neg { color: #e5484d; }
    :host-context(html.dark) .ftable td.bal { color: #4cd47a; } :host-context(html.dark) .ftable td.bal.neg { color: #ff6b70; }
    .ftable td.nil, .ftable tr.zero td:not(.bal):not(.lbl) { color: color-mix(in srgb, var(--mat-sys-on-surface-variant) 60%, transparent); }
    .ftable tr.zero td { opacity: 1; }
    .ftable tfoot td { font-weight: 600; border-bottom: none; }
    .table-wrap { overflow-x: auto; margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
    th { text-align: right; font-weight: 500; color: var(--mat-sys-on-surface-variant); padding: 12px 14px; }
    th:first-child { text-align: left; }
    td { text-align: right; padding: 14px 14px; white-space: nowrap; }
    td.lbl { text-align: left; color: var(--mat-sys-on-surface-variant); }
    td.bal { font-weight: 500; }
    tr.zero td { opacity: .55; }
    tr.clickable { cursor: pointer; } @media (hover: hover) { tr.clickable:hover td { background: var(--mat-sys-surface-container); } }
    tfoot td { font-weight: 500; }
    .acc { display: inline-flex; align-items: center; gap: 8px; color: var(--mat-sys-on-surface); }
    /* telemóvel (22/10): letra 1–2px mais pequena (gerado a partir dos tamanhos acima) */
    @media (max-width: 899px) { .range-head { font-size: 13px; } .note { font-size: 10.5px; } .amt .pct { font-size: 10.5px; } .row.child .title { font-size: 13px; } .small { font-size: 12px; } .gran button { font-size: 13px; } .unpaid { font-size: 13px; } .ftable { font-size: 13px; } table { font-size: 13px; } }
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
  subCount(children: { id: string }[]) { return children.filter((c) => c.id).length; }
  /** Ícone/cor da sub-categoria (as sub-categorias costumam herdar os da principal). */
  iconOfCat(id: string, fallback: string) { return this.data.categoryMap().get(id)?.icon || fallback; }
  colorOfCat(id: string, fallback: string) { return this.data.categoryMap().get(id)?.color || fallback; }
  /** Categoria por baixo do rato: realça a fatia no anel. */
  readonly hover = signal<string | null>(null);
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

  readonly range = computed(() => periodRange(this.period(), this.month(), this.customRange()));

  readonly txs = computed(() => (this.includeUnpaid() ? this.raw() : this.raw().filter((t) => t.paid)));

  readonly totals = computed(() => {
    let income = 0, expense = 0;
    const acc = this.accountId();
    for (const t of this.txs()) { if (isAdjustment(t)) continue; const s = signFor(t, acc); if (s > 0) income += t.amount; else if (s < 0) expense += t.amount; }
    return { income, expense };
  });

  /** Totais por categoria principal; cada fatia traz o detalhe das sub-categorias. */
  private slicesFor(kind: 'expense' | 'income') {
    const acc = this.accountId();
    const m = new Map<string, { value: number; children: Map<string, number> }>();
    for (const t of this.txs()) {
      if (t.kind !== kind || (acc && t.account_id !== acc) || isAdjustment(t)) continue;
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
        .map(([cid, value]) => ({ id: cid, label: cid ? (this.data.categoryMap().get(cid)?.name ?? '?') : '', value }))
        .filter((x) => x.id || e.children.size > 1) // o que está na própria principal aparece como "Casa (categoria principal)"
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
    const labelOf = (key: string) => g === 'monthly' ? monthLabelCap(key) : g === 'weekly' ? weekLabel(key) : FULL_DAY.format(fromIso(key)); // como na outra aplicação: 01/11/2026, "28 Set à 04 Out", "Novembro 2026"
    // Preenche todos os períodos (mesmo sem movimentos) para o gráfico ficar contínuo
    const seedKeys = g === 'daily' ? eachDay(start, end) : g === 'monthly' ? monthsBetween(start, end) : [...new Set(eachDay(start, end).map(keyOf))];
    const adj = new Map<string, number>(); // ajustes de saldo por período (entram no saldo, não nas entradas/saídas)
    for (const k of seedKeys) buckets.set(k, { key: k, label: labelOf(k), income: 0, expense: 0, result: 0, balance: 0 });
    for (const t of this.txs()) {
      const k = keyOf(t.date);
      const b = buckets.get(k) ?? buckets.set(k, { key: k, label: labelOf(k), income: 0, expense: 0, result: 0, balance: 0 }).get(k)!;
      const s = signFor(t, acc);
      if (isAdjustment(t)) { adj.set(k, (adj.get(k) ?? 0) + s * t.amount); continue; } // só conta para o saldo acumulado
      if (s > 0) b.income += t.amount; else if (s < 0) b.expense += t.amount;
    }
    let bal = this.opening();
    return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).map((b) => { b.result = b.income - b.expense; bal += b.result + (adj.get(b.key) ?? 0); b.balance = bal; return b; });
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
    // Já lido antes (aqui ou em Movimentos)? mostra logo e atualiza por trás (21/10)
    const cached = this.data.peekTransactions(start, end, acc);
    if (cached) { this.raw.set(cached); this.opening.set(this.data.peekOpening(start, acc, unpaid) ?? this.opening()); }
    this.loading.set(!cached);
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
