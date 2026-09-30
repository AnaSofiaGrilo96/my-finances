import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataService } from '../../core/data.service';
import { Category, Transaction } from '../../core/models';
import { currentMonth, monthRange } from '../../core/dates';
import { MoneyPipe } from '../../shared/money.pipe';
import { IconBadge } from '../../shared/icon-badge';
import { MonthNav } from '../../shared/month-nav';
import { ProgressRing } from '../../shared/charts';
import { UiService } from '../../shared/ui.service';

@Component({
  selector: 'app-budgets-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTooltipModule, MoneyPipe, IconBadge, MonthNav, ProgressRing],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Limites de gastos</h1>
        <app-month-nav [month]="month()" (monthChange)="month.set($event)" />
      </div>

      <div class="card summary">
        <div><span class="muted">Total dos limites</span><b>{{ totalBudget() | money }}</b></div>
        <div><span class="muted">Gasto nas categorias com limite</span><b [class.expense]="totalSpent() > totalBudget()">{{ totalSpent() | money }}</b></div>
        <div><span class="muted">Disponível</span><b [class.income]="totalBudget() - totalSpent() >= 0" [class.expense]="totalBudget() - totalSpent() < 0">{{ totalBudget() - totalSpent() | money }}</b></div>
      </div>

      <div class="card">
        <h2>Limites do mês</h2>
        <div class="rows">
          @for (l of limits(); track l.category.id) {
            <div class="row">
              <app-progress-ring [value]="l.ratio" [size]="52" [stroke]="6" />
              <div class="main">
                <div class="title"><app-icon-badge [icon]="l.category.icon" [color]="l.category.color" [size]="20" /> {{ l.category.name }}</div>
                <div class="sub">Meta: {{ l.budget | money }} · Gasto: {{ l.spent | money }} · {{ l.budget - l.spent >= 0 ? 'Restam ' + (l.budget - l.spent | money) : 'Ultrapassado em ' + (l.spent - l.budget | money) }}</div>
              </div>
              <div class="amount" [class.expense]="l.ratio >= 1">{{ (l.ratio * 100).toFixed(0) }}%</div>
              <mat-form-field class="edit" subscriptSizing="dynamic">
                <span matTextPrefix>€&nbsp;</span>
                <input matInput type="number" min="0" step="1" inputmode="decimal" [ngModel]="l.budget" (change)="setBudget(l.category, $any($event.target).value)" />
              </mat-form-field>
              <button matIconButton (click)="setBudget(l.category, null)" matTooltip="Remover limite"><mat-icon>close</mat-icon></button>
            </div>
          } @empty {
            <p class="empty">Sem limites definidos. Escolhe uma categoria abaixo e define um valor mensal.</p>
          }
        </div>
      </div>

      <div class="card">
        <h2>Adicionar limite</h2>
        <div class="toolbar">
          <mat-form-field class="f" subscriptSizing="dynamic">
            <mat-label>Categoria</mat-label>
            <mat-select [(ngModel)]="newCategoryId">
              @for (c of available(); track c.id) { <mat-option [value]="c.id">{{ c.name }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="f small" subscriptSizing="dynamic">
            <mat-label>Valor mensal</mat-label>
            <span matTextPrefix>€&nbsp;</span>
            <input matInput type="number" min="0" step="1" inputmode="decimal" [(ngModel)]="newAmount" />
          </mat-form-field>
          <button matButton="filled" (click)="addBudget()" [disabled]="!newCategoryId || !newAmount"><mat-icon>add</mat-icon>Adicionar</button>
        </div>
        @if (!available().length && !data.expenseCategories().length) {
          <p class="muted">Primeiro cria categorias de despesa em <a routerLink="/categorias">Categorias</a>.</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .summary { display: flex; justify-content: space-around; gap: 8px; text-align: center; padding: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .summary div { display: flex; flex-direction: column; font-size: 13px; } .summary b { font-size: 16px; }
    .card + .card { margin-top: 16px; }
    .title { display: flex; align-items: center; gap: 6px; }
    .edit { width: 120px; }
    .f { width: 240px; } .small { width: 160px; }
    @media (max-width: 600px) { .row { flex-wrap: wrap; } .edit { width: 110px; } }
    a { color: var(--mat-sys-primary); }
  `],
})
export class BudgetsPage {
  readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  readonly month = signal(currentMonth());
  private readonly txs = signal<Transaction[]>([]);
  newCategoryId: string | null = null;
  newAmount: number | null = null;

  readonly spentByCategory = computed(() => {
    const m = new Map<string, number>();
    for (const t of this.txs()) if (t.kind === 'expense' && t.category_id) m.set(t.category_id, (m.get(t.category_id) ?? 0) + t.amount);
    return m;
  });

  readonly limits = computed(() =>
    this.data.budgets()
      .map((b) => {
        const category = this.data.categoryMap().get(b.category_id);
        const spent = this.spentByCategory().get(b.category_id) ?? 0;
        return category ? { category, budget: b.amount, spent, ratio: b.amount ? spent / b.amount : 0 } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.category.name.localeCompare(b.category.name)),
  );

  readonly totalBudget = computed(() => this.limits().reduce((s, l) => s + l.budget, 0));
  readonly totalSpent = computed(() => this.limits().reduce((s, l) => s + l.spent, 0));
  readonly available = computed(() => {
    const used = new Set(this.data.budgets().map((b) => b.category_id));
    return this.data.expenseCategories().filter((c) => !used.has(c.id));
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
      this.txs.set(await this.data.listTransactions(start, end));
    } catch (e) { this.ui.error(e); }
  }

  async setBudget(c: Category, value: string | number | null) {
    const n = value === null || value === '' ? null : Number(value);
    try { await this.data.setBudget(c.id, n); } catch (e) { this.ui.error(e); }
  }

  async addBudget() {
    if (!this.newCategoryId || !this.newAmount) return;
    try {
      await this.data.setBudget(this.newCategoryId, Number(this.newAmount));
      this.newCategoryId = null; this.newAmount = null;
    } catch (e) { this.ui.error(e); }
  }
}
