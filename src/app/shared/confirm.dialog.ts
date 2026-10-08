import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

/** Confirmação com título centrado, texto e botão grande (vermelho quando é destrutivo) + "Cancelar" por baixo. */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule],
  template: `
    <div class="box">
      <h2>{{ data.title }}</h2>
      <p>{{ data.message }}</p>
      <button type="button" class="ok" [class.danger]="data.danger" (click)="ref.close(true)">{{ data.okLabel }}</button>
      <button type="button" class="cancel" (click)="ref.close(false)">Cancelar</button>
    </div>
  `,
  styles: [`
    .box { padding: 28px 24px 20px; text-align: center; display: flex; flex-direction: column; align-items: stretch; }
    h2 { margin: 0; font-size: 21px; font-weight: 600; line-height: 1.3; }
    p { margin: 14px 0 0; color: var(--mat-sys-on-surface-variant); font-size: 15px; line-height: 1.45; }
    .ok { margin-top: 24px; border: none; border-radius: 14px; padding: 16px; font: inherit; font-size: 17px; font-weight: 600; cursor: pointer;
          background: var(--mat-sys-primary); color: var(--mat-sys-on-primary); transition: transform .12s ease, filter .15s ease; }
    .ok.danger { background: #e5484d; color: #fff; }
    .ok:hover { filter: brightness(1.06); } .ok:active { transform: scale(.97); }
    .cancel { margin-top: 10px; border: none; background: none; padding: 14px; font: inherit; font-size: 17px; font-weight: 500; color: var(--mat-sys-on-surface-variant); cursor: pointer; border-radius: 12px; }
    .cancel:hover { background: var(--mat-sys-surface-container); }
  `],
})
export class ConfirmDialog {
  readonly data = inject<{ title: string; message: string; okLabel: string; danger: boolean }>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ConfirmDialog>);
}
