import { Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { currentMonth, shiftMonth } from '../core/dates';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/**
 * Seletor de mês em fita: ‹ Setembro [Outubro] Novembro ›
 * O mês selecionado fica numa "pílula" ao centro; os vizinhos são clicáveis.
 * Em modo 'year' navega ano a ano.
 */
@Component({
  selector: 'app-month-nav',
  imports: [MatIconModule],
  template: `
    <div class="strip" [class.year]="mode() === 'year'">
      <button type="button" class="arrow" (click)="go(-1)" [attr.aria-label]="mode() === 'year' ? 'Ano anterior' : 'Mês anterior'"><mat-icon>chevron_left</mat-icon></button>
      <button type="button" class="side" (click)="go(-1)">{{ label(-1) }}</button>
      <button type="button" class="pill" (click)="monthChange.emit(today)" [title]="'Ir para ' + (mode() === 'year' ? 'o ano atual' : 'o mês atual')">
        {{ label(0) }}@if (mode() === 'month' && year() !== todayYear) { <small>{{ year() }}</small> }
      </button>
      <button type="button" class="side" (click)="go(1)">{{ label(1) }}</button>
      <button type="button" class="arrow" (click)="go(1)" [attr.aria-label]="mode() === 'year' ? 'Ano seguinte' : 'Mês seguinte'"><mat-icon>chevron_right</mat-icon></button>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .strip { display: grid; grid-template-columns: 36px 1fr auto 1fr 36px; align-items: center; gap: 4px; width: 100%; }
    button { background: none; border: none; font: inherit; color: inherit; cursor: pointer; padding: 0; border-radius: 999px; min-height: 40px; }
    .arrow { display: grid; place-items: center; color: var(--mat-sys-on-surface-variant); }
    .arrow:hover, .side:hover { background: var(--mat-sys-surface-container-high); }
    .side { color: var(--mat-sys-on-surface-variant); font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 6px; }
    .pill { font-size: 16px; font-weight: 600; padding: 8px 20px; border: 1.5px solid var(--mat-sys-outline-variant); background: var(--mat-sys-surface-container-lowest); white-space: nowrap; }
    html.dark .pill { background: var(--mat-sys-surface-container-high); }
    .pill small { font-weight: 400; font-size: 12px; margin-left: 6px; color: var(--mat-sys-on-surface-variant); }
    @media (min-width: 900px) { .strip { width: auto; grid-template-columns: 36px 120px auto 120px 36px; } }
  `],
})
export class MonthNav {
  readonly month = input.required<string>();    // 'YYYY-MM'
  readonly mode = input<'month' | 'year'>('month');
  readonly monthChange = output<string>();
  readonly today = currentMonth();
  readonly todayYear = Number(this.today.slice(0, 4));
  readonly year = computed(() => Number(this.month().slice(0, 4)));

  label(delta: number) {
    if (this.mode() === 'year') return String(this.year() + delta);
    const m = shiftMonth(this.month(), delta);
    return MONTHS[Number(m.slice(5, 7)) - 1];
  }
  go(d: number) { this.monthChange.emit(shiftMonth(this.month(), this.mode() === 'year' ? 12 * d : d)); }
}
