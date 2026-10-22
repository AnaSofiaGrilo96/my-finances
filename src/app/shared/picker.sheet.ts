import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetModule, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatIconModule } from '@angular/material/icon';
import { IconBadge } from './icon-badge';

export interface PickerItem { id: string | null; label: string; icon?: string; color?: string; sub?: boolean; hint?: string; }
export interface PickerData {
  title: string;
  items: PickerItem[];
  selected?: string | null;
  /** Grelha de ícones com pesquisa e troca lista/grelha (categorias, 22/10 — como na outra aplicação de gestão de finanças). */
  grid?: boolean;
  /** Mostra um primeiro quadrado "Criar …"; escolhê-lo devolve { id: PICKER_CREATE }. */
  createLabel?: string;
}
export const PICKER_CREATE = '__create__';
const VIEW_KEY = 'mf-picker-view';

/** Folha inferior para escolher uma opção (categorias, contas…). Devolve o item escolhido. */
@Component({
  selector: 'app-picker-sheet',
  imports: [MatBottomSheetModule, MatIconModule, IconBadge, FormsModule],
  template: `
    <div class="head">
      <span class="grab"></span>
      <h3>{{ data.title }}</h3>
      <button type="button" class="x" (click)="close()" aria-label="Fechar"><mat-icon>close</mat-icon></button>
      @if (data.grid) {
        <div class="tools">
          <label class="search">
            <input type="text" [ngModel]="q()" (ngModelChange)="q.set($event)" placeholder="Pesquisar uma categoria" autocomplete="off" enterkeyhint="search" />
            <mat-icon>search</mat-icon>
          </label>
          <button type="button" class="view" [class.on]="view() === 'list'" (click)="setView('list')" aria-label="Ver em lista"><mat-icon>view_agenda</mat-icon></button>
          <button type="button" class="view" [class.on]="view() === 'grid'" (click)="setView('grid')" aria-label="Ver em grelha"><mat-icon>grid_view</mat-icon></button>
        </div>
      }
    </div>

    @if (data.grid && view() === 'grid') {
      <div class="grid">
        @if (data.createLabel && !q()) {
          <button type="button" class="tile create" (click)="create()">
            <span class="plus"><mat-icon>add</mat-icon></span>
            <span class="name">{{ data.createLabel }}</span>
          </button>
        }
        @for (it of shown(); track $index) {
          <button type="button" class="tile" [class.sel]="it.id === data.selected" (click)="pick(it)">
            <span class="ring"><app-icon-badge [icon]="it.icon ?? 'label'" [color]="it.color ?? '#90a4ae'" [size]="48" /></span>
            <span class="name">{{ it.label }}</span>
          </button>
        } @empty { <p class="none">Nenhuma categoria com "{{ q() }}".</p> }
      </div>
    } @else {
      <div class="list">
        @if (data.createLabel && !q()) {
          <button type="button" class="item create" (click)="create()"><span class="plus small"><mat-icon>add</mat-icon></span><span class="label">{{ data.createLabel }}</span></button>
        }
        @for (it of shown(); track $index) {
          <button type="button" class="item" [class.sub]="it.sub && !q()" [class.sel]="it.id === data.selected" (click)="pick(it)">
            @if (it.icon) { <app-icon-badge [icon]="it.icon" [color]="it.color ?? '#90a4ae'" [size]="it.sub && !q() ? 28 : 36" /> }
            <span class="label">{{ it.label }} @if (it.hint) { <small>{{ it.hint }}</small> }</span>
            @if (it.id === data.selected) { <mat-icon>check</mat-icon> }
          </button>
        } @empty { <p class="none">Nada com "{{ q() }}".</p> }
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .head { position: sticky; top: 0; z-index: 1; background: inherit; padding: 6px 16px 10px; text-align: center; }
    .grab { display: block; width: 44px; height: 4px; border-radius: 2px; background: var(--mat-sys-outline-variant); margin: 0 auto 14px; }
    h3 { margin: 0; font-size: 17px; font-weight: 500; line-height: 32px; padding: 0 40px; }
    .x { position: absolute; right: 8px; top: 22px; width: 40px; height: 40px; border: none; background: none; color: inherit; border-radius: 50%; display: grid; place-items: center; cursor: pointer; }
    .tools { display: flex; align-items: center; gap: 4px; margin-top: 14px; }
    .search { flex: 1; display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 14px; border: 1px solid var(--mat-sys-outline-variant); border-radius: 10px; }
    .search input { flex: 1; min-width: 0; border: none; background: none; outline: none; font: inherit; font-size: 16px; color: inherit; }
    .search mat-icon { color: var(--mat-sys-on-surface-variant); }
    .view { width: 40px; height: 40px; border: none; background: none; border-radius: 8px; display: grid; place-items: center; color: var(--mat-sys-on-surface-variant); cursor: pointer; }
    .view.on { color: #1eb980; }
    /* grelha de 4 colunas: ícone 48px e nome por baixo (até 2 linhas) */
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px 4px; padding: 6px 8px 20px; }
    .tile { display: flex; flex-direction: column; align-items: center; gap: 8px; border: none; background: none; color: inherit; font: inherit; padding: 4px 2px; cursor: pointer; border-radius: 12px; min-width: 0; -webkit-tap-highlight-color: transparent; }
    .tile:active .ring { transform: scale(.92); }
    .ring { display: inline-flex; border-radius: 50%; padding: 3px; border: 2px solid transparent; transition: transform .12s; }
    .tile.sel .ring { border-color: #1eb980; }
    .name { font-size: 14px; line-height: 1.25; text-align: center; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
    .plus { width: 48px; height: 48px; margin: 5px; border-radius: 50%; display: grid; place-items: center; background: var(--mat-sys-surface-container-highest); color: var(--mat-sys-on-surface-variant); }
    .plus.small { width: 36px; height: 36px; margin: 0; }
    .create .name, .create .label { color: var(--mat-sys-on-surface-variant); }
    .list { padding: 0 8px 12px; }
    .item { display: flex; align-items: center; gap: 12px; width: 100%; background: none; border: none; font: inherit; color: inherit; text-align: left; padding: 10px 12px; border-radius: 12px; cursor: pointer; min-height: 48px; }
    .item:hover { background: var(--mat-sys-surface-container-high); }
    .item.sel { background: var(--mat-sys-secondary-container); }
    .item.sub { padding-left: 36px; }
    .label { flex: 1; font-size: 15px; } .label small { color: var(--mat-sys-on-surface-variant); margin-left: 6px; }
    .none { grid-column: 1 / -1; text-align: center; color: var(--mat-sys-on-surface-variant); padding: 24px 0; }
  `],
})
export class PickerSheet {
  readonly data = inject<PickerData>(MAT_BOTTOM_SHEET_DATA);
  private readonly ref = inject(MatBottomSheetRef<PickerSheet>);
  readonly q = signal('');
  readonly view = signal<'grid' | 'list'>(readView());
  /** Pesquisa sem acentos nem maiúsculas. */
  readonly shown = computed(() => {
    const q = norm(this.q().trim());
    return q ? this.data.items.filter((it) => norm(it.label).includes(q)) : this.data.items;
  });
  setView(v: 'grid' | 'list') { this.view.set(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } }
  pick(it: PickerItem) { this.ref.dismiss(it); }
  create() { this.ref.dismiss({ id: PICKER_CREATE, label: '' } satisfies PickerItem); }
  close() { this.ref.dismiss(); }
}

function norm(s: string) { return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase(); }
function readView(): 'grid' | 'list' { try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; } }
