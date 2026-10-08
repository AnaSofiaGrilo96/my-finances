import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataService } from '../../core/data.service';
import { FREQUENCIES, Frequency, Transaction, TransactionKind, splitInstallments } from '../../core/models';
import { addDays, fromIso, occurrenceDate, todayIso, toIso } from '../../core/dates';
import { UiService } from '../../shared/ui.service';
import { IconBadge } from '../../shared/icon-badge';
import { PickerData, PickerItem, PickerSheet } from '../../shared/picker.sheet';
import { BackButtonService } from '../../shared/back-button.service';
import { formatMoney } from '../../shared/money.pipe';

export interface TransactionDialogData {
  transaction?: Transaction;
  kind?: TransactionKind;
  date?: string;
  accountId?: string;
  repeat?: 'none' | 'fixed' | 'installments';
  /** Duplicar: novo movimento pré-preenchido a partir deste (data de hoje, não ligado a recorrência). */
  prefill?: Transaction;
  /** Abrir já com "Mais opções" (observação) visível. */
  openNotes?: boolean;
}

type RepeatMode = 'none' | 'fixed' | 'installments';

/** Abre o diálogo: ecrã inteiro no telemóvel, janela de 480px no computador. */
export function openTransactionDialog(dialog: MatDialog, data: TransactionDialogData = {}) {
  const small = window.matchMedia('(max-width: 899px)').matches;
  const cfg: MatDialogConfig = small
    ? { width: '100vw', maxWidth: '100vw', height: '100dvh', maxHeight: '100dvh', panelClass: 'tx-dialog-full', data, autoFocus: false }
    : { width: '480px', maxWidth: '96vw', maxHeight: '92dvh', panelClass: 'tx-dialog', data, autoFocus: false };
  return dialog.open(TransactionDialog, cfg);
}

