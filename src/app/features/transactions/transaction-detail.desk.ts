import { Component, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DataService } from '../../core/data.service';
import { FREQUENCIES, Transaction, TransactionKind } from '../../core/models';
import { fromIso, toIso, todayIso } from '../../core/dates';
import { formatMoney } from '../../shared/money.pipe';
import { IconBadge } from '../../shared/icon-badge';
import { UiService } from '../../shared/ui.service';
import type { DetailAction } from './transaction-detail.sheet';

const LONG_DATE = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });

type Field = 'description' | 'amount' | 'notes';
type Picker = 'category' | 'account' | 'to' | 'date';

/**
 * Detalhe de um movimento no computador (18/11), com edição no próprio sítio, à imagem do painel da outra aplicação de gestão
 * de finanças mas numa janela centrada: descrição, valor e observação editam-se ali mesmo (Enter / ✓ confirma, Esc cancela);
 * categoria, conta(s) e data abrem um painel que sobe dentro da janela; "Alterar para Receita/Despesa" troca o tipo.
 * Cada alteração grava logo (num movimento recorrente pergunta "apenas este / este e os próximos").
 * Devolve 'delete' ou 'duplicate' à lista (que trata dessas ações); o resto resolve-se aqui.
 */
@Component({
  selector: 'app-transaction-detail-desk',
  imports: [FormsModule, MatIconModule, MatTooltipModule, MatDatepickerModule, IconBadge],
  template: `
    <div class="dk" [class.busy]="busy()">
      <header class="dk-top">
        <div class="type">
          <span class="badge" [class]="t().kind">{{ kindLabel() }}</span>
          @if (t().kind !== 'transfer') { <button type="button" class="link sm" (click)="switchKind()">Alterar para {{ t().kind === 'expense' ? 'Receita' : 'Despesa' }}</button> }
        </div>
        <button type="button" class="x" (click)="close()" aria-label="Fechar"><mat-icon>close</mat-icon></button>
      </header>

      <!-- descrição -->
      @if (editing() === 'description') {
        <div class="ed-line">
          <input #box class="ed-title" [(ngModel)]="draft" (keydown.enter)="commit()" (keydown.escape)="cancel($event)" placeholder="Descrição" />
          <button type="button" class="ok-mini" (click)="commit()" aria-label="Confirmar"><mat-icon>check</mat-icon></button>
        </div>
      } @else {
        <h2 class="dk-title editable" (click)="edit('description')" title="Clique para editar a descrição">{{ t().description || name() }}</h2>
      }

      <!-- valor + estado -->
      @if (editing() === 'amount') {
        <div class="ed-amt">
          <span class="val"><small>€</small><input #box type="text" inputmode="decimal" [(ngModel)]="draft" (keydown.enter)="commit()" (keydown.escape)="cancel($event)" /></span>
          <button type="button" class="ok" (click)="commit()" aria-label="Confirmar"><mat-icon>check</mat-icon></button>
        </div>
        <div class="hint">Enter confirma · Esc cancela</div>
      } @else {
        <div class="dk-amt">
          <span class="val editable" (click)="edit('amount')" title="Clique para editar o valor"><small>€</small>{{ abs() }}</span>
          <span class="st" [class.ok]="t().paid">{{ paidLabel() }}</span>
        </div>
      }

      @if (t().recurrence_id) {
        <div class="rt"><mat-icon>repeat</mat-icon>{{ repLabel() }}@if (freqLabel()) { <span class="dot">·</span><strong>{{ freqLabel() }}</strong> }</div>
      }

      <ul class="flist">
        @if (t().kind === 'transfer') {
          <li (click)="open('account')"><span class="k">Conta origem</span><span class="v">@if (accObj(t().account_id); as a) { <app-icon-badge [icon]="a.icon" [color]="a.color" [size]="24" /> }{{ acc(t().account_id) }}</span><mat-icon class="chev">chevron_right</mat-icon></li>
          <li (click)="open('to')"><span class="k">Conta destino</span><span class="v">@if (accObj(t().to_account_id); as a) { <app-icon-badge [icon]="a.icon" [color]="a.color" [size]="24" /> }{{ acc(t().to_account_id) }}</span><mat-icon class="chev">chevron_right</mat-icon></li>
        } @else {
          <li (click)="open('category')"><span class="k">Categoria</span><span class="v">@if (cat(); as c) { <app-icon-badge [icon]="c.icon" [color]="c.color" [size]="24" /> }{{ data.categoryLabel(t().category_id) || '—' }}</span><mat-icon class="chev">chevron_right</mat-icon></li>
          <li (click)="open('account')"><span class="k">Conta</span><span class="v">{{ acc(t().account_id) }}</span><mat-icon class="chev">chevron_right</mat-icon></li>
        }
        <li (click)="open('date')"><span class="k">Data</span><span class="v">{{ longDate() }}</span><mat-icon class="chev">chevron_right</mat-icon></li>
        @if (editing() === 'notes') {
          <li class="notes-ed">
            <span class="k">Observação</span>
            <textarea #box rows="3" [(ngModel)]="draft" (keydown.escape)="cancel($event)" (keydown.control.enter)="commit()" placeholder="Escreve uma observação"></textarea>
            <button type="button" class="ok-btn" (click)="commit()">OK</button>
          </li>
        } @else {
          <li (click)="edit('notes')"><span class="k">Observação</span>
            @if (t().notes) { <span class="v note">{{ t().notes }}</span><mat-icon class="chev">chevron_right</mat-icon> } @else { <span class="add"><mat-icon>add</mat-icon>Adicionar</span> }
          </li>
        }
      </ul>

      <footer class="dk-foot">
        <button type="button" class="pay" [class.undo]="t().paid" (click)="togglePaid()">{{ payAction() }}</button>
        <button type="button" class="ib" (click)="closeWith('duplicate')" matTooltip="Duplicar" aria-label="Duplicar"><mat-icon fontSet="material-icons-outlined">content_copy</mat-icon></button>
        <button type="button" class="ib del" (click)="closeWith('delete')" matTooltip="Apagar" aria-label="Apagar"><mat-icon fontSet="material-icons-outlined">delete</mat-icon></button>
      </footer>

      <!-- painel que sobe dentro da janela: categoria, conta, data -->
      @if (picker(); as p) {
        <div class="scrim" (click)="picker.set(null)"></div>
        <section class="ov" [class.tall]="p === 'category'">
          <header class="ov-head"><b>{{ pickerTitle() }}</b><button type="button" class="x" (click)="picker.set(null)" aria-label="Fechar"><mat-icon>close</mat-icon></button></header>
          @if (p === 'category') {
            <input #search class="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Procurar categoria…" />
            <div class="ov-list">
              @for (g of catGroups(); track g.parent.id) {
                <button type="button" class="opt parent" (click)="pickCategory(g.parent.id)">
                  <app-icon-badge [icon]="g.parent.icon" [color]="g.parent.color" [size]="28" /><span>{{ g.parent.name }}</span>
                  @if (t().category_id === g.parent.id) { <mat-icon class="tick">check</mat-icon> }
                </button>
                @for (c of g.children; track c.id) {
                  <button type="button" class="opt child" (click)="pickCategory(c.id)">
                    <i class="dot" [style.background]="g.parent.color"></i><span>{{ c.name }}</span>
                    @if (t().category_id === c.id) { <mat-icon class="tick">check</mat-icon> }
                  </button>
                }
              } @empty { <p class="none">Nenhuma categoria encontrada.</p> }
            </div>
          } @else if (p === 'date') {
            <div class="today-row"><button type="button" class="link" (click)="pickDate(today())">Hoje</button></div>
            <mat-calendar class="cal" [selected]="dateObj()" [startAt]="dateObj()" (selectedChange)="pickDate($event)" />
          } @else {
            <div class="ov-sec">Contas</div>
            <div class="ov-list">
              @for (a of data.activeAccounts(); track a.id) {
                <button type="button" class="opt" (click)="pickAccount(a.id)" [disabled]="p === 'to' ? a.id === t().account_id : (t().kind === 'transfer' && a.id === t().to_account_id)">
                  <app-icon-badge [icon]="a.icon" [color]="a.color" [size]="28" /><span>{{ a.name }}</span>
                  @if ((p === 'to' ? t().to_account_id : t().account_id) === a.id) { <mat-icon class="tick">check</mat-icon> }
                </button>
              }
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .dk { position: relative; display: flex; flex-direction: column; min-height: min(620px, 88vh); box-sizing: border-box; padding: 24px 28px 28px; color: var(--ink, var(--mat-sys-on-surface)); overflow: hidden; }
    .dk.busy { cursor: progress; }
    .dk-top { display: flex; align-items: center; justify-content: space-between; }
    .type { display: flex; align-items: center; gap: 10px; }
    .badge { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 10px; background: var(--app-bg); color: var(--ink-soft); }
    .badge.expense { color: var(--neg); } .badge.income { color: var(--pos); } .badge.transfer { color: var(--bal); }
    .link { background: none; border: none; padding: 0; font: inherit; font-size: 14px; font-weight: 600; color: var(--pos); cursor: pointer; }
    .link.sm { font-size: 11px; font-weight: 500; color: var(--ink-2); }
    @media (hover: hover) { .link:hover { text-decoration: underline; } }
    .x { width: 32px; height: 32px; border-radius: 50%; border: none; background: var(--app-bg); color: var(--ink); display: grid; place-items: center; cursor: pointer; padding: 0; flex-shrink: 0; }
    .x mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .editable { cursor: text; border-radius: 6px; transition: background-color .15s; }
    @media (hover: hover) { .editable:hover { background: var(--app-bg); box-shadow: 0 0 0 4px var(--app-bg); } }
    .dk-title { margin: 14px 0 6px; font-size: 20px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
    .ed-line { display: flex; align-items: center; gap: 6px; margin: 12px 0 4px; }
    .ed-title { flex: 1; min-width: 0; font: inherit; font-size: 20px; font-weight: 600; color: inherit; background: none; border: none; border-bottom: 2px solid var(--pos); padding: 2px 0; outline: none; }
    .ok-mini { width: 28px; height: 28px; border: none; background: none; color: var(--pos); display: grid; place-items: center; cursor: pointer; padding: 0; }
    .dk-amt, .ed-amt { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .val { font-size: 30px; font-weight: 700; letter-spacing: -.3px; color: var(--ink); display: inline-flex; align-items: baseline; }
    .val small { font-size: 18px; font-weight: 600; margin-right: 4px; }
    .ed-amt input { width: 150px; font: inherit; font-size: 30px; font-weight: 700; color: inherit; background: none; border: none; border-bottom: 2px solid var(--pos); outline: none; padding: 0; }
    .ok { width: 32px; height: 32px; border-radius: 50%; border: none; background: var(--pos); color: #fff; display: grid; place-items: center; cursor: pointer; padding: 0; }
    .ok mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .hint { font-size: 11px; color: var(--ink-soft); margin-top: 4px; }
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
    @media (hover: hover) { .flist li:not(.notes-ed):hover .chev { color: var(--ink); } .flist li:not(.notes-ed):hover .v { text-decoration: underline; text-decoration-color: var(--line-strong); } }
    .flist .add { flex: 1; display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; color: var(--pos); font-size: 14px; font-weight: 600; }
    .flist .add mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .flist li.notes-ed { flex-wrap: wrap; cursor: default; }
    .notes-ed .k { flex-basis: 100%; }
    .notes-ed textarea { width: 100%; box-sizing: border-box; resize: vertical; font: inherit; font-size: 14px; color: inherit; background: var(--app-card-bg); border: 1.5px solid var(--pos); border-radius: 8px; padding: 8px 10px; outline: none; }
    .ok-btn { margin-left: auto; height: 28px; padding: 0 14px; border: none; border-radius: 6px; background: var(--pos); color: #fff; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
    .dk-foot { display: flex; align-items: center; gap: 8px; margin-top: auto; padding-top: 28px; }
    .pay { flex: 1; height: 48px; display: inline-flex; align-items: center; justify-content: center; border-radius: 14px; border: none; background: var(--pos); color: #fff; font: inherit; font-size: 15px; font-weight: 600; white-space: nowrap; padding: 0 12px; cursor: pointer; transition: filter .15s, transform .12s; }
    .pay.undo { background: transparent; color: var(--ink); border: 1px solid var(--line-strong); }
    @media (hover: hover) { .pay:hover { filter: brightness(.96); } .pay.undo:hover { background: var(--app-bg); } }
    .ib { width: 48px; height: 48px; flex-shrink: 0; border-radius: 14px; border: none; background: var(--app-bg); color: var(--ink-2); display: grid; place-items: center; cursor: pointer; transition: filter .15s, transform .12s; }
    .ib mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .ib.del { color: var(--neg); }
    @media (hover: hover) { .ib:hover { filter: brightness(.95); } }
    .pay:active, .ib:active { transform: scale(.96); }
    /* painel interno */
    .scrim { position: absolute; inset: 0; background: rgba(0,0,0,.18); animation: fade .2s ease-out; z-index: 4; }
    .ov { position: absolute; left: 0; right: 0; bottom: 0; top: 150px; z-index: 5; display: flex; flex-direction: column; background: var(--app-card-bg); border-radius: 22px 22px 0 0; box-shadow: 0 -6px 24px rgba(0,0,0,.14); padding: 16px 20px 20px; animation: up .28s cubic-bezier(.2,.8,.2,1); }
    .ov.tall { top: 24px; }
    @keyframes up { from { transform: translateY(100%); } to { transform: none; } }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    .ov-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .ov-head b { font-size: 15px; font-weight: 600; }
    .search { height: 40px; box-sizing: border-box; border-radius: 10px; border: 1px solid var(--line-strong); background: var(--app-card-bg); font: inherit; font-size: 14px; color: inherit; padding: 0 12px; outline: none; margin-bottom: 10px; }
    .search:focus { border-color: var(--pos); }
    .ov-sec { font-size: 12px; font-weight: 600; letter-spacing: .4px; text-transform: uppercase; color: var(--ink-soft); margin: 4px 0 8px 6px; }
    .ov-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; margin: 0 -6px; padding: 0 6px; }
    .opt { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 6px 8px; border: none; border-radius: 10px; background: none; font: inherit; font-size: 14px; font-weight: 600; color: inherit; text-align: left; cursor: pointer; }
    .opt span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .opt.child { min-height: 36px; padding-left: 20px; font-weight: 400; color: var(--ink-2); }
    .opt.child .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-right: 10px; }
    .opt:disabled { opacity: .35; cursor: default; }
    @media (hover: hover) { .opt:not(:disabled):hover { background: var(--app-bg); } }
    .tick { color: var(--pos); font-size: 20px; width: 20px; height: 20px; }
    .none { color: var(--ink-soft); text-align: center; padding: 20px 0; }
    .today-row { display: flex; justify-content: flex-end; margin: -6px 4px 4px; }
    .cal { --mat-datepicker-calendar-date-selected-state-background-color: var(--pos); --mat-datepicker-calendar-date-today-outline-color: var(--line-strong); }
  `],
})
export class TransactionDetailDesk {
  readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly ref = inject(MatDialogRef<TransactionDetailDesk>);
  readonly t = signal<Transaction>(inject<Transaction>(MAT_DIALOG_DATA));
  readonly editing = signal<Field | null>(null);
  readonly picker = signal<Picker | null>(null);
  readonly busy = signal(false);
  private readonly box = viewChild<ElementRef<HTMLInputElement | HTMLTextAreaElement>>('box');
  private readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('search');
  draft = '';
  readonly query = signal('');

