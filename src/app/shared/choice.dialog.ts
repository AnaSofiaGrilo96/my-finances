import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface ChoiceOption<T = string> { value: T; label: string; primary?: boolean; danger?: boolean; }
export interface ChoiceData<T = string> { title: string; message?: string; options: ChoiceOption<T>[]; cancelLabel?: string; }

/** Pergunta com botões empilhados (à imagem da outra aplicação de gestão de finanças): "O que deseja fazer?" → opções + Cancelar. */
@Component({
  selector: 'app-choice-dialog',
  imports: [MatDialogModule],
  template: `
    <div class="box">
      <h2>{{ data.title }}</h2>
      @if (data.message) { <p>{{ data.message }}</p> }
      <div class="opts">
        @for (o of data.options; track $index) {
          <button type="button" class="opt" [class.primary]="o.primary" [class.danger]="o.danger" (click)="ref.close(o.value)">{{ o.label }}</button>
        }
        <button type="button" class="opt cancel" (click)="ref.close(undefined)">{{ data.cancelLabel || 'Cancelar' }}</button>
      </div>
    </div>
  `,
  styles: [`
    .box { padding: 26px 22px 22px; text-align: center; }
    h2 { margin: 0; font-size: 19px; font-weight: 600; line-height: 1.35; }
    p { margin: 10px 0 0; color: var(--mat-sys-on-surface-variant); font-size: 14px; line-height: 1.4; }
    .opts { display: flex; flex-direction: column; gap: 12px; margin-top: 24px; }
    .opt { width: 100%; border: none; border-radius: 14px; padding: 16px; font: inherit; font-size: 17px; font-weight: 600; cursor: pointer;
           background: var(--mat-sys-surface-container-highest); color: var(--mat-sys-primary); transition: transform .12s ease, filter .15s ease; }
    .opt:hover { filter: brightness(1.06); } .opt:active { transform: scale(.97); }
    .opt.primary { background: var(--mat-sys-primary); color: var(--mat-sys-on-primary); }
    .opt.danger { background: var(--mat-sys-error); color: var(--mat-sys-on-error); }
    .opt.cancel { background: none; border: 1.5px solid var(--mat-sys-outline-variant); color: var(--mat-sys-on-surface); font-weight: 500; width: auto; align-self: center; padding: 14px 56px; margin-top: 4px; }
  `],
})
export class ChoiceDialog<T = string> {
  readonly data = inject<ChoiceData<T>>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ChoiceDialog<T>, T | undefined>);
}
