import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { DataService } from '../../core/data.service';
import { FREQUENCIES, Recurrence } from '../../core/models';
import { MoneyPipe } from '../../shared/money.pipe';
import { IconBadge } from '../../shared/icon-badge';
import { UiService } from '../../shared/ui.service';
import { openTransactionDialog } from '../transactions/transaction.dialog';

@Component({
  selector: 'app-recurrences-page',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatMenuModule, MatSlideToggleModule, MatTooltipModule, MoneyPipe, IconBadge],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Recorrências</h1>
        <button matButton="filled" (click)="add()"><mat-icon>add</mat-icon>Nova recorrência</button>
      </div>
      <p class="muted intro">Pagamentos e recebimentos fixos ou parcelados (diários, semanais, quinzenais, mensais ou anuais). Cada regra cria automaticamente os movimentos futuros como <b>não pagos</b> (12 meses à frente; 3 meses nas frequências curtas); marca-os como pagos quando acontecerem. Para alterar o valor ou a categoria, edita um dos movimentos e escolhe "aplicar aos meses seguintes".</p>

      <div class="card summary">
        <div><span class="muted">Despesas fixas / mês (equiv.)</span><b class="expense">{{ totals().expense | money }}</b></div>
        <div><span class="muted">Receitas fixas / mês (equiv.)</span><b class="income">{{ totals().income | money }}</b></div>
        <div><span class="muted">Resultado</span><b [class.income]="totals().income - totals().expense >= 0" [class.expense]="totals().income - totals().expense < 0">{{ totals().income - totals().expense | money }}</b></div>
      </div>

      <div class="card rows">
        @for (r of list(); track r.id) {
          <div class="row" [class.muted]="!r.active">
            <app-icon-badge [icon]="iconOf(r)" [color]="colorOf(r)" [size]="38" />
            <div class="main">
              <div class="title">{{ r.description || nameOf(r) }}</div>
              <div class="sub">{{ whenOf(r) }} · {{ subOf(r) }}{{ r.end_date && !r.installments ? ' · até ' + fmt(r.end_date) : '' }}{{ r.active ? '' : ' · terminada' }}</div>
            </div>
            <div class="right">
              <div class="amount" [class]="r.kind">{{ (r.kind === 'expense' ? -1 : 1) * r.amount | money:(r.kind === 'transfer' ? 'plain' : 'signed') }}</div>
              @if (r.installments) { <div class="state">{{ r.generated }}/{{ r.installments }} parcelas · total {{ r.total_amount | money }}</div> }
            </div>
            <mat-slide-toggle [checked]="r.active" (change)="toggle(r, $event.checked)" [matTooltip]="r.active ? 'Pausar (apaga os meses futuros por pagar)' : 'Retomar a partir do próximo mês'" />
            <button matIconButton [matMenuTriggerFor]="m"><mat-icon>more_vert</mat-icon></button>
            <mat-menu #m="matMenu">
              <button mat-menu-item [routerLink]="['/movimentos']" [queryParams]="{ q: r.description }"><mat-icon>receipt_long</mat-icon>Ver movimentos</button>
              <button mat-menu-item (click)="remove(r)"><mat-icon>delete</mat-icon>Apagar regra e meses por pagar</button>
            </mat-menu>
          </div>
        } @empty {
          <div class="empty">
            <mat-icon>repeat</mat-icon>
            <p>Ainda não tens recorrências. Cria um movimento e escolhe "Repetir: Fixo" ou "Parcelado".</p>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .intro { margin: -4px 0 16px; font-size: 13.5px; }
    .summary { display: flex; justify-content: space-around; gap: 8px; text-align: center; padding: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .summary div { display: flex; flex-direction: column; font-size: 13px; } .summary b { font-size: 16px; }
    .rows { padding: 4px 12px; }
    .right { display: flex; flex-direction: column; align-items: flex-end; }
    .state { font-size: 11.5px; color: var(--mat-sys-on-surface-variant); white-space: nowrap; }
    @media (max-width: 600px) { .row { flex-wrap: wrap; } .row .main { flex-basis: calc(100% - 50px); } }
  `],
})
export class RecurrencesPage {
  readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly dialog = inject(MatDialog);

  readonly list = computed(() => [...this.data.recurrences()].sort((a, b) => Number(b.active) - Number(a.active) || this.dayOf(a) - this.dayOf(b) || a.description.localeCompare(b.description, 'pt')));
  /** Equivalente mensal das regras ativas (semanal ×52/12, quinzenal ×26/12, diária ×365/12, anual ÷12). */
  readonly totals = computed(() => {
    const perMonth: Record<string, number> = { daily: 365 / 12, weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, yearly: 1 / 12 };
    let income = 0, expense = 0;
    for (const r of this.data.recurrences()) if (r.active && (!r.installments || r.generated < r.installments)) {
      const v = r.amount * (perMonth[r.frequency] ?? 1);
      if (r.kind === 'income') income += v; else if (r.kind === 'expense') expense += v;
    }
    return { income, expense };
  });

  dayOf(r: Recurrence) { return Number(r.start_date.slice(8)); }
  whenOf(r: Recurrence) {
    const f = FREQUENCIES.find((x) => x.id === r.frequency);
    if (r.frequency === 'monthly') return `Dia ${this.dayOf(r)} de cada mês`;
    if (r.frequency === 'yearly') return `Todos os anos a ${this.fmt(r.start_date).slice(0, 5)}`;
    return `${f?.label ?? r.frequency} desde ${this.fmt(r.start_date)}`;
  }
  fmt(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
  private cat(r: Recurrence) { return r.category_id ? this.data.categoryMap().get(r.category_id) : undefined; }
  private acc(id: string | null) { return id ? this.data.accountMap().get(id) : undefined; }
  iconOf(r: Recurrence) { return r.kind === 'transfer' ? 'swap_horiz' : (this.cat(r)?.icon ?? 'label'); }
  colorOf(r: Recurrence) { return r.kind === 'transfer' ? '#78909c' : (this.cat(r)?.color ?? '#90a4ae'); }
  nameOf(r: Recurrence) { return r.kind === 'transfer' ? 'Transferência' : (this.cat(r)?.name ?? (r.kind === 'income' ? 'Receita' : 'Despesa')); }
  subOf(r: Recurrence) {
    if (r.kind === 'transfer') return `${this.acc(r.account_id)?.name ?? '?'} → ${this.acc(r.to_account_id)?.name ?? '?'}`;
    return [this.data.categoryLabel(r.category_id), this.acc(r.account_id)?.name].filter(Boolean).join(' · ');
  }

  add() { openTransactionDialog(this.dialog, { repeat: 'fixed' }); }

  async toggle(r: Recurrence, active: boolean) {
    try { await this.data.setRecurrenceActive(r.id, active); } catch (e) { this.ui.error(e); }
  }

  async remove(r: Recurrence) {
    if (!(await this.ui.confirm('Apagar recorrência?', `Apaga a regra "${r.description || this.nameOf(r)}" e todos os seus movimentos por pagar. Os já pagos ficam.`, 'Apagar'))) return;
    try { await this.data.deleteRecurrence(r.id); } catch (e) { this.ui.error(e); }
  }
}