@Component({
  selector: 'app-transaction-dialog',
  imports: [NgTemplateOutlet, FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatDatepickerModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTooltipModule, IconBadge],
  template: `
    <div class="wrap" [class]="'k-' + kind()">
      <!-- ===== Cabeçalho: tipo + valor ===== -->
      <header class="head">
        <div class="tabs">
          @for (k of kinds; track k.id) {
            <button type="button" class="tab" [class.on]="kind() === k.id" [disabled]="isEdit" (click)="setKind(k.id)">{{ k.label }}<span class="dot"></span></button>
          }
          <button type="button" class="close" mat-dialog-close aria-label="Fechar"><mat-icon>close</mat-icon></button>
        </div>
        <div class="amount-row">
          <button type="button" class="amount" (click)="step.set(1)" [attr.aria-label]="'Valor ' + display()">
            @if (repeat === 'installments' && !isEdit && step() === 2) { <small>total</small> }
            {{ display() }}
          </button>
          <button type="button" class="paid" [class.on]="paid" (click)="paid = !paid" [matTooltip]="paidLabel()" [attr.aria-label]="paidLabel()">
            <mat-icon>{{ paid ? 'thumb_up' : 'thumb_down' }}</mat-icon>
          </button>
        </div>
      </header>

      <!-- ===== Passo 1: teclado ===== -->
      @if (step() === 1) {
        <section class="body scroll step1">
          <div class="field">
            <label>Descrição</label>
            <div class="inline">
              <mat-icon>edit</mat-icon>
              <input type="text" [(ngModel)]="description" name="description1" placeholder="Adicione a descrição" (ngModelChange)="onDescription($event)" (focus)="suggestOpen.set(true)" (blur)="closeSuggestSoon()" autocomplete="off" />
              @if (description) { <button type="button" class="clear" (click)="description = ''; suggestions.set([])"><mat-icon>close</mat-icon></button> }
            </div>
            @if (suggestOpen() && suggestions().length) { <ng-container *ngTemplateOutlet="suggestTpl" /> }
          </div>
        </section>
        <section class="keypad">
          <span class="grab"></span>
          <div class="keys">
            @for (k of ['1','2','3','4','5','6','7','8','9']; track k) { <button type="button" class="key" (click)="press(k)">{{ k }}</button> }
            <button type="button" class="key flat" (click)="press('C')" matTooltip="Limpar"><mat-icon>clear_all</mat-icon></button>
            <button type="button" class="key" (click)="press('0')">0</button>
            <button type="button" class="key flat" (click)="pressSign()" matTooltip="Apagar último dígito"><mat-icon>backspace</mat-icon></button>
          </div>
          <button type="button" class="confirm" (click)="confirmAmount()" [disabled]="!amount || amount <= 0" aria-label="Confirmar valor"><mat-icon>check</mat-icon></button>
        </section>
      }

      <!-- ===== Passo 2: campos ===== -->
      @if (step() === 2) {
        <section class="body scroll">
          <div class="field">
            <label>Descrição</label>
            <div class="inline">
              <mat-icon>edit</mat-icon>
              <input type="text" [(ngModel)]="description" name="description" placeholder="Adicione a descrição" (ngModelChange)="onDescription($event)" (focus)="suggestOpen.set(true)" (blur)="closeSuggestSoon()" autocomplete="off" />
              @if (description) { <button type="button" class="clear" (click)="description = ''; suggestions.set([])"><mat-icon>close</mat-icon></button> }
            </div>
            @if (suggestOpen() && suggestions().length) { <ng-container *ngTemplateOutlet="suggestTpl" /> }
          </div>

          @if (kind() !== 'transfer') {
            <button type="button" class="field row" (click)="pickCategory()">
              <label>Categoria</label>
              <div class="inline">
                @if (category(); as c) { <app-icon-badge [icon]="c.icon" [color]="c.color" [size]="40" /><span>{{ data.categoryLabel(c.id) }}</span> }
                @else { <span class="circle"><mat-icon>list</mat-icon></span><span class="muted">Escolher categoria</span> }
              </div>
            </button>
            <button type="button" class="field row" (click)="pickAccount('from')">
              <label>{{ kind() === 'income' ? 'Recebi em' : 'Pago com' }}</label>
              <div class="inline">
                @if (account(); as a) { <app-icon-badge [icon]="a.icon" [color]="a.color" [size]="40" /><span>{{ a.name }}</span> }
                @else { <span class="circle"><mat-icon>add</mat-icon></span><span class="muted">Selecione uma conta</span> }
              </div>
            </button>
          } @else {
            <button type="button" class="field row" (click)="pickAccount('from')">
              <label>Conta origem</label>
              <div class="inline">
                @if (account(); as a) { <app-icon-badge [icon]="a.icon" [color]="a.color" [size]="40" /><span>{{ a.name }}</span> }
                @else { <span class="circle"><mat-icon>add</mat-icon></span><span class="muted">Selecione uma conta</span> }
              </div>
            </button>
            <button type="button" class="field row" (click)="pickAccount('to')">
              <label>Conta destino</label>
              <div class="inline">
                @if (toAccount(); as a) { <app-icon-badge [icon]="a.icon" [color]="a.color" [size]="40" /><span>{{ a.name }}</span> }
                @else { <span class="circle"><mat-icon>add</mat-icon></span><span class="muted">Selecione a conta destino</span> }
              </div>
            </button>
          }

          <button type="button" class="field row" (click)="dp.open()">
            <label>Data</label>
            <div class="inline"><mat-icon class="lead">calendar_today</mat-icon><span>{{ dateLabel() }}</span></div>
            <input class="hidden-dp" [matDatepicker]="dp" [(ngModel)]="dateValue" name="date" />
            <mat-datepicker #dp touchUi />
          </button>

          @if (!isEdit) {
            <div class="field">
              <label>Repetir movimento</label>
              <div class="chips">
                <button type="button" class="chip" [class.on]="repeat === 'fixed'" (click)="toggleRepeat('fixed')">Fixo</button>
                <button type="button" class="chip" [class.on]="repeat === 'installments'" (click)="toggleRepeat('installments')">Parcelado</button>
              </div>
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
                      <input matInput type="number" min="2" max="1000" [(ngModel)]="times" name="times" placeholder="∞" />
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
                    Repete-se {{ freqEach() }}{{ times && times > 1 ? ', ' + times + ' vezes' : ', sem fim' }}; os próximos aparecem como não pagos.
                  }
                </p>
              }
            </div>
          } @else if (tx?.recurrence_id && recurrence(); as r) {
            <div class="field">
              <div class="rec-box">
                <mat-icon>repeat</mat-icon>
                <div>
                  @if (r.installments) { Parcela {{ tx!.installment_no }}/{{ r.installments }} } @else { Recorrência {{ freqLabel(r.frequency).toLowerCase() }}{{ r.active ? '' : ' (terminada)' }} }
                  <span class="hint">Ao guardar, perguntamos se a alteração é só para este ou também para os próximos.</span>
                </div>
              </div>
            </div>
          }

          <button type="button" class="more" (click)="more.set(!more())">Mais opções <mat-icon>{{ more() ? 'expand_less' : 'expand_more' }}</mat-icon></button>
          @if (more()) {
            <div class="field">
              <label>Observação</label>
              <div class="inline"><mat-icon>notes</mat-icon><input type="text" [(ngModel)]="notes" name="notes" placeholder="Adicione uma observação" /></div>
            </div>
            @if (isEdit) {
              <div class="danger-row">
                <button matButton (click)="remove()" [disabled]="busy()"><mat-icon>delete</mat-icon>Apagar</button>
              </div>
            }
          }
          <div class="spacer-bottom"></div>
        </section>
        <button type="button" class="confirm save" (click)="save()" [disabled]="busy() || !valid()" aria-label="Guardar"><mat-icon>check</mat-icon></button>
      }
    </div>

    <!-- Sugestões (autocomplete da descrição) -->
    <ng-template #suggestTpl>
      <div class="suggest" (mousedown)="$event.preventDefault()">
        @for (s of suggestions(); track s.id) {
          <button type="button" class="sug" (click)="applySuggestion(s)">
            <app-icon-badge [icon]="iconOf(s)" [color]="colorOf(s)" [size]="36" />
            <span class="txt"><span class="t1">{{ s.description }}</span><span class="t2">{{ data.accountMap().get(s.account_id)?.name }}@if (s.category_id) { · {{ data.categoryLabel(s.category_id) }} }</span></span>
          </button>
        }
      </div>
    </ng-template>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .wrap { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--mat-sys-surface); color: var(--mat-sys-on-surface); position: relative; }
    /* ---- cabeçalho ---- */
    .head { padding: 10px 16px 22px; color: #fff; transition: background .2s; }
    .k-expense .head { background: #6b3d44; } .k-income .head { background: #2f6b47; } .k-transfer .head { background: #3c4149; }
    :host-context(html:not(.dark)) .k-expense .head { background: #c0484f; } :host-context(html:not(.dark)) .k-income .head { background: #2e9e63; } :host-context(html:not(.dark)) .k-transfer .head { background: #5a6270; }
    .tabs { display: flex; align-items: center; gap: 4px; }
    .tab { flex: 1; background: none; border: none; color: rgba(255,255,255,.7); font: inherit; font-size: 16px; padding: 10px 0 6px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .tab.on { color: #fff; font-weight: 600; }
    .tab .dot { width: 18px; height: 4px; border-radius: 2px; background: transparent; } .tab.on .dot { background: #fff; }
    .tab:disabled { cursor: default; }
    .close { background: none; border: none; color: rgba(255,255,255,.8); cursor: pointer; padding: 6px; display: grid; place-items: center; }
    .amount-row { display: flex; align-items: center; justify-content: flex-end; gap: 14px; margin-top: 26px; }
    .amount { background: none; border: none; color: #fff; font: inherit; font-size: 56px; font-weight: 700; letter-spacing: -1px; cursor: pointer; line-height: 1; padding: 0; display: flex; align-items: baseline; gap: 10px; }
    .amount small { font-size: 13px; font-weight: 400; opacity: .8; }
    .paid { background: none; border: none; color: rgba(255,255,255,.45); cursor: pointer; padding: 4px; display: grid; place-items: center; }
    .paid { color: rgba(255,255,255,.75); }
    .paid.on { color: #fff; }
    .paid mat-icon { font-size: 34px; width: 34px; height: 34px; }
    /* ---- corpo ---- */
    .body { padding: 6px 0 0; }
    .body.scroll { flex: 1; overflow: auto; min-height: 0; }
    .body.step1 { flex: 0 1 auto; }
    .field { display: block; width: 100%; box-sizing: border-box; padding: 14px 20px; border-bottom: 1px solid var(--mat-sys-outline-variant); position: relative; text-align: left; background: none; border-left: none; border-right: none; border-top: none; color: inherit; font: inherit; }
    .field.row { cursor: pointer; } .field.row:hover { background: var(--mat-sys-surface-container); }
    .field label { display: block; font-size: 18px; font-weight: 500; margin-bottom: 10px; }
    .inline { display: flex; align-items: center; gap: 14px; font-size: 17px; min-height: 40px; }
    .inline > mat-icon { color: var(--mat-sys-on-surface-variant); }
    .inline input { flex: 1; background: none; border: none; outline: none; font: inherit; font-size: 17px; color: inherit; min-width: 0; }
    .inline input::placeholder { color: var(--mat-sys-on-surface-variant); }
    .circle { width: 40px; height: 40px; border-radius: 50%; background: var(--mat-sys-surface-container-highest); display: grid; place-items: center; color: var(--mat-sys-on-surface-variant); flex-shrink: 0; }
    .clear { background: none; border: none; color: var(--mat-sys-on-surface-variant); cursor: pointer; padding: 4px; display: grid; place-items: center; }
    .hidden-dp { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; }
    .chips { display: flex; gap: 12px; }
    .chip { border: 1.5px solid var(--mat-sys-outline); background: none; color: inherit; font: inherit; font-size: 15px; padding: 10px 22px; border-radius: 999px; cursor: pointer; }
    .chip.on { background: var(--mat-sys-primary); border-color: var(--mat-sys-primary); color: var(--mat-sys-on-primary); font-weight: 600; }
    .repeat-row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
    .small { flex: 1; min-width: 140px; }
    .hint { font-size: 12.5px; color: var(--mat-sys-on-surface-variant); margin: 8px 0 0; }
    .rec-box { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; }
    .rec-box .hint { display: block; }
    .rec-box mat-icon { color: var(--mat-sys-primary); margin-top: 2px; }
    .more { display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%; background: none; border: none; border-bottom: 1px solid var(--mat-sys-outline-variant); color: inherit; font: inherit; font-size: 20px; padding: 16px; cursor: pointer; }
    .danger-row { display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 20px; }
    .spacer-bottom { height: 110px; }
    /* ---- teclado ---- */
    .keypad { margin-top: auto; flex-shrink: 0; background: var(--mat-sys-surface-container-lowest); border-radius: 28px 28px 0 0; padding: 10px 20px calc(20px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; align-items: center; }
    :host-context(html.dark) .keypad { background: #0f0f0f; }
    .grab { width: 36px; height: 4px; border-radius: 2px; background: var(--mat-sys-outline-variant); margin-bottom: 10px; }
    .keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 12px; width: 100%; max-width: 300px; justify-items: center; }
    .key { width: 68px; height: 68px; border-radius: 50%; border: 1.5px solid var(--mat-sys-outline-variant); background: none; color: inherit; font: inherit; font-size: 30px; cursor: pointer; display: grid; place-items: center; }
    .key:active { background: var(--mat-sys-surface-container-high); }
    .key.flat { border: none; color: var(--mat-sys-on-surface-variant); }
    .confirm { width: 72px; height: 72px; border-radius: 50%; border: none; background: #4caf6a; color: #fff; display: grid; place-items: center; cursor: pointer; box-shadow: 0 8px 20px rgba(0,0,0,.25); margin-top: 12px; }
    .confirm:disabled { opacity: .45; cursor: default; }
    .confirm mat-icon { font-size: 36px; width: 36px; height: 36px; }
    .confirm.save { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(18px + env(safe-area-inset-bottom)); margin: 0; }
    /* ---- sugestões ---- */
    .suggest { margin: 10px 0 0; background: var(--mat-sys-surface-container); border-radius: 14px; overflow: hidden; max-height: 280px; overflow-y: auto; }
    .sug { display: flex; align-items: center; gap: 12px; width: 100%; background: none; border: none; border-bottom: 1px solid var(--mat-sys-outline-variant); color: inherit; font: inherit; text-align: left; padding: 10px 14px; cursor: pointer; }
    .sug:last-child { border-bottom: none; } .sug:hover { background: var(--mat-sys-surface-container-high); }
    .sug .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .sug .t1 { font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sug .t2 { font-size: 13px; color: var(--mat-sys-on-surface-variant); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    @media (min-width: 900px) {
      .amount { font-size: 44px; }
      .key { width: 60px; height: 60px; font-size: 24px; }
      .keys { gap: 8px 10px; max-width: 260px; }
      .field label { font-size: 15px; margin-bottom: 6px; }
      .more { font-size: 16px; padding: 12px; }
      .spacer-bottom { height: 96px; }
    }
  `],
})
export class TransactionDialog {
  readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly ref = inject(MatDialogRef<TransactionDialog>);
  private readonly sheet = inject(MatBottomSheet);
  private readonly back = inject(BackButtonService);
  private readonly input = inject<TransactionDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};

  readonly kinds: { id: TransactionKind; label: string }[] = [{ id: 'expense', label: 'Despesa' }, { id: 'income', label: 'Receita' }, { id: 'transfer', label: 'Transferência' }];
  readonly frequencies = FREQUENCIES;

  readonly tx = this.input.transaction;
  readonly isEdit = !!this.tx;
  private readonly src = this.tx ?? this.input.prefill; // valores iniciais (edição ou duplicação)
  readonly busy = signal(false);
  readonly step = signal<1 | 2>(this.src ? 2 : 1);
  readonly more = signal(!!this.src?.notes || !!this.input.openNotes);
  readonly kind = signal<TransactionKind>(this.src?.kind ?? this.input.kind ?? 'expense');

  /** Valor em cêntimos (o teclado escreve da direita para a esquerda, como numa caixa registadora). */
  private cents = Math.round((this.src?.amount ?? 0) * 100);
  get amount() { return this.cents / 100; }

  description = this.src?.description ?? '';
  dateValue: Date = fromIso(this.tx?.date ?? this.input.date ?? todayIso());
  accountId: string | null = this.src?.account_id ?? this.input.accountId ?? this.data.activeAccounts()[0]?.id ?? null;
  toAccountId: string | null = this.src?.to_account_id ?? null;
  categoryId: string | null = this.src?.category_id ?? this.defaultCategory(this.src?.kind ?? this.input.kind ?? 'expense');

  /** Categoria por defeito num movimento novo: "Outros" (despesa) / "Outras receitas" (receita) — categoria principal com esse nome. */
  private defaultCategory(kind: TransactionKind): string | null {
    if (kind === 'transfer') return null;
    const name = kind === 'income' ? 'outras receitas' : 'outros';
    const cats = this.data.categories().filter((c) => c.kind === kind && !c.archived && c.name.trim().toLowerCase() === name);
    return (cats.find((c) => !c.parent_id) ?? cats[0])?.id ?? null;
  }
  paid = this.tx?.paid ?? true;
  notes = this.src?.notes ?? '';
  repeat: RepeatMode = this.input.repeat ?? 'none';
  frequency: Frequency = 'monthly';
  installments: number | null = 12;
  times: number | null = null;

  readonly suggestions = signal<Transaction[]>([]);
  readonly suggestOpen = signal(false);
  private suggestTimer?: ReturnType<typeof setTimeout>;
  private suggestSeq = 0;

  // sinais derivados para o template (categoria/contas como objetos)
  private readonly tick = signal(0);
  readonly category = computed(() => { this.tick(); return this.categoryId ? this.data.categoryMap().get(this.categoryId) : undefined; });
  readonly account = computed(() => { this.tick(); return this.accountId ? this.data.accountMap().get(this.accountId) : undefined; });
  readonly toAccount = computed(() => { this.tick(); return this.toAccountId ? this.data.accountMap().get(this.toAccountId) : undefined; });
  readonly recurrence = computed(() => this.data.recurrences().find((r) => r.id === this.tx?.recurrence_id) ?? null);

  constructor() {
    if (this.repeat !== 'none') this.step.set(1);
  }

  // ---------- teclado ----------
  display() { return formatMoney(this.amount); }

  @HostListener('document:keydown', ['$event'])
  onKey(ev: KeyboardEvent) {
    if (this.step() !== 1) return;
    const target = ev.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return; // a escrever a descrição
    if (/^[0-9]$/.test(ev.key)) { this.press(ev.key); ev.preventDefault(); }
    else if (ev.key === 'Backspace') { this.pressSign(); ev.preventDefault(); }
    else if (ev.key === 'Enter') { this.confirmAmount(); ev.preventDefault(); }
    else if (ev.key === 'Escape') { this.ref.close(); }
  }

  press(k: string) {
    if (k === 'C') { this.cents = 0; return; }
    if (this.cents > 99_999_999) return;
    this.cents = this.cents * 10 + Number(k);
  }
  /** Backspace: apaga o último dígito. */
  pressSign() { this.cents = Math.floor(this.cents / 10); }

  confirmAmount() {
    if (this.amount <= 0) return;
    this.step.set(2);
  }

  // ---------- tipo ----------
  setKind(k: TransactionKind) {
    if (this.isEdit) return;
    this.kind.set(k);
    this.categoryId = this.defaultCategory(k);
    this.suggestions.set([]);
    this.tick.update((v) => v + 1);
  }

  paidLabel() {
    const k = this.kind();
    if (k === 'income') return this.paid ? 'Recebido' : 'Não recebido';
    return this.paid ? 'Pago' : 'Não pago';
  }

  // ---------- pickers ----------
  private openPicker(data: PickerData): Promise<PickerItem | undefined> {
    const ref = this.sheet.open(PickerSheet, { data });
    this.back.track(ref);
    return ref.afterDismissed().toPromise();
  }
  async pickCategory() {
    const groups = this.kind() === 'income' ? this.data.incomeGroups() : this.data.expenseGroups();
    const items: PickerItem[] = [{ id: null, label: 'Sem categoria', icon: 'block', color: '#90a4ae' }];
    for (const g of groups) {
      if (!g.parent.archived) items.push({ id: g.parent.id, label: g.parent.name, icon: g.parent.icon, color: g.parent.color });
      for (const c of g.children) items.push({ id: c.id, label: c.name, icon: c.icon, color: c.color, sub: true });
    }
    const picked = await this.openPicker({ title: 'Categoria', items, selected: this.categoryId });
    if (picked !== undefined) { this.categoryId = picked.id; this.tick.update((v) => v + 1); }
  }

  async pickAccount(which: 'from' | 'to') {
    const items: PickerItem[] = this.data.activeAccounts()
      .filter((a) => !(this.kind() === 'transfer' && (which === 'to' ? a.id === this.accountId : a.id === this.toAccountId)))
      .map((a) => ({ id: a.id, label: a.name, icon: a.icon, color: a.color, hint: formatMoney(this.data.balances()[a.id] ?? a.initial_balance) }));
    const title = which === 'to' ? 'Conta destino' : this.kind() === 'transfer' ? 'Conta origem' : this.kind() === 'income' ? 'Recebi em' : 'Pago com';
    const picked = await this.openPicker({ title, items, selected: which === 'to' ? this.toAccountId : this.accountId });
    if (picked?.id) { if (which === 'to') this.toAccountId = picked.id; else this.accountId = picked.id; this.tick.update((v) => v + 1); }
  }

  dateLabel() {
    const iso = toIso(this.dateValue), t = todayIso();
    if (iso === t) return 'Hoje';
    if (iso === addDays(t, -1)) return 'Ontem';
    if (iso === addDays(t, 1)) return 'Amanhã';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  toggleRepeat(mode: RepeatMode) { this.repeat = this.repeat === mode ? 'none' : mode; }

  // ---------- autocomplete ----------
  onDescription(text: string) {
    clearTimeout(this.suggestTimer);
    const seq = ++this.suggestSeq;
    if (!text || text.trim().length < 1) { this.suggestions.set([]); return; }
    this.suggestTimer = setTimeout(async () => {
      try {
        const list = await this.data.suggestTransactions(this.kind(), text);
        if (seq === this.suggestSeq) { this.suggestions.set(list); this.suggestOpen.set(true); }
      } catch { /* ignora */ }
    }, 220);
  }
  closeSuggestSoon() { setTimeout(() => this.suggestOpen.set(false), 150); }
  applySuggestion(s: Transaction) {
    this.description = s.description;
    this.categoryId = s.category_id;
    this.accountId = s.account_id;
    if (s.kind === 'transfer') this.toAccountId = s.to_account_id;
    this.suggestions.set([]);
    this.suggestOpen.set(false);
    this.tick.update((v) => v + 1);
  }
  iconOf(t: Transaction) { return t.kind === 'transfer' ? 'swap_horiz' : (this.data.categoryMap().get(t.category_id ?? '')?.icon ?? 'label'); }
  colorOf(t: Transaction) { return t.kind === 'transfer' ? '#78909c' : (this.data.categoryMap().get(t.category_id ?? '')?.color ?? '#90a4ae'); }
  fmt(v: number) { return formatMoney(v); }

  // ---------- repetição ----------
  freqLabel(f: Frequency) { return FREQUENCIES.find((x) => x.id === f)?.label ?? f; }
  freqEach() { return FREQUENCIES.find((x) => x.id === this.frequency)?.each ?? ''; }
  preview() {
    const n = Math.floor(Number(this.installments) || 0);
    const total = this.amount;
    if (n < 2 || total <= 0 || !this.dateValue) return null;
    const parts = splitInstallments(total, n);
    const start = toIso(this.dateValue);
    const f = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
    return { n, each: formatMoney(parts[0]), lastAmount: formatMoney(parts[n - 1]), rest: parts[n - 1] !== parts[0], first: f(start), last: f(occurrenceDate(start, this.frequency, n - 1)) };
  }

  // ---------- guardar ----------
  valid(): boolean {
    if (this.amount <= 0 || !this.accountId || !this.dateValue) return false;
    if (this.kind() === 'transfer' && (!this.toAccountId || this.toAccountId === this.accountId)) return false;
    if (!this.isEdit && this.repeat === 'installments' && !this.preview()) return false;
    return true;
  }

  private payload(date: string): Omit<Transaction, 'id'> {
    return {
      date, kind: this.kind(), amount: this.amount, description: this.description.trim(),
      account_id: this.accountId!, to_account_id: this.kind() === 'transfer' ? this.toAccountId : null,
      category_id: this.kind() === 'transfer' ? null : this.categoryId, paid: this.paid,
      notes: this.notes.trim() || null, tags: this.tx?.tags ?? [], recurrence_id: this.tx?.recurrence_id ?? null, installment_no: this.tx?.installment_no ?? null,
    };
  }

  async save() {
    if (!this.valid()) return;
    this.busy.set(true);
    try {
      const date = toIso(this.dateValue);
      const p = this.payload(date);
      if (this.isEdit) {
        const full: Transaction = { id: this.tx!.id, ...p };
        if (this.tx!.recurrence_id && this.changedBeyondPaid(p)) {
          // Pertence a uma recorrência e mudou algo além do estado: perguntar o alcance (como na outra aplicação de gestão de finanças).
          this.busy.set(false);
          const scope = await this.ui.recurrenceScope('Atualizar');
          if (!scope) return;
          this.busy.set(true);
          if (scope === 'one') await this.data.saveDetached(full);
          else await this.data.saveAndFollowing(full);
        } else {
          await this.data.saveTransaction(full);
        }
      } else if (this.repeat === 'installments') {
        const n = Math.floor(Number(this.installments));
        await this.data.createRecurrence({ kind: p.kind, amount: splitInstallments(p.amount, n)[0], total_amount: p.amount, installments: n, frequency: this.frequency, description: p.description, account_id: p.account_id, to_account_id: p.to_account_id, category_id: p.category_id, tags: [], notes: p.notes, start_date: date, end_date: null }, this.paid);
      } else if (this.repeat === 'fixed') {
        const times = this.times && this.times > 1 ? Math.floor(this.times) : null;
        await this.data.createRecurrence({ kind: p.kind, amount: p.amount, total_amount: null, installments: null, frequency: this.frequency, description: p.description, account_id: p.account_id, to_account_id: p.to_account_id, category_id: p.category_id, tags: [], notes: p.notes, start_date: date, end_date: times ? occurrenceDate(date, this.frequency, times - 1) : null }, this.paid);
      } else {
        await this.data.saveTransaction(p);
      }
      this.ref.close(true);
    } catch (e) { this.ui.error(e); } finally { this.busy.set(false); }
  }

  /** Mudou alguma coisa além do estado pago/não pago? (só o estado não justifica perguntar o alcance) */
  private changedBeyondPaid(p: Omit<Transaction, 'id'>): boolean {
    const t = this.tx!;
    return p.date !== t.date || p.amount !== t.amount || p.description !== (t.description ?? '') || p.account_id !== t.account_id
      || (p.to_account_id ?? null) !== (t.to_account_id ?? null) || (p.category_id ?? null) !== (t.category_id ?? null) || (p.notes ?? null) !== (t.notes ?? null);
  }

  async remove() {
    if (this.tx!.recurrence_id) {
      const scope = await this.ui.recurrenceScope('Apagar');
      if (!scope) return;
      this.busy.set(true);
      try {
        if (scope === 'one') await this.data.deleteTransaction(this.tx!.id);
        else await this.data.deleteAndFollowing(this.tx!);
        this.ref.close(true);
      } catch (e) { this.ui.error(e); } finally { this.busy.set(false); }
      return;
    }
    if (!(await this.ui.confirm('Apagar movimento?', `Tens a certeza que queres apagar o movimento "${this.description.trim() || 'sem descrição'}"? Esta ação não pode ser anulada.`, 'Apagar movimento'))) return;
    this.busy.set(true);
    try { await this.data.deleteTransaction(this.tx!.id); this.ref.close(true); }
    catch (e) { this.ui.error(e); } finally { this.busy.set(false); }
  }
}
