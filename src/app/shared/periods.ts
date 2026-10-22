import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { addDays, currentMonth, fromIso, monthRange, shiftMonth, todayIso, toIso } from '../core/dates';

/** Períodos rápidos partilhados por Relatórios e Movimentos (22/10). */
export type Period = 'today' | 'week' | 'month' | '3m' | '6m' | '12m' | 'year' | 'custom';
export const PERIODS: { id: Period; label: string; icon: string }[] = [
  { id: 'today', label: 'Hoje', icon: 'today' },
  { id: 'week', label: 'Esta semana', icon: 'date_range' },
  { id: 'month', label: 'Este mês', icon: 'calendar_view_month' },
  { id: '3m', label: 'Últimos 3 meses', icon: 'history' },
  { id: '6m', label: 'Últimos 6 meses', icon: 'history' },
  { id: '12m', label: 'Últimos 12 meses', icon: 'history' },
  { id: 'year', label: 'Este ano', icon: 'calendar_today' },
  { id: 'custom', label: 'Escolher período', icon: 'edit_calendar' },
];

/** Intervalo { start, end, next } de um período. `month` é o mês da roda (para "Este mês"/"Este ano"). */
export function periodRange(p: Period, month: string, custom: { start: string; end: string } | null) {
  const today = todayIso();
  const mk = (start: string, end: string) => ({ start, end, next: addDays(end, 1) });
  switch (p) {
    case 'today': return mk(today, today);
    // Semana de domingo a sábado, como na outra aplicação de gestão de finanças (pedido da Ana, 08/10)
    case 'week': { const sun = addDays(today, -fromIso(today).getDay()); return mk(sun, addDays(sun, 6)); }
    case 'month': return monthRange(month);
    case 'year': { const y = month.slice(0, 4); return mk(`${y}-01-01`, `${y}-12-31`); }
    // "Últimos N meses" = o mês atual MAIS os N anteriores (N+1 meses de calendário), como na outra aplicação — confirmado ao cêntimo a 08/10
    case '3m': case '6m': case '12m': { const n = Number(p.slice(0, -1)); const cur = currentMonth(); return mk(monthRange(shiftMonth(cur, -n)).start, monthRange(cur).end); }
    case 'custom': return custom ? mk(custom.start, custom.end) : monthRange(month);
  }
}

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

