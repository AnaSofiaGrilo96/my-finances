import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheet, MatBottomSheetModule, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataService } from '../../core/data.service';
import { FREQUENCIES, Transaction } from '../../core/models';
import { formatMoney } from '../../shared/money.pipe';
import { addDays, fromIso, todayIso } from '../../core/dates';

const LONG_DATE = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
import { MoneyPipe } from '../../shared/money.pipe';
import { IconBadge } from '../../shared/icon-badge';
import { BackButtonService } from '../../shared/back-button.service';

export type DetailAction = 'delete' | 'duplicate' | 'toggle' | 'edit' | 'notes';

/**
 * Abre o detalhe de um movimento: folha inferior no telemóvel (arrastar para baixo fecha),
 * janela centrada no computador (clique fora fecha). Devolve a ação escolhida ou undefined.
 */
export async function openTransactionDetail(dialog: MatDialog, sheet: MatBottomSheet, back: BackButtonService, t: Transaction): Promise<DetailAction | undefined> {
  const small = window.matchMedia('(max-width: 899px)').matches;
  if (small) {
    const ref = sheet.open(TransactionDetailSheet, { data: t, panelClass: 'detail-sheet' });
    back.track(ref);
    return (await ref.afterDismissed().toPromise()) as DetailAction | undefined;
  }
  // Computador (18/11): janela de 420px centrada, à imagem do painel lateral da outra aplicação de gestão de finanças
  return (await dialog.open(TransactionDetailSheet, { data: t, width: '420px', maxWidth: '94vw', maxHeight: '92vh', panelClass: 'detail-dialog', autoFocus: false }).afterClosed().toPromise()) as DetailAction | undefined;
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
    @if (!isSheet) {
    <!-- Computador (18/11): tipo, descrição, valor com o estado, repetição, lista de dados num bloco cinzento (clicar edita) e,
         em baixo, pagar/receber, editar, duplicar e apagar — como no painel da outra aplicação, mas numa janela centrada -->
    <div class="dk">
      <header class="dk-top">
        <span class="badge" [class]="t().kind">{{ kindLabel() }}</span>
        <button type="button" class="x" (click)="close()" aria-label="Fechar"><mat-icon>close</mat-icon></button>
      </header>
      <h2 class="dk-title">{{ t().description || name() }}</h2>
      <div class="dk-amt">
        <span class="val" [class]="t().kind"><small>€</small>{{ abs() }}</span>
        <span class="st" [class.ok]="t().paid">{{ paidLabel() }}</span>
      </div>
      @if (t().recurrence_id) {
        <div class="rt"><mat-icon>repeat</mat-icon>{{ repLabel() }}@if (freqLabel()) { <span class="dot">·</span><strong>{{ freqLabel() }}</strong> }</div>
      }
      <ul class="flist">
        @if (t().kind === 'transfer') {
          <li (click)="go('edit')"><span class="k">Conta origem</span><span class="v">@if (accObj(t().account_id); as a) { <app-icon-badge [icon]="a.icon" [color]="a.color" [size]="24" /> }{{ acc(t().account_id) }}</span><mat-icon class="chev">chevron_right</mat-icon></li>
          <li (click)="go('edit')"><span class="k">Conta destino</span><span class="v">@if (accObj(t().to_account_id); as a) { <app-icon-badge [icon]="a.icon" [color]="a.color" [size]="24" /> }{{ acc(t().to_account_id) }}</span><mat-icon class="chev">chevron_right</mat-icon></li>
        } @else {
          <li (click)="go('edit')"><span class="k">Categoria</span><span class="v">@if (cat(); as c) { <app-icon-badge [icon]="c.icon" [color]="c.color" [size]="24" /> }{{ data.categoryLabel(t().category_id) || '—' }}</span><mat-icon class="chev">chevron_right</mat-icon></li>
          <li (click)="go('edit')"><span class="k">Conta</span><span class="v">{{ acc(t().account_id) }}</span><mat-icon class="chev">chevron_right</mat-icon></li>
        }
        <li (click)="go('edit')"><span class="k">Data</span><span class="v">{{ longDate() }}</span><mat-icon class="chev">chevron_right</mat-icon></li>
        <li (click)="go('notes')"><span class="k">Observação</span>
          @if (t().notes) { <span class="v note">{{ t().notes }}</span><mat-icon class="chev">chevron_right</mat-icon> } @else { <span class="add"><mat-icon>add</mat-icon>Adicionar</span> }
        </li>
      </ul>
      <footer class="dk-foot">
        <button type="button" class="pay" [class.undo]="t().paid" (click)="go('toggle')">{{ payAction() }}</button>
        <button type="button" class="ib" (click)="go('edit')" matTooltip="Editar" aria-label="Editar"><mat-icon fontSet="material-icons-outlined">edit</mat-icon></button>
        <button type="button" class="ib" (click)="go('duplicate')" matTooltip="Duplicar" aria-label="Duplicar"><mat-icon fontSet="material-icons-outlined">content_copy</mat-icon></button>
        <button type="button" class="ib del" (click)="go('delete')" matTooltip="Apagar" aria-label="Apagar"><mat-icon fontSet="material-icons-outlined">delete</mat-icon></button>
      </footer>
    </div>
    } @else {
    <span class="grab"></span>
    <div class="hero">
      <app-icon-badge [icon]="icon()" [color]="color()" [size]="92" />
      <h2>{{ t().description || name() }}</h2>
      <div class="amount" [class]="t().kind">{{ signed() | money }}</div>
    </div>
    <div class="acts">
      <button type="button" class="act" (click)="go('delete')" matTooltip="Apagar" aria-label="Apagar"><mat-icon fontSet="material-icons-outlined">delete</mat-icon></button>
      <button type="button" class="act" (click)="go('duplicate')" matTooltip="Duplicar" aria-label="Duplicar"><mat-icon fontSet="material-icons-outlined">content_copy</mat-icon></button>
      <button type="button" class="act" [class.on]="t().paid" (click)="go('toggle')" [matTooltip]="paidLabel()" [attr.aria-label]="paidLabel()"><mat-icon fontSet="material-icons-outlined">{{ t().paid ? 'thumb_up' : 'thumb_down' }}</mat-icon></button>
      <button type="button" class="act" (click)="go('edit')" matTooltip="Editar" aria-label="Editar"><mat-icon fontSet="material-icons-outlined">edit</mat-icon></button>
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
    }
  `,
  styles: [`
    :host { display: block; padding: 26px 24px 28px; }
    :host.as-sheet { padding: 8px 24px calc(28px + env(safe-area-inset-bottom)); touch-action: pan-y; }
    .grab { display: block; width: 44px; height: 4px; border-radius: 2px; background: var(--mat-sys-outline-variant); margin: 0 auto 26px; }
    .hero { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; }
    .hero h2 { margin: 6px 0 0; font-size: 22px; font-weight: 600; }
    .amount { font-size: 22px; font-weight: 600; }
    .amount.expense { color: #e5484d; } .amount.income { color: #1eb980; } .amount.transfer { color: var(--mat-sys-on-surface-variant); }
    /* 10/11 (como na app Android da outra aplicação): círculos mais pequenos com ícones de contorno */
    .acts { display: flex; justify-content: space-evenly; gap: 12px; margin: 26px auto 8px; max-width: 360px; }
    .act { width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--mat-sys-surface-container-highest); color: var(--mat-sys-on-surface); display: grid; place-items: center; cursor: pointer; }
    .act mat-icon { font-size: 24px; width: 24px; height: 24px; }
    .act.on { color: #1eb980; }
    hr { border: none; border-top: 1px solid var(--mat-sys-outline-variant); margin: 22px 0 20px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 24px; }
    .cell { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .k { font-size: 15px; color: var(--mat-sys-on-surface-variant); }
    .v { font-size: 17px; font-weight: 500; overflow-wrap: anywhere; }
    .link { background: none; border: none; padding: 0; text-align: left; color: var(--mat-sys-primary); font: inherit; font-size: 17px; font-weight: 500; cursor: pointer; }
    /* ---- computador (18/11) ---- */
    :host:not(.as-sheet) { padding: 0; }
    .dk { display: flex; flex-direction: column; padding: 24px 28px 28px; color: var(--ink, var(--mat-sys-on-surface)); }
    .dk-top { display: flex; align-items: center; justify-content: space-between; }
    .badge { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 10px; background: var(--app-bg); color: var(--ink-soft); }
    .badge.expense { color: var(--neg); } .badge.income { color: var(--pos); } .badge.transfer { color: var(--bal); }
    .x { width: 32px; height: 32px; border-radius: 50%; border: none; background: var(--app-bg); color: var(--ink); display: grid; place-items: center; cursor: pointer; padding: 0; }
    .x mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .dk-title { margin: 14px 0 6px; font-size: 20px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
    .dk-amt { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .dk-amt .val { font-size: 30px; font-weight: 700; letter-spacing: -.3px; color: var(--ink) !important; }
    .dk-amt .val small { font-size: 18px; font-weight: 600; margin-right: 4px; }
    .st { height: 26px; display: inline-flex; align-items: center; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: color-mix(in srgb, var(--ink-soft) 14%, transparent); color: var(--ink-2); }
    .st.ok { background: color-mix(in srgb, var(--pos) 14%, transparent); color: var(--pos); }
    .rt { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 22px; height: 40px; border-radius: 12px; background: var(--app-bg); font-size: 14px; font-weight: 600; }
    .rt mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--ink-2); }
    .rt .dot { color: var(--ink-soft); } .rt strong { color: var(--pos); font-weight: 600; }
    .flist { list-style: none; margin: 22px 0 0; padding: 0 14px; border-radius: 16px; background: var(--app-bg); }
    .flist li { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 12px 0; box-sizing: border-box; cursor: pointer; }
    .flist li + li { border-top: 1px solid color-mix(in srgb, var(--ink-soft) 18%, transparent); }
    .flist .k { flex: 0 0 96px; font-size: 13px; font-weight: 400; color: var(--ink-soft); }
    .flist .v { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 8px; font-size: 14px; font-weight: 600; text-align: right; }
    .flist .v.note { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
    .flist .chev { font-size: 20px; width: 20px; height: 20px; color: var(--ink-soft); flex-shrink: 0; margin-right: -4px; }
    @media (hover: hover) { .flist li:hover .chev { color: var(--ink); } .flist li:hover .v { text-decoration: underline; text-decoration-color: var(--line-strong); } }
    .flist .add { flex: 1; display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; color: var(--pos); font-size: 14px; font-weight: 600; }
    .flist .add mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .dk-foot { display: flex; align-items: center; gap: 8px; margin-top: 28px; }
    .pay { flex: 1; height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 14px; border: none; background: var(--pos); color: #fff; font: inherit; font-size: 15px; font-weight: 600; white-space: nowrap; padding: 0 12px; cursor: pointer; transition: filter .15s, transform .12s; }
    .pay.undo { background: transparent; color: var(--ink); border: 1px solid var(--line-strong); }
    .pay mat-icon { font-size: 20px; width: 20px; height: 20px; }
    @media (hover: hover) { .pay:hover { filter: brightness(.96); } .pay.undo:hover { background: var(--app-bg); } }
    .ib { width: 48px; height: 48px; flex-shrink: 0; border-radius: 14px; border: none; background: var(--app-bg); color: var(--ink-2); display: grid; place-items: center; cursor: pointer; transition: filter .15s, transform .12s; }
    .ib mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .ib.del { color: var(--neg); }
    @media (hover: hover) { .ib:hover { filter: brightness(.95); } }
    .pay:active, .ib:active { transform: scale(.96); }
    /* telemóvel (22/10): letra 1–2px mais pequena (gerado a partir dos tamanhos acima) */
    @media (max-width: 899px) { .hero h2 { font-size: 20px; } .amount { font-size: 20px; } .k { font-size: 13px; } .v { font-size: 15px; } .link { font-size: 15px; } }
  `],
})
export class TransactionDetailSheet {
  readonly data = inject(DataService);
  private readonly sheetRef = inject(MatBottomSheetRef<TransactionDetailSheet>, { optional: true });
  private readonly dialogRef = inject(MatDialogRef<TransactionDetailSheet>, { optional: true });
  private readonly el = inject(ElementRef<HTMLElement>);
  readonly isSheet = !!this.sheetRef;
  readonly t = signal<Transaction>(inject<Transaction>(MAT_BOTTOM_SHEET_DATA, { optional: true }) ?? inject<Transaction>(MAT_DIALOG_DATA));

  private closeWith(result?: DetailAction) {
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
    if (dy > 110) { p.style.transform = `translateY(${p.offsetHeight}px)`; setTimeout(() => this.closeWith(), 180); }
    else p.style.transform = '';
  }

  close() { this.closeWith(); }
  accObj(id: string | null) { return id ? this.data.accountMap().get(id) : undefined; }
  kindLabel() { return this.t().kind === 'expense' ? 'Despesa' : this.t().kind === 'income' ? 'Receita' : 'Transferência'; }
  /** Valor sem sinal nem símbolo (o € aparece à parte, mais pequeno). */
  abs() { return formatMoney(this.t().amount).replace('€', '').replace('-', '').trim(); }
  readonly rec = computed(() => this.data.recurrences().find((r) => r.id === this.t().recurrence_id) ?? null);
  repLabel() {
    const t = this.t();
    if (t.installment_no) return `Parcela ${t.installment_no}${this.installments() ? '/' + this.installments() : ''}`;
    return t.kind === 'income' ? 'Receita fixa' : t.kind === 'transfer' ? 'Transferência fixa' : 'Despesa fixa';
  }
  freqLabel() { const f = this.rec()?.frequency; return f ? (FREQUENCIES.find((x) => x.id === f)?.label.toLowerCase() ?? '') : ''; }
  longDate() { const d = fromIso(this.t().date); const s = LONG_DATE.format(d); return s.replace(/ de (\p{L})/u, (m, c) => ' de ' + c.toUpperCase()); }
  payAction() { const inc = this.t().kind !== 'expense'; return this.t().paid ? (inc ? 'Desfazer recebimento' : 'Desfazer pagamento') : (inc ? 'Marcar como recebido' : 'Marcar como pago'); }

  cat() { return this.t().category_id ? this.data.categoryMap().get(this.t().category_id!) : undefined; }
  icon() { return this.t().kind === 'transfer' ? 'swap_horiz' : (this.cat()?.icon ?? 'label'); }
  color() { return this.t().kind === 'transfer' ? '#78909c' : (this.cat()?.color ?? '#90a4ae'); }
  name() { return this.t().kind === 'transfer' ? 'Transferência' : (this.cat()?.name ?? (this.t().kind === 'income' ? 'Receita' : 'Despesa')); }
  signed() { return (this.t().kind === 'expense' ? -1 : 1) * this.t().amount; }
  acc(id: string | null) { return id ? (this.data.accountMap().get(id)?.name ?? '—') : '—'; }
  readonly installments = computed(() => this.data.recurrences().find((r) => r.id === this.t().recurrence_id)?.installments ?? null);
  paidLabel() { return this.t().kind !== 'expense' ? (this.t().paid ? 'Recebido' : 'Não recebido') : (this.t().paid ? 'Pago' : 'Não pago'); }
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
    this.closeWith(a);
  }
}
