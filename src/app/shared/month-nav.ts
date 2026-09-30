import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { monthLabel, shiftMonth, currentMonth } from '../core/dates';

@Component({
  selector: 'app-month-nav',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="nav">
      <button matIconButton (click)="go(-1)" aria-label="Mês anterior"><mat-icon>chevron_left</mat-icon></button>
      <button class="label" type="button" (click)="monthChange.emit(today)" title="Ir para o mês atual">{{ label() }}</button>
      <button matIconButton (click)="go(1)" aria-label="Mês seguinte"><mat-icon>chevron_right</mat-icon></button>
    </div>
  `,
  styles: [`
    .nav { display: inline-flex; align-items: center; gap: 4px; }
    .label { background: none; border: none; font: inherit; font-size: 17px; font-weight: 500; color: inherit; cursor: pointer; padding: 6px 10px; border-radius: 8px; min-width: 150px; }
    .label:hover { background: var(--mat-sys-surface-container-high); }
  `],
})
export class MonthNav {
  readonly month = input.required<string>();
  readonly monthChange = output<string>();
  readonly today = currentMonth();
  label() { return monthLabel(this.month()); }
  go(d: number) { this.monthChange.emit(shiftMonth(this.month(), d)); }
}