  constructor() {
    // Esc e o clique fora fecham a janela — exceto quando se está a editar um campo ou com um painel aberto (aí só fecham isso)
    this.ref.disableClose = true;
    this.ref.backdropClick().subscribe(() => this.close());
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEsc(ev: Event) {
    if (this.editing()) return; // o próprio campo trata do Esc
    ev.preventDefault();
    if (this.picker()) this.picker.set(null); else this.close();
  }

  close() { if (this.picker()) { this.picker.set(null); return; } if (this.editing()) { this.editing.set(null); return; } this.ref.close(); }
  closeWith(a: DetailAction) { this.ref.close(a); }

  // ---------- apresentação ----------
  cat() { const id = this.t().category_id; return id ? this.data.categoryMap().get(id) : undefined; }
  accObj(id: string | null) { return id ? this.data.accountMap().get(id) : undefined; }
  acc(id: string | null) { return id ? (this.data.accountMap().get(id)?.name ?? '—') : '—'; }
  name() { return this.t().kind === 'transfer' ? 'Transferência' : (this.cat()?.name ?? (this.t().kind === 'income' ? 'Receita' : 'Despesa')); }
  kindLabel() { return this.t().kind === 'expense' ? 'Despesa' : this.t().kind === 'income' ? 'Receita' : 'Transferência'; }
  abs() { return formatMoney(this.t().amount, false); }
  paidLabel() { return this.t().kind !== 'expense' ? (this.t().paid ? 'Recebido' : 'Não recebido') : (this.t().paid ? 'Pago' : 'Não pago'); }
  payAction() { const inc = this.t().kind !== 'expense'; return this.t().paid ? (inc ? 'Desfazer recebimento' : 'Desfazer pagamento') : (inc ? 'Marcar como recebido' : 'Marcar como pago'); }
  readonly rec = computed(() => this.data.recurrences().find((r) => r.id === this.t().recurrence_id) ?? null);
  repLabel() {
    const t = this.t();
    if (t.installment_no) return `Parcela ${t.installment_no}${this.rec()?.installments ? '/' + this.rec()!.installments : ''}`;
    return t.kind === 'income' ? 'Receita fixa' : t.kind === 'transfer' ? 'Transferência fixa' : 'Despesa fixa';
  }
  freqLabel() { const f = this.rec()?.frequency; return f ? (FREQUENCIES.find((x) => x.id === f)?.label.toLowerCase() ?? '') : ''; }
  longDate() { return LONG_DATE.format(fromIso(this.t().date)).replace(/ de (\p{L})/u, (_m, c: string) => ' de ' + c.toUpperCase()); }
  dateObj() { return fromIso(this.t().date); }
  today() { return fromIso(todayIso()); }
  pickerTitle() { const p = this.picker(); return p === 'category' ? 'Categoria' : p === 'date' ? 'Data' : p === 'to' ? 'Conta destino' : this.t().kind === 'transfer' ? 'Conta origem' : 'Conta'; }
  readonly catGroups = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.data.categoryGroups()
      .filter((g) => g.parent.kind === this.t().kind && !g.parent.archived)
      .map((g) => ({ parent: g.parent, children: g.children.filter((c) => !c.archived) }))
      .map((g) => (!q || g.parent.name.toLowerCase().includes(q) ? g : { ...g, children: g.children.filter((c) => c.name.toLowerCase().includes(q)) }))
      .filter((g) => !q || g.parent.name.toLowerCase().includes(q) || g.children.length)
      .sort((a, b) => a.parent.name.localeCompare(b.parent.name, 'pt'));
  });

  // ---------- edição no sítio ----------
  edit(f: Field) {
    if (this.busy()) return;
    this.picker.set(null);
    const t = this.t();
    this.draft = f === 'description' ? (t.description ?? '') : f === 'amount' ? formatMoney(t.amount, false).replace(/\./g, '') : (t.notes ?? '');
    this.editing.set(f);
    setTimeout(() => { const el = this.box()?.nativeElement; el?.focus(); if (el && f !== 'notes') el.select(); });
  }
  cancel(ev: Event) { ev.stopPropagation(); ev.preventDefault(); this.editing.set(null); }
  async commit() {
    const f = this.editing();
    if (!f) return;
    if (f === 'amount') {
      const v = Math.round(Number(this.draft.replace(/[€\s.]/g, '').replace(',', '.')) * 100) / 100;
      if (!(v > 0)) { this.ui.toast('Indica um valor maior que zero.'); return; }
      if (v !== this.t().amount) await this.save({ amount: v });
    } else if (f === 'description') {
      const d = this.draft.trim();
      if (d !== (this.t().description ?? '')) await this.save({ description: d });
    } else {
      const n = this.draft.trim() || null;
      if (n !== (this.t().notes ?? null)) await this.save({ notes: n });
    }
    this.editing.set(null);
  }

  open(p: Picker) {
    if (this.busy()) return;
    this.editing.set(null);
    this.query.set('');
    this.picker.set(p);
    if (p === 'category') setTimeout(() => this.searchBox()?.nativeElement.focus(), 60);
  }
  async pickCategory(id: string) { this.picker.set(null); if (id !== this.t().category_id) await this.save({ category_id: id }); }
  async pickAccount(id: string) {
    const p = this.picker(); this.picker.set(null);
    if (p === 'to') { if (id !== this.t().to_account_id) await this.save({ to_account_id: id }); }
    else if (id !== this.t().account_id) await this.save({ account_id: id });
  }
  async pickDate(d: Date | null) { this.picker.set(null); if (!d) return; const iso = toIso(d); if (iso !== this.t().date) await this.save({ date: iso }); }

  /** Receita ⇄ despesa: a categoria passa para a de defeito do novo tipo ("Outras receitas" / "Outros"), e abre-se a lista para escolher. */
  async switchKind() {
    const kind: TransactionKind = this.t().kind === 'expense' ? 'income' : 'expense';
    const name = kind === 'income' ? 'outras receitas' : 'outros';
    const cats = this.data.categories().filter((c) => c.kind === kind && !c.archived && c.name.trim().toLowerCase() === name);
    const cat = (cats.find((c) => !c.parent_id) ?? cats[0])?.id ?? null;
    if (await this.save({ kind, category_id: cat })) this.open('category');
  }

  async togglePaid() {
    const t = this.t(), paid = !t.paid;
    this.t.set({ ...t, paid });
    try { await this.data.setPaid(t.id, paid, t); this.ui.notice(`Movimento ${(paid ? '' : 'não ') + (t.kind === 'expense' ? 'pago' : 'recebido')}`); }
    catch (e) { this.t.set(t); this.ui.error(e); }
  }

  /** Grava uma alteração. Num movimento recorrente pergunta o alcance, como a janela de edição. */
  private async save(patch: Partial<Transaction>): Promise<boolean> {
    const before = this.t();
    const full: Transaction = { ...before, ...patch };
    try {
      if (before.recurrence_id) {
        const scope = await this.ui.recurrenceScope('Atualizar');
        if (!scope) return false;
        this.busy.set(true);
        if (scope === 'one') { const saved = await this.data.saveDetached(full); this.t.set(saved); }
        else { await this.data.saveAndFollowing(full, before.date); this.t.set(full); }
      } else {
        this.busy.set(true);
        this.t.set(await this.data.saveTransaction(full));
      }
      this.ui.notice('Movimento atualizado');
      return true;
    } catch (e) { this.t.set(before); this.ui.error(e); return false; }
    finally { this.busy.set(false); }
  }
}
