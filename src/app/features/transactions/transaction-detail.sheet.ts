import { Component, computed, inject, signal } from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetModule, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataService } from '../../core/data.service';
import { Transaction } from '../../core/models';
import { addDays, todayIso } from '../../core/dates';
import { MoneyPipe } from '../../shared/money.pipe';
import { IconBadge } from '../../shared/icon-badge';

export type DetailAction = 'delete' | 'duplicate' | 'toggle' | 'edit' | 'notes';

/** Folha de detalhe de um movimento: ícone, descrição, valor, 4 ações e os dados principais. */
@Component({
  selector: 'app-transaction-detail-sheet',
  imports: [MatBottomSheetModule, MatIconModule, MatTooltipModule, MoneyPipe, IconBadge],
  template: `
    <span class="grab"></span>
    <div class="hero">
      <app-icon-badge [icon]="icon()" [color]="color()" [size]="92" />
      <h2>{{ t().description || name() }}</h2>
      <div class="amount" [class]="t().kind">{{ signed() | money }}</div>
    </div>
    <div class="acts">
      <button type="button" class="act" (click)="go('delete')" matTooltip="Apagar" aria-label="Apagar"><mat-icon>delete</mat-icon></button>
      <button type="button" class="act" (click)="go('duplicate')" matTooltip="Duplicar" aria-label="Duplicar"><mat-icon>content_copy</mat-icon></button>
      <button type="button" class="act" [class.on]="t().paid" (click)="go('toggle')" [matTooltip]="paidLabel()" [attr.aria-label]="paidLabel()"><mat-icon>{{ t().paid ? 'thumb_up' : 'thumb_down' }}</mat-icon></button>
      <button type="button" class="act" (click)="go('edit')" matTooltip="Editar" aria-label="Editar"><mat-icon>edit</mat-icon></button>
    </div>
    <hr />
    <div class="grid">
      <div class="cell"><span class="k">Data</span><span class="v">{{ dateLabel() }}</span></div>
      <div class="cell"><span class="k">Estado</span><span class="v">{{ paidLabel().toLowerCase() }}</span></div>
      @if (t().kind === 'transfer') {
        <div class="cell"><span class="k">Conta origem</span><span class="v">{{ acc(t().account_id) }}</span></div>
        <div class="cell"><span class="k">Conta destino</span><span class="v">{{ acc(t().to_account_id) }}</span></div>
      } @else {
        <div class="cell"><span class="k">Conta</span><span class="v">{{ acc(t().account_id) }}</span></div>
        <div class="cell"><span class="k">Categoria</span><span class="v">{{ data.categoryLabel(t().category_id) || '—' }}</span></div>
      }
      <div class="cell">
        <span class="k">Observação</span>
        @if (t().notes) { <span class="v">{{ t().notes }}</span> } @else { <button type="button" class="link" (click)="go('notes')">Adicionar</button> }
      </div>
      @if (t().recurrence_id) {
        <div class="cell"><span class="k">Repetição</span><span class="v">{{ t().installment_no ? 'Parcela ' + t().installment_no + (installments() ? '/' + installments() : '') : 'Recorrente' }}</span></div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; padding: 8px 24px calc(28px + env(safe-area-inset-bottom)); }
    .grab { display: block; width: 44px; height: 4px; border-radius: 2px; background: var(--mat-sys-outline-variant); margin: 0 auto 26px; }
    .hero { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; }
    .hero h2 { margin: 6px 0 0; font-size: 22px; font-weight: 600; }
    .amount { font-size: 22px; font-weight: 600; }
    .amount.expense { color: #e5484d; } .amount.income { color: #1eb980; } .amount.transfer { color: var(--mat-sys-on-surface-variant); }
    .acts { display: flex; justify-content: space-between; gap: 12px; margin: 26px auto 8px; max-width: 420px; }
    .act { width: 68px; height: 68px; border-radius: 50%; border: none; background: var(--mat-sys-surface-container-highest); color: var(--mat-sys-on-surface); display: grid; place-items: center; cursor: pointer; }
    .act mat-icon { font-size: 28px; width: 28px; height: 28px; }
    .act.on { color: #1eb980; }
    hr { border: none; border-top: 1px solid var(--mat-sys-outline-variant); margin: 22px 0 20px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 24px; }
    .cell { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .k { font-size: 15px; color: var(--mat-sys-on-surface-variant); }
    .v { font-size: 17px; font-weight: 500; overflow-wrap: anywhere; }
    .link { background: none; border: none; padding: 0; text-align: left; color: var(--mat-sys-primary); font: inherit; font-size: 17px; font-weight: 500; cursor: pointer; }
    @media (min-width: 900px) { :host { max-width: 520px; margin: 0 auto; } }
  `],
})
export class TransactionDetailSheet {
  readonly data = inject(DataService);
  private readonly ref = inject(MatBottomSheetRef<TransactionDetailSheet>);
  readonly t = signal(inject<Transaction>(MAT_BOTTOM_SHEET_DATA));

  private cat() { return this.t().category_id ? this.data.categoryMap().get(this.t().category_id!) : undefined; }
  icon() { return this.t().kind === 'transfer' ? 'swap_horiz' : (this.cat()?.icon ?? 'label'); }
  color() { return this.t().kind === 'transfer' ? '#78909c' : (this.cat()?.color ?? '#90a4ae'); }
  name() { return this.t().kind === 'transfer' ? 'Transferência' : (this.cat()?.name ?? (this.t().kind === 'income' ? 'Receita' : 'Despesa')); }
  signed() { return (this.t().kind === 'expense' ? -1 : 1) * this.t().amount; }
  acc(id: string | null) { return id ? (this.data.accountMap().get(id)?.name ?? '—') : '—'; }
  readonly installments = computed(() => this.data.recurrences().find((r) => r.id === this.t().recurrence_id)?.installments ?? null);
  paidLabel() { return this.t().kind === 'income' ? (this.t().paid ? 'Recebido' : 'Não recebido') : (this.t().paid ? 'Pago' : 'Não pago'); }
  dateLabel() {
    const iso = this.t().date, today = todayIso();
    if (iso === today) return 'hoje';
    if (iso === addDays(today, -1)) return 'ontem';
    if (iso === addDays(today, 1)) return 'amanhã';
    const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`;
  }
  /** O polegar alterna sem fechar a folha; as outras ações fecham e devolvem a escolha à lista. */
  go(a: DetailAction) {
    if (a === 'toggle') { this.t.update((x) => ({ ...x, paid: !x.paid })); this.ref.dismiss('toggle'); return; }
    this.ref.dismiss(a);
  }
}
