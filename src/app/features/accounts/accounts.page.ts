import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataService } from '../../core/data.service';
import { ACCOUNT_TYPES, Account, PALETTE } from '../../core/models';
import { MoneyPipe } from '../../shared/money.pipe';
import { IconBadge } from '../../shared/icon-badge';
import { UiService } from '../../shared/ui.service';

@Component({
  selector: 'app-account-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule, MatIconModule, IconBadge],
  template: `
    <h2 mat-dialog-title>{{ account ? 'Editar conta' : 'Nova conta' }}</h2>
    <mat-dialog-content>
      <div class="preview"><app-icon-badge [icon]="icon" [color]="color" [size]="56" /><span>{{ name || 'Nome da conta' }}</span></div>
      <form class="form" (ngSubmit)="save()">
        <mat-form-field><mat-label>Nome</mat-label><input matInput [(ngModel)]="name" name="name" required /></mat-form-field>
        <mat-form-field>
          <mat-label>Tipo</mat-label>
          <mat-select [(ngModel)]="type" name="type" (ngModelChange)="onType($event)">
            @for (t of types; track t.id) { <mat-option [value]="t.id">{{ t.label }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Saldo inicial</mat-label>
          <span matTextPrefix>€&nbsp;</span>
          <input matInput type="number" step="0.01" inputmode="decimal" [(ngModel)]="initialBalance" name="initial" />
          <mat-hint>Saldo que a conta tinha antes do primeiro movimento registado.</mat-hint>
        </mat-form-field>
        <div class="label">Cor</div>
        <div class="swatches">
          @for (c of palette; track c) { <button type="button" class="swatch" [style.background]="c" [class.sel]="c === color" (click)="color = c"></button> }
        </div>
        @if (account) { <mat-slide-toggle [(ngModel)]="archived" name="archived">Arquivada (não aparece nos totais)</mat-slide-toggle> }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancelar</button>
      <button matButton="filled" (click)="save()" [disabled]="!name.trim() || busy()">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .preview { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; font-size: 18px; }
    .form { display: flex; flex-direction: column; }
    .label { font-size: 12px; color: var(--mat-sys-on-surface-variant); margin: 8px 0 6px; }
    .swatches { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .swatch { width: 30px; height: 30px; border-radius: 50%; border: 3px solid transparent; cursor: pointer; padding: 0; }
    .swatch.sel { border-color: var(--mat-sys-on-surface); }
  `],
})
export class AccountDialog {
  private readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly ref = inject(MatDialogRef<AccountDialog>);
  readonly account = inject<Account | null>(MAT_DIALOG_DATA, { optional: true });
  readonly types = ACCOUNT_TYPES;
  readonly palette = PALETTE;
  readonly busy = signal(false);

  name = this.account?.name ?? '';
  type = this.account?.type ?? 'checking';
  icon = this.account?.icon ?? 'account_balance_wallet';
  color = this.account?.color ?? PALETTE[0];
  initialBalance: number = this.account?.initial_balance ?? 0;
  archived = this.account?.archived ?? false;

  onType(t: Account['type']) { this.icon = ACCOUNT_TYPES.find((x) => x.id === t)?.icon ?? 'account_balance'; }

  async save() {
    this.busy.set(true);
    try {
      await this.data.saveAccount({
        id: this.account?.id, name: this.name.trim(), type: this.type, icon: this.icon, color: this.color,
        initial_balance: Number(this.initialBalance) || 0, archived: this.archived,
        sort_order: this.account?.sort_order ?? this.data.accounts().length,
      });
      this.ref.close(true);
    } catch (e) { this.ui.error(e); } finally { this.busy.set(false); }
  }
}

@Component({
  selector: 'app-adjust-balance-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MoneyPipe],
  template: `
    <h2 mat-dialog-title>Acertar saldo — {{ account.name }}</h2>
    <mat-dialog-content>
      <p class="muted">Saldo atual na app: <b>{{ current | money }}</b></p>
      <mat-form-field class="full">
        <mat-label>Saldo real</mat-label>
        <span matTextPrefix>€&nbsp;</span>
        <input matInput type="number" step="0.01" inputmode="decimal" [(ngModel)]="value" name="value" autofocus (keyup.enter)="save()" />
      </mat-form-field>
      @if (diff() !== 0) {
        <p class="hint">Vai ser criado um movimento <b>"Ajuste de saldo"</b> de <b [class.income]="diff() > 0" [class.expense]="diff() < 0">{{ diff() | money:'signed' }}</b> na categoria Outros, com a data de hoje.</p>
      } @else { <p class="hint muted">Sem diferença — nada a criar.</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancelar</button>
      <button matButton="filled" (click)="save()" [disabled]="busy() || diff() === 0">Acertar</button>
    </mat-dialog-actions>
  `,
  styles: [`.full { width: 100%; } .hint { font-size: 13px; margin: 0; } p.muted { margin-top: 0; }`],
})
export class AdjustBalanceDialog {
  private readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly ref = inject(MatDialogRef<AdjustBalanceDialog>);
  readonly account = inject<Account>(MAT_DIALOG_DATA);
  readonly current = this.data.balances()[this.account.id] ?? this.account.initial_balance;
  readonly busy = signal(false);
  value: number = this.current;
  diff() { return Math.round((Number(this.value) - this.current) * 100) / 100; }
  async save() {
    this.busy.set(true);
    try { await this.data.adjustBalance(this.account.id, Number(this.value)); this.ui.toast('Saldo acertado.'); this.ref.close(true); }
    catch (e) { this.ui.error(e); } finally { this.busy.set(false); }
  }
}

