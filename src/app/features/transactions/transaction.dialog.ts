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
import { DataService } from '../../core/data.service';
import { Transaction, TransactionKind } from '../../core/models';
import { addMonthsIso, fromIso, todayIso, toIso } from '../../core/dates';
import { UiService } from '../../shared/ui.service';
import { IconBadge } from '../../shared/icon-badge';

export interface TransactionDialogData {
  transaction?: Transaction;
  kind?: TransactionKind;
  date?: string;
  accountId?: string;
}

@Component({
  selector: 'app-transaction-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule, MatSlideToggleModule, MatIconModule, MatCheckboxModule, IconBadge],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? 'Editar lançamento' : 'Novo lançamento' }}</h2>
    <mat-dialog-content>
      <mat-button-toggle-group class="kinds" [value]="kind()" (change)="setKind($event.value)" [disabled]="isEdit" hideSingleSelectionIndicator>
        <mat-button-toggle value="expense"><mat-icon>arrow_downward</mat-icon> Despesa</mat-button-toggle>
        <mat-button-toggle value="income"><mat-icon>arrow_upward</mat-icon> Receita</mat-button-toggle>
        <mat-button-toggle value="transfer"><mat-icon>swap_horiz</mat-icon> Transferência</mat-button-toggle>
      </mat-button-toggle-group>

      <form class="form" (ngSubmit)="save()">
        <mat-form-field class="amount" [class]="kind()" floatLabel="always">
          <mat-label>Valor</mat-label>
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
          <mat-datepicker #dp touchUi="false" />
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
            <mat-select [(ngModel)]="categoryId" name="category" panelClass="cat-panel">
              <mat-option [value]="null"><em>Sem categoria</em></mat-option>
              @for (g of groups(); track g.parent.id) {
                @if (!g.parent.archived) {
                  <mat-option [value]="g.parent.id"><span class="opt"><app-icon-badge [icon]="g.parent.icon" [color]="g.parent.color" [size]="22" />{{ g.parent.name }}</span></mat-option>
                }
                @for (c of g.children; track c.id) {
                  <mat-option [value]="c.id" class="sub"><span class="opt sub"><app-icon-badge [icon]="c.icon" [color]="c.color" [size]="18" />{{ c.name }}</span></mat-option>
                }
              }
            </mat-select>
          </mat-form-field>
        }

        <div class="toggles">
          <mat-slide-toggle [(ngModel)]="paid" name="paid">{{ kind() === 'income' ? 'Recebido' : 'Pago' }}</mat-slide-toggle>
          @if (!isEdit) {
            <mat-checkbox [(ngModel)]="repeat" name="repeat">Repetir mensalmente</mat-checkbox>
          }
        </div>

        @if (repeat && !isEdit) {
          <mat-form-field class="small">
            <mat-label>Número de meses</mat-label>
            <input matInput type="number" min="2" max="120" [(ngModel)]="repeatTimes" name="repeatTimes" />
            <mat-hint>Cria {{ repeatTimes }} lançamentos, um por mês, a partir da data escolhida.</mat-hint>
          </mat-form-field>
        }

        <mat-form-field>
          <mat-label>Tags (separadas por vírgula)</mat-label>
          <input matInput [(ngModel)]="tagsText" name="tags" placeholder="ex.: férias, casa" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Notas</mat-label>
          <textarea matInput rows="2" [(ngModel)]="notes" name="notes"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions>
      @if (isEdit) {
        <button matIconButton color="warn" (click)="remove()" matTooltip="Apagar" aria-label="Apagar" [disabled]="busy()"><mat-icon>delete</mat-icon></button>
        @if (tx?.recurrence_id) {
          <button matButton (click)="removeSeries()" [disabled]="busy()">Apagar este e seguintes</button>
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
    .toggles { display: flex; gap: 20px; flex-wrap: wrap; align-items: center; margin: 4px 0 16px; }
    .opt { display: inline-flex; align-items: center; gap: 8px; }
    .opt.sub { padding-left: 22px; font-size: 14px; }
    .small { max-width: 260px; }
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

  amount: number | null = this.tx?.amount ?? null;
  description = this.tx?.description ?? '';
  dateValue: Date = fromIso(this.tx?.date ?? this.input.date ?? todayIso());
  accountId: string | null = this.tx?.account_id ?? this.input.accountId ?? this.data.activeAccounts()[0]?.id ?? null;
  toAccountId: string | null = this.tx?.to_account_id ?? null;
  categoryId: string | null = this.tx?.category_id ?? null;
  paid = this.tx?.paid ?? true;
  notes = this.tx?.notes ?? '';
  tagsText = (this.tx?.tags ?? []).join(', ');
  repeat = false;
  repeatTimes = 12;

  readonly groups = computed(() => (this.kind() === 'income' ? this.data.incomeGroups() : this.data.expenseGroups()));

  setKind(k: TransactionKind) {
    this.kind.set(k);
    this.categoryId = null;
  }

  valid(): boolean {
    if (!this.amount || this.amount <= 0 || !this.accountId || !this.dateValue) return false;
    if (this.kind() === 'transfer' && (!this.toAccountId || this.toAccountId === this.accountId)) return false;
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
      tags: this.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      recurrence_id: this.tx?.recurrence_id ?? null,
    };
  }

  async save() {
    if (!this.valid()) return;
    this.busy.set(true);
    try {
      const date = toIso(this.dateValue);
      if (this.isEdit) {
        await this.data.saveTransaction({ id: this.tx!.id, ...this.payload(date) });
      } else if (this.repeat && this.repeatTimes > 1) {
        const rid = crypto.randomUUID();
        const rows = Array.from({ length: Math.min(120, this.repeatTimes) }, (_, i) => ({
          ...this.payload(addMonthsIso(date, i)),
          paid: i === 0 ? this.paid : false,
          recurrence_id: rid,
        }));
        await this.data.insertTransactions(rows);
      } else {
        await this.data.saveTransaction(this.payload(date));
      }
      this.ref.close(true);
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  async remove() {
    if (!(await this.ui.confirm('Apagar lançamento', 'Esta ação não pode ser anulada.', 'Apagar'))) return;
    this.busy.set(true);
    try {
      await this.data.deleteTransaction(this.tx!.id);
      this.ref.close(true);
    } catch (e) { this.ui.error(e); } finally { this.busy.set(false); }
  }

  async removeSeries() {
    if (!(await this.ui.confirm('Apagar repetições', 'Apaga este lançamento e todos os seguintes da mesma série.', 'Apagar'))) return;
    this.busy.set(true);
    try {
      await this.data.deleteRecurrence(this.tx!.recurrence_id!, this.tx!.date);
      this.ref.close(true);
    } catch (e) { this.ui.error(e); } finally { this.busy.set(false); }
  }
}
