import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancelar</button>
      <button matButton="filled" [class.danger]="data.danger" [mat-dialog-close]="true">{{ data.okLabel }}</button>
    </mat-dialog-actions>
  `,
  styles: [`.danger { --mat-button-filled-container-color: var(--mat-sys-error); --mat-button-filled-label-text-color: var(--mat-sys-on-error); }`],
})
export class ConfirmDialog {
  readonly data = inject<{ title: string; message: string; okLabel: string; danger: boolean }>(MAT_DIALOG_DATA);
}
