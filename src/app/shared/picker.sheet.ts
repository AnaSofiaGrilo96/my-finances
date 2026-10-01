import { Component, inject } from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetModule, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatIconModule } from '@angular/material/icon';
import { IconBadge } from './icon-badge';

export interface PickerItem { id: string | null; label: string; icon?: string; color?: string; sub?: boolean; hint?: string; }
export interface PickerData { title: string; items: PickerItem[]; selected?: string | null; }

/** Folha inferior com uma lista de opções (categorias, contas…). Devolve o id escolhido. */
@Component({
  selector: 'app-picker-sheet',
  imports: [MatBottomSheetModule, MatIconModule, IconBadge],
  template: `
    <div class="head"><span class="grab"></span><h3>{{ data.title }}</h3></div>
    <div class="list">
      @for (it of data.items; track $index) {
        <button type="button" class="item" [class.sub]="it.sub" [class.sel]="it.id === data.selected" (click)="pick(it)">
          @if (it.icon) { <app-icon-badge [icon]="it.icon" [color]="it.color ?? '#90a4ae'" [size]="it.sub ? 28 : 36" /> }
          <span class="label">{{ it.label }} @if (it.hint) { <small>{{ it.hint }}</small> }</span>
          @if (it.id === data.selected) { <mat-icon>check</mat-icon> }
        </button>
      }
    </div>
  `,
  styles: [`
    :host { display: block; max-height: 70dvh; }
    .head { position: sticky; top: 0; background: inherit; padding: 6px 16px 8px; text-align: center; }
    .grab { display: block; width: 36px; height: 4px; border-radius: 2px; background: var(--mat-sys-outline-variant); margin: 0 auto 10px; }
    h3 { margin: 0; font-size: 16px; font-weight: 500; }
    .list { padding: 0 8px 12px; }
    .item { display: flex; align-items: center; gap: 12px; width: 100%; background: none; border: none; font: inherit; color: inherit; text-align: left; padding: 10px 12px; border-radius: 12px; cursor: pointer; min-height: 48px; }
    .item:hover { background: var(--mat-sys-surface-container-high); }
    .item.sel { background: var(--mat-sys-secondary-container); }
    .item.sub { padding-left: 36px; }
    .label { flex: 1; font-size: 15px; } .label small { color: var(--mat-sys-on-surface-variant); margin-left: 6px; }
  `],
})
export class PickerSheet {
  readonly data = inject<PickerData>(MAT_BOTTOM_SHEET_DATA);
  private readonly ref = inject(MatBottomSheetRef<PickerSheet>);
  pick(it: PickerItem) { this.ref.dismiss(it); }
}
