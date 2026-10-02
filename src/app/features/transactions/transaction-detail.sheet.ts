import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheet, MatBottomSheetModule, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataService } from '../../core/data.service';
import { Transaction } from '../../core/models';
import { addDays, todayIso } from '../../core/dates';
import { MoneyPipe } from '../../shared/money.pipe';
import { IconBadge } from '../../shared/icon-badge';

export type DetailAction = 'delete' | 'duplicate' | 'toggle' | 'edit' | 'notes';

/**
 * Abre o detalhe de um movimento: folha inferior no telemóvel (arrastar para baixo fecha),
 * janela centrada no computador (clique fora fecha). Devolve a ação escolhida ou undefined.
 */
export async function openTransactionDetail(dialog: MatDialog, sheet: MatBottomSheet, t: Transaction): Promise<DetailAction | undefined> {
  const small = window.matchMedia('(max-width: 899px)').matches;
  if (small) return (await sheet.open(TransactionDetailSheet, { data: t, panelClass: 'detail-sheet' }).afterDismissed().toPromise()) as DetailAction | undefined;
  return (await dialog.open(TransactionDetailSheet, { data: t, width: '480px', maxWidth: '92vw', panelClass: 'detail-dialog', autoFocus: false }).afterClosed().toPromise()) as DetailAction | undefined;
}

/** Detalhe de um movimento: ícone, descrição, valor, 4 ações e os dados principais. */
@Component({
  selector: 'app-transaction-detail-sheet',
  imports: [MatBottomSheetModule, MatDialogModule, MatIconModule, MatTooltipModule, MoneyPipe, IconBadge],
  host: {
    '[class.as-sheet]': 'isSheet',
    '(touchstart)': 'dragStart($event)',
    '(touchmove)': 'dragMove($event)',
    '(touchend)': 'dragEnd()',
    '(touchcancel)': 'dragEnd()',
  },
  template: `
    @if (isSheet) { <span class="grab"></span> }
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
    :host { display: block; padding: 26px 24px 28px; }
    :host.as-sheet { padding: 8px 24px calc(28px + env(safe-area-inset-bottom)); touch-action: pan-y; }
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
  `],
})
export class TransactionDetailSheet {
  readonly data = inject(DataService);
  private readonly sheetRef = inject(MatBottomSheetRef<TransactionDetailSheet>, { optional: true });
  private readonly dialogRef = inject(MatDialogRef<TransactionDetailSheet>, { optional: true });
  private readonly el = inject(ElementRef<HTMLElement>);
  readonly isSheet = !!this.sheetRef;
  readonly t = signal<Transaction>(inject<Transaction>(MAT_BOTTOM_SHEET_DATA, { optional: true }) ?? inject<Transaction>(MAT_DIALOG_DATA));

  private close(result?: DetailAction) {
    if (this.sheetRef) this.sheetRef.dismiss(result); else this.dialogRef?.close(result);
  }

  // ---- arrastar para baixo fecha a folha (telemóvel) ----
  private dragY: number | null = null;
  private dragDy = 0;
  /** O contentor da folha (elemento Material à volta do componente) é o que se move. */
  private panel(): HTMLElement | null { return this.isSheet ? (this.el.nativeElement.parentElement as HTMLElement | null) : null; }
  dragStart(ev: TouchEvent) {
    if (!this.isSheet || ev.touches.length !== 1) return;
    this.dragY = ev.touches[0].clientY; this.dragDy = 0;
    const p = this.panel(); if (p) p.style.transition = 'none';
  }
  dragMove(ev: TouchEvent) {
    if (this.dragY === null) return;
    this.dragDy = Math.max(0, ev.touches[0].clientY - this.dragY);
    const p = this.panel(); if (p) p.style.transform = `translateY(${this.dragDy}px)`;
  }
  dragEnd() {
    if (this.dragY === null) return;
    const p = this.panel(); const dy = this.dragDy; this.dragY = null;
    if (!p) return;
    p.style.transition = 'transform .22s ease-out';
    if (dy > 110) { p.style.transform = `translateY(${p.offsetHeight}px)`; setTimeout(() => this.close(), 180); }
    else p.style.transform = '';
  }

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
    if (a === 'toggle') this.t.update((x) => ({ ...x, paid: !x.paid }));
    this.close(a);
  }
}