@Component({
  selector: 'app-accounts-page',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, RouterLink, MoneyPipe, IconBadge],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Contas</h1>
        <button matButton="filled" (click)="add()"><mat-icon>add</mat-icon>Nova conta</button>
      </div>

      <p class="muted intro">Para acertar o saldo de uma conta com o valor real usa <mat-icon class="inl">edit</mat-icon> — a app cria automaticamente um movimento "Ajuste de saldo" com a diferença.</p>
      <div class="card total">
        <span class="muted">Saldo geral</span>
        <b [class.expense]="data.totalBalance() < 0">{{ data.totalBalance() | money }}</b>
      </div>

      @if (!data.accounts().length) {
        <div class="card empty"><mat-icon>account_balance</mat-icon><p>Ainda não tens contas. Cria a primeira (ex.: conta à ordem, poupança, numerário).</p></div>
      }

      <div class="card rows">
        @for (a of active(); track a.id) {
          <div class="row">
            <app-icon-badge [icon]="a.icon" [color]="a.color" />
            <div class="main">
              <div class="title">{{ a.name }}</div>
              <div class="sub">{{ typeLabel(a) }}</div>
            </div>
            <div class="amount" [class.expense]="balance(a) < 0">{{ balance(a) | money }}</div>
            <button matIconButton (click)="adjust(a)" matTooltip="Acertar saldo"><mat-icon>edit</mat-icon></button>
            <button matIconButton [matMenuTriggerFor]="m"><mat-icon>more_vert</mat-icon></button>
            <mat-menu #m="matMenu">
              <button mat-menu-item [routerLink]="['/movimentos']" [queryParams]="{ conta: a.id }"><mat-icon>receipt_long</mat-icon>Ver movimentos</button>
              <button mat-menu-item (click)="adjust(a)"><mat-icon>edit</mat-icon>Acertar saldo</button>
              <button mat-menu-item (click)="edit(a)"><mat-icon>tune</mat-icon>Editar conta</button>
              <button mat-menu-item (click)="move(a, -1)" [disabled]="$first"><mat-icon>arrow_upward</mat-icon>Subir</button>
              <button mat-menu-item (click)="move(a, 1)" [disabled]="$last"><mat-icon>arrow_downward</mat-icon>Descer</button>
              <button mat-menu-item (click)="remove(a)"><mat-icon>delete</mat-icon>Apagar</button>
            </mat-menu>
          </div>
        }
      </div>

      @if (archived().length) {
        <h2 class="muted section">Arquivadas</h2>
        <div class="card rows">
          @for (a of archived(); track a.id) {
            <div class="row clickable" (click)="edit(a)">
              <app-icon-badge [icon]="a.icon" [color]="a.color" />
              <div class="main"><div class="title">{{ a.name }}</div><div class="sub">{{ typeLabel(a) }}</div></div>
              <div class="amount muted">{{ balance(a) | money }}</div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .intro { margin: -4px 0 14px; font-size: 13px; } .inl { font-size: 16px; width: 16px; height: 16px; vertical-align: -3px; }
    .total { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
    .total b { font-size: 24px; }
    .rows { padding: 4px 12px; }
    .section { font-size: 14px; font-weight: 500; margin: 20px 4px 8px; }
  `],
})
export class AccountsPage {
  readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly dialog = inject(MatDialog);

  readonly active = computed(() => this.data.accounts().filter((a) => !a.archived));
  readonly archived = computed(() => this.data.accounts().filter((a) => a.archived));

  balance(a: Account) { return this.data.balances()[a.id] ?? a.initial_balance; }
  typeLabel(a: Account) { return ACCOUNT_TYPES.find((t) => t.id === a.type)?.label ?? a.type; }

  add() { this.dialog.open(AccountDialog, { width: '440px', maxWidth: '96vw' }); }
  edit(a: Account) { this.dialog.open(AccountDialog, { width: '440px', maxWidth: '96vw', data: a }); }
  adjust(a: Account) { this.dialog.open(AdjustBalanceDialog, { width: '400px', maxWidth: '96vw', data: a }); }

  async move(a: Account, dir: number) {
    const ids = this.active().map((x) => x.id);
    const i = ids.indexOf(a.id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await this.data.reorderAccounts([...ids, ...this.archived().map((x) => x.id)]); } catch (e) { this.ui.error(e); }
  }

  async remove(a: Account) {
    if (!(await this.ui.confirm('Apagar conta', `Só é possível apagar "${a.name}" se não tiver movimentos. Em alternativa, arquiva-a.`, 'Apagar'))) return;
    try { await this.data.deleteAccount(a.id); this.ui.toast('Conta apagada.'); }
    catch (e) { this.ui.error({ message: 'A conta tem movimentos associados. Arquiva-a em vez de apagar.' }); console.error(e); }
  }
}
