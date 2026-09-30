import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { DataService } from '../../core/data.service';
import { Category, CategoryKind, ICONS, PALETTE } from '../../core/models';
import { IconBadge } from '../../shared/icon-badge';
import { UiService } from '../../shared/ui.service';

@Component({
  selector: 'app-category-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatButtonToggleModule, MatSlideToggleModule, MatIconModule, IconBadge],
  template: `
    <h2 mat-dialog-title>{{ category ? 'Editar categoria' : 'Nova categoria' }}</h2>
    <mat-dialog-content>
      <div class="preview"><app-icon-badge [icon]="icon" [color]="color" [size]="56" /><span>{{ name || 'Nome da categoria' }}</span></div>
      <form class="form" (ngSubmit)="save()">
        @if (!category) {
          <mat-button-toggle-group [(ngModel)]="kind" name="kind" class="kinds" hideSingleSelectionIndicator>
            <mat-button-toggle value="expense">Despesa</mat-button-toggle>
            <mat-button-toggle value="income">Receita</mat-button-toggle>
          </mat-button-toggle-group>
        }
        <mat-form-field><mat-label>Nome</mat-label><input matInput [(ngModel)]="name" name="name" required /></mat-form-field>
        <div class="label">Cor</div>
        <div class="swatches">
          @for (c of palette; track c) { <button type="button" class="swatch" [style.background]="c" [class.sel]="c === color" (click)="color = c"></button> }
        </div>
        <div class="label">Ícone</div>
        <div class="icons">
          @for (i of icons; track i) {
            <button type="button" class="ic" [class.sel]="i === icon" (click)="icon = i"><mat-icon>{{ i }}</mat-icon></button>
          }
        </div>
        @if (category) { <mat-slide-toggle [(ngModel)]="archived" name="archived">Arquivada (não aparece ao criar lançamentos)</mat-slide-toggle> }
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
    .kinds { display: flex; margin-bottom: 16px; } .kinds mat-button-toggle { flex: 1; }
    .label { font-size: 12px; color: var(--mat-sys-on-surface-variant); margin: 8px 0 6px; }
    .swatches { display: flex; flex-wrap: wrap; gap: 8px; }
    .swatch { width: 30px; height: 30px; border-radius: 50%; border: 3px solid transparent; cursor: pointer; padding: 0; }
    .swatch.sel { border-color: var(--mat-sys-on-surface); }
    .icons { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 16px; max-height: 160px; overflow: auto; }
    .ic { width: 40px; height: 40px; border-radius: 10px; border: none; background: none; cursor: pointer; color: var(--mat-sys-on-surface-variant); display: grid; place-items: center; }
    .ic.sel { background: var(--mat-sys-secondary-container); color: var(--mat-sys-on-secondary-container); }
  `],
})
export class CategoryDialog {
  private readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly ref = inject(MatDialogRef<CategoryDialog>);
  readonly input = inject<{ category?: Category; kind?: CategoryKind } | null>(MAT_DIALOG_DATA, { optional: true });
  readonly category = this.input?.category ?? null;
  readonly palette = PALETTE;
  readonly icons = ICONS;
  readonly busy = signal(false);

  kind: CategoryKind = this.category?.kind ?? this.input?.kind ?? 'expense';
  name = this.category?.name ?? '';
  icon = this.category?.icon ?? 'label';
  color = this.category?.color ?? PALETTE[1];
  archived = this.category?.archived ?? false;

  async save() {
    this.busy.set(true);
    try {
      await this.data.saveCategory({
        id: this.category?.id, name: this.name.trim(), kind: this.kind, icon: this.icon, color: this.color, archived: this.archived,
        sort_order: this.category?.sort_order ?? this.data.categories().length,
      });
      this.ref.close(true);
    } catch (e) { this.ui.error(e); } finally { this.busy.set(false); }
  }
}

@Component({
  selector: 'app-categories-page',
  imports: [MatButtonModule, MatIconModule, MatTabsModule, MatMenuModule, RouterLink, IconBadge],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Categorias</h1>
        <button matButton="filled" (click)="add()"><mat-icon>add</mat-icon>Nova categoria</button>
      </div>

      @if (!data.categories().length) {
        <div class="card empty">
          <mat-icon>category</mat-icon>
          <p>Ainda não tens categorias.</p>
          <button matButton="filled" (click)="seed()" [disabled]="seeding()">Criar categorias sugeridas</button>
        </div>
      }

      <mat-tab-group (selectedIndexChange)="tab.set($event === 0 ? 'expense' : 'income')" mat-stretch-tabs="false">
        <mat-tab label="Despesas" />
        <mat-tab label="Receitas" />
      </mat-tab-group>

      <div class="card rows">
        @for (c of list(); track c.id) {
          <div class="row" [class.muted]="c.archived">
            <app-icon-badge [icon]="c.icon" [color]="c.color" />
            <div class="main"><div class="title">{{ c.name }} @if (c.archived) { <small>(arquivada)</small> }</div></div>
            <button matIconButton [matMenuTriggerFor]="m"><mat-icon>more_vert</mat-icon></button>
            <mat-menu #m="matMenu">
              <button mat-menu-item [routerLink]="['/lancamentos']" [queryParams]="{ categoria: c.id }"><mat-icon>receipt_long</mat-icon>Ver lançamentos</button>
              <button mat-menu-item (click)="edit(c)"><mat-icon>edit</mat-icon>Editar</button>
              <button mat-menu-item (click)="remove(c)"><mat-icon>delete</mat-icon>Apagar</button>
            </mat-menu>
          </div>
        } @empty {
          <p class="empty">Sem categorias de {{ tab() === 'expense' ? 'despesa' : 'receita' }}.</p>
        }
      </div>
    </div>
  `,
  styles: [`.rows { padding: 4px 12px; margin-top: 12px; }`],
})
export class CategoriesPage {
  readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly dialog = inject(MatDialog);
  readonly tab = signal<CategoryKind>('expense');
  readonly seeding = signal(false);

  readonly list = computed(() => this.data.categories().filter((c) => c.kind === this.tab()).sort((a, b) => Number(a.archived) - Number(b.archived) || a.sort_order - b.sort_order || a.name.localeCompare(b.name)));

  add() { this.dialog.open(CategoryDialog, { width: '460px', maxWidth: '96vw', data: { kind: this.tab() } }); }
  edit(c: Category) { this.dialog.open(CategoryDialog, { width: '460px', maxWidth: '96vw', data: { category: c } }); }

  async seed() {
    this.seeding.set(true);
    try { await this.data.seedDefaultCategories(); this.ui.toast('Categorias criadas. Podes editá-las à vontade.'); }
    catch (e) { this.ui.error(e); } finally { this.seeding.set(false); }
  }

  async remove(c: Category) {
    if (!(await this.ui.confirm('Apagar categoria', `Os lançamentos de "${c.name}" ficam sem categoria. Em alternativa, arquiva-a.`, 'Apagar'))) return;
    try { await this.data.deleteCategory(c.id); this.data.version.update((v) => v + 1); } catch (e) { this.ui.error(e); }
  }
}
