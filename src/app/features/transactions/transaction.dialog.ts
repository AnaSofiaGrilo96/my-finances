import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataService } from '../../core/data.service';
import { FREQUENCIES, Frequency, Transaction, TransactionKind, splitInstallments } from '../../core/models';
import { addDays, fromIso, occurrenceDate, todayIso, toIso } from '../../core/dates';
import { UiService } from '../../shared/ui.service';
import { IconBadge } from '../../shared/icon-badge';
import { formatMoney } from '../../shared/money.pipe';

export interface TransactionDialogData {
  transaction?: Transaction;
  kind?: TransactionKind;
  date?: string;
  accountId?: string;
  repeat?: 'none' | 'fixed' | 'installments';
}

type RepeatMode = 'none' | 'fixed' | 'installments';

@Component({
  selector: 'app-transaction-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule, MatSlideToggleModule, MatIconModule, MatCheckboxModule, MatTooltipModule, IconBadge],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? 'Editar movimento' : 'Novo movimento' }}</h2>
    <mat-dialog-content>
      <mat-button-toggle-group class="kinds" [value]="kind()" (change)="setKind($event.value)" [disabled]="isEdit" hideSingleSelectionIndicator>
        <mat-button-toggle value="expense"><mat-icon>arrow_downward</mat-icon> Despesa</mat-button-toggle>
        <mat-button-toggle value="income"><mat-icon>arrow_upward</mat-icon> Receita</mat-button-toggle>
        <mat-button-toggle value="transfer"><mat-icon>swap_horiz</mat-icon> Transferência</mat-button-toggle>
      </mat-button-toggle-group>

      <form class="form" (ngSubmit)="save()">
        <mat-form-field class="amount" [class]="kind()" floatLabel="always">
          <mat-label>{{ repeat === 'installments' && !isEdit ? 'Valor total' : 'Valor' }}</mat-label>
          <span matTextPrefix>€&nbsp;</span>
          <input matInput type="number" inputmode="decimal" step="0.01" min="0" [(ngModel)]="amount" name="amount" required autofocus />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Descrição</mat-label>
          <input matInput [(ngModel)]="description" name="description" [placeholder]="kind() === 'transfer' ? 'Ex.: Poupança mensal' : 'Ex.: Continente'" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Data</mat-label>
          <input matInput [matDatepicker]="dp" [(ngModel)]="dateValue" name="date" required />
          <mat-datepicker-toggle matIconSuffix [for]="dp" />
          <mat-datepicker #dp />
        </mat-form-field>

        <mat-form-field>
          <mat-label>{{ kind() === 'transfer' ? 'Da conta' : 'Conta' }}</mat-label>
          <mat-select [(ngModel)]="accountId" name="account" required>
            @for (a of data.activeAccounts(); track a.id) {
              <mat-option [value]="a.id"><span class="opt"><app-icon-badge [icon]="a.icon" [color]="a.color" [size]="22" />{{ a.name }}</span></mat-option>
            }
          </mat-select>
        </mat-form-field>

        @if (kind() === 'transfer') {
          <mat-form-field>
            <mat-label>Para a conta</mat-label>
            <mat-select [(ngModel)]="toAccountId" name="toAccount" required>
              @for (a of data.activeAccounts(); track a.id) {
                @if (a.id !== accountId) {
                  <mat-option [value]="a.id"><span class="opt"><app-icon-badge [icon]="a.icon" [color]="a.color" [size]="22" />{{ a.name }}</span></mat-option>
                }
              }
            </mat-select>
          </mat-form-field>
        } @else {
          <mat-form-field>
            <mat-label>Categoria</mat-label>
            <mat-select [(ngModel)]="categoryId" name="category">
              <mat-option [value]="null"><em>Sem categoria</em></mat-option>
              @for (g of groups(); track g.parent.id) {
                @if (!g.parent.archived) {
                  <mat-option [value]="g.parent.id"><span class="opt"><app-icon-badge [icon]="g.parent.icon" [color]="g.parent.color" [size]="22" />{{ g.parent.name }}</span></mat-option>
                }
                @for (c of g.children; track c.id) {
                  <mat-option [value]="c.id"><span class="opt sub"><app-icon-badge [icon]="c.icon" [color]="c.color" [size]="18" />{{ c.name }}</span></mat-option>
                }
              }
            </mat-select>
          </mat-form-field>
        }

        <div class="toggles">
          <mat-slide-toggle [(ngModel)]="paid" name="paid">{{ kind() === 'income' ? 'Recebido' : 'Pago' }}</mat-slide-toggle>
          <span class="spacer"></span>
          @if (!showNotes) {
            <button type="button" matButton (click)="showNotes = true"><mat-icon>notes</mat-icon>Observação</button>
          }
        </div>

        @if (showNotes) {
          <mat-form-field>
            <mat-label>Observação</mat-label>
            <textarea matInput rows="2" [(ngModel)]="notes" name="notes"></textarea>
          </mat-form-field>
        }

        <!-- ---------- Repetição ---------- -->
        @if (!isEdit) {
          <div class="section-label">Repetir</div>
          <mat-button-toggle-group class="kinds" [(ngModel)]="repeat" name="repeat" hideSingleSelectionIndicator>
            <mat-button-toggle value="none">Não</mat-button-toggle>
            <mat-button-toggle value="fixed">Fixo</mat-button-toggle>
            <mat-button-toggle value="installments">Parcelado</mat-button-toggle>
          </mat-button-toggle-group>

          @if (repeat !== 'none') {
            <div class="repeat-row">
              <mat-form-field class="small" subscriptSizing="dynamic">
                <mat-label>Frequência</mat-label>
                <mat-select [(ngModel)]="frequency" name="frequency">
                  @for (f of frequencies; track f.id) { <mat-option [value]="f.id">{{ f.label }}</mat-option> }
                </mat-select>
              </mat-form-field>
              @if (repeat === 'installments') {
                <mat-form-field class="small" subscriptSizing="dynamic">
                  <mat-label>Parcelas</mat-label>
                  <input matInput type="number" min="2" max="360" [(ngModel)]="installments" name="installments" />
                </mat-form-field>
              } @else {
                <mat-form-field class="small" subscriptSizing="dynamic">
                  <mat-label>Terminar após</mat-label>
                  <input matInput type="number" min="2" max="1000" [(ngModel)]="times" name="times" placeholder="sem fim" />
                  <span matTextSuffix>vezes</span>
                </mat-form-field>
              }
            </div>
            <p class="hint">
              @if (repeat === 'installments') {
                @if (preview(); as p) {
                  <b>{{ p.n }}× {{ p.each }}</b> {{ freqEach() }}, de {{ p.first }} a {{ p.last }}.
                  @if (p.rest) { A última parcela é {{ p.lastAmount }} para acertar o total. }
                } @else { Indica o valor total e o número de parcelas. }
              } @else {
                Repete-se {{ freqEach() }}{{ times && times > 1 ? ', ' + times + ' vezes' : ', sem fim' }}. Os próximos aparecem em Movimentos como <b>não pagos</b>.
              }
            </p>
          }
        } @else if (tx?.recurrence_id && recurrence(); as r) {
          <div class="rec-box">
            <mat-icon>repeat</mat-icon>
            <div>
              <div>
                @if (r.installments) { Parcela {{ tx!.installment_no }}/{{ r.installments }} }
                @else { Recorrência {{ freqLabel(r.frequency).toLowerCase() }}{{ r.active ? '' : ' (terminada)' }} }
              </div>
              <mat-checkbox [(ngModel)]="applyToFollowing" name="applyToFollowing">Aplicar as alterações também às seguintes por pagar</mat-checkbox>
            </div>
          </div>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions>
      @if (isEdit) {
        <button matIconButton (click)="remove()" matTooltip="Apagar" aria-label="Apagar" [disabled]="busy()"><mat-icon>delete</mat-icon></button>
        @if (tx?.recurrence_id) {
          <button matButton (click)="removeSeries()" [disabled]="busy()">Terminar a partir daqui</button>
        }
      }
      <span class="spacer"></span>
      <button matButton mat-dialog-close [disabled]="busy()">Cancelar</button>
      <button matButton="filled" (click)="save()" [disabled]="busy() || !valid()">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .kinds { display: flex; width: 100%; margin-bottom: 16px; }
    .kinds mat-button-toggle { flex: 1; }
    .kinds mat-icon { font-size: 18px; width: 18px; height: 18px; vertical-align: -3px; margin-right: 2px; }
    .form { display: flex; flex-direction: column; }
    .amount input { font-size: 24px; font-weight: 500; }
    .amount.expense input { color: #e5484d; } .amount.income input { color: #1eb980; }
    .toggles { display: flex; gap: 12px; align-items: center; margin: 4px 0 14px; }
    .opt { display: inline-flex; align-items: center; gap: 8px; }
    .opt.sub { padding-left: 22px; font-size: 14px; }
    .section-label { font-size: 12px; color: var(--mat-sys-on-surface-variant); margin: 4px 0 8px; }
    .small { max-width: 220px; flex: 1; }
    .repeat-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
    .hint { font-size: 12.5px; color: var(--mat-sys-on-surface-variant); margin: 0 0 8px; }
    .rec-box { display: flex; gap: 10px; align-items: flex-start; background: var(--mat-sys-surface-container); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; font-size: 13.5px; }
    .rec-box mat-icon { color: var(--mat-sys-primary); margin-top: 2px; }
    mat-dialog-actions { padding: 8px 24px 16px; }
  `],
})
export class TransactionDialog {
  readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly ref = inject(MatDialogRef<TransactionDialog>);
  private readonly input = inject<TransactionDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};

  readonly tx = this.input.transaction;
  readonly isEdit = !!this.tx;
  readonly busy = signal(false);
  readonly kind = signal<TransactionKind>(this.tx?.kind ?? this.input.kind ?? 'expense');
  readonly frequencies = FREQUENCIES;

  amount: number | null = this.tx?.amount ?? null;
  description = this.tx?.description ?? '';
  dateValue: Date = fromIso(this.tx?.date ?? this.input.date ?? todayIso());
  accountId: string | null = this.tx?.account_id ?? this.input.accountId ?? this.data.activeAccounts()[0]?.id ?? null;
  toAccountId: string | null = this.tx?.to_account_id ?? null;
  categoryId: string | null = this.tx?.category_id ?? null;
  paid = this.tx?.paid ?? true;
  notes = this.tx?.notes ?? '';
  showNotes = !!this.tx?.notes;
  repeat: RepeatMode = this.input.repeat ?? 'none';
  frequency: Frequency = 'monthly';
  installments: number | null = 12;
  times: number | null = null;
  applyToFollowing = false;

  readonly recurrence = computed(() => this.data.recurrences().find((r) => r.id === this.tx?.recurrence_id) ?? null);
  readonly groups = computed(() => (this.kind() === 'income' ? this.data.incomeGroups() : this.data.expenseGroups()));

  setKind(k: TransactionKind) {
    this.kind.set(k);
    this.categoryId = null;
  }

  freqLabel(f: Frequency) { return FREQUENCIES.find((x) => x.id === f)?.label ?? f; }
  freqEach() { return FREQUENCIES.find((x) => x.id === this.frequency)?.each ?? ''; }

  /** Pré-visualização do parcelamento: "12× € 50,00, de 01/10/2026 a 01/09/2027". */
  preview() {
    const n = Math.floor(Number(this.installments) || 0);
    const total = Number(this.amount) || 0;
    if (n < 2 || total <= 0 || !this.dateValue) return null;
    const parts = splitInstallments(total, n);
    const start = toIso(this.dateValue);
    const fmt = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
    return { n, each: formatMoney(parts[0]), lastAmount: formatMoney(parts[n - 1]), rest: parts[n - 1] !== parts[0], first: fmt(start), last: fmt(occurrenceDate(start, this.frequency, n - 1)) };
  }

  valid(): boolean {
    if (!this.amount || this.amount <= 0 || !this.accountId || !this.dateValue) return false;
    if (this.kind() === 'transfer' && (!this.toAccountId || this.toAccountId === this.accountId)) return false;
    if (!this.isEdit && this.repeat === 'installments' && !this.preview()) return false;
    return true;
  }

  private payload(date: string): Omit<Transaction, 'id'> {
    return {
      date,
      kind: this.kind(),
      amount: Math.round(Number(this.amount) * 100) / 100,
      description: this.description.trim(),
      account_id: this.accountId!,
      to_account_id: this.kind() === 'transfer' ? this.toAccountId : null,
      category_id: this.kind() === 'transfer' ? null : this.categoryId,
      paid: this.paid,
      notes: this.notes.trim() || null,
      tags: this.tx?.tags ?? [],
      recurrence_id: this.tx?.recurrence_id ?? null,
      installment_no: this.tx?.installment_no ?? null,
    };
  }

  async save() {
    if (!this.valid()) return;
    this.busy.set(true);
    try {
      const date = toIso(this.dateValue);
      const p = this.payload(date);
      if (this.isEdit) {
        await this.data.saveTransaction({ id: this.tx!.id, ...p });
        if (this.applyToFollowing && this.tx!.recurrence_id && this.recurrence()) {
          await this.data.updateRecurrence(this.tx!.recurrence_id, {
            kind: p.kind, amount: p.amount, description: p.description, account_id: p.account_id, to_account_id: p.to_account_id,
            category_id: p.category_id, notes: p.notes,
          }, addDays(date, 1));
        }
      } else if (this.repeat === 'installments') {
        const n = Math.floor(Number(this.installments));
        await this.data.createRecurrence({
          kind: p.kind, amount: splitInstallments(p.amount, n)[0], total_amount: p.amount, installments: n, frequency: this.frequency,
          description: p.description, account_id: p.account_id, to_account_id: p.to_account_id, category_id: p.category_id, tags: [], notes: p.notes,
          start_date: date, end_date: null,
        }, this.paid);
      } else if (this.repeat === 'fixed') {
        const times = this.times && this.times > 1 ? Math.floor(this.times) : null;
        await this.data.createRecurrence({
          kind: p.kind, amount: p.amount, total_amount: null, installments: null, frequency: this.frequency,
          description: p.description, account_id: p.account_id, to_account_id: p.to_account_id, category_id: p.category_id, tags: [], notes: p.notes,
          start_date: date, end_date: times ? occurrenceDate(date, this.frequency, times - 1) : null,
        }, this.paid);
      } else {
        await this.data.saveTransaction(p);
      }
      this.ref.close(true);
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  async remove() {
    if (!(await this.ui.confirm('Apagar movimento', 'Esta ação não pode ser anulada.', 'Apagar'))) return;
    this.busy.set(true);
    try {
      await this.data.deleteTransaction(this.tx!.id);
      this.ref.close(true);
    } catch (e) { this.ui.error(e); } finally { this.busy.set(false); }
  }

  async removeSeries() {
    if (!(await this.ui.confirm('Terminar recorrência', 'Apaga este movimento e os seguintes por pagar, e termina a recorrência. Os já pagos ficam no histórico.', 'Terminar'))) return;
    this.busy.set(true);
    try {
      if (!this.tx!.paid) await this.data.deleteTransaction(this.tx!.id);
      if (this.recurrence()) await this.data.endRecurrence(this.tx!.recurrence_id!, this.tx!.date);
      else await this.data.deleteOccurrencesFrom(this.tx!.recurrence_id!, this.tx!.date);
      this.ref.close(true);
    } catch (e) { this.ui.error(e); } finally { this.busy.set(false); }
  }
}
