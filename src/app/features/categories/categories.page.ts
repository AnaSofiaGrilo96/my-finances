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
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataService } from '../../core/data.service';
import { Category, CategoryKind, ICONS, PALETTE } from '../../core/models';
import { IconBadge } from '../../shared/icon-badge';
import { UiService } from '../../shared/ui.service';

@Component({
  selector: 'app-category-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonToggleModule, MatSlideToggleModule, MatIconModule, IconBadge],
  template: `
    <h2 mat-dialog-title>{{ category ? 'Editar categoria' : (parentId ? 'Nova sub-categoria' : 'Nova categoria') }}</h2>
    <mat-dialog-content>
      <div class="preview"><app-icon-badge [icon]="icon" [color]="color" [size]="56" /><span>{{ name || 'Nome da categoria' }}</span></div>
      <form class="form" (ngSubmit)="save()">
        @if (!category && !parentId) {
          <mat-button-toggle-group [(ngModel)]="kind" name="kind" class="kinds" hideSingleSelectionIndicator>
            <mat-button-toggle value="expense">Despesa</mat-button-toggle>
            <mat-button-toggle value="income">Receita</mat-button-toggle>
          </mat-button-toggle-group>
        }
        <mat-form-field><mat-label>Nome</mat-label><input matInput [(ngModel)]="name" name="name" required /></mat-form-field>
        @if (!hasChildren) {
          <mat-form-field>
            <mat-label>Sub-categoria de</mat-label>
            <mat-select [(ngModel)]="parentId" name="parent" (ngModelChange)="onParent($event)">
              <mat-option [value]="null"><em>Nenhuma (categoria principal)</em></mat-option>
              @for (p of parents(); track p.id) { <mat-option [value]="p.id">{{ p.name }}</mat-option> }
            </mat-select>
          </mat-form-field>
        }
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
        @if (category) { <mat-slide-toggle [(ngModel)]="archived" name="archived">Arquivada (não aparece ao criar movimentos)</mat-slide-toggle> }
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
    /* telemóvel (22/10): letra 1–2px mais pequena (gerado a partir dos tamanhos acima) */
    @media (max-width: 899px) { .preview { font-size: 16px; } .label { font-size: 11px; } }
  `],
})
export class CategoryDialog {
  private readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly ref = inject(MatDialogRef<CategoryDialog>);
  readonly input = inject<{ category?: Category; kind?: CategoryKind; parentId?: string } | null>(MAT_DIALOG_DATA, { optional: true });
  readonly category = this.input?.category ?? null;
  readonly palette = PALETTE;
  readonly icons = ICONS;
  readonly busy = signal(false);

  parentId: string | null = this.category?.parent_id ?? this.input?.parentId ?? null;
  private readonly parentCat = this.parentId ? this.data.categoryMap().get(this.parentId) : undefined;
  kind: CategoryKind = this.category?.kind ?? this.parentCat?.kind ?? this.input?.kind ?? 'expense';
  name = this.category?.name ?? '';
  icon = this.category?.icon ?? this.parentCat?.icon ?? 'label';
  color = this.category?.color ?? this.parentCat?.color ?? PALETTE[1];
  archived = this.category?.archived ?? false;
  /** Uma categoria com filhas não pode passar a sub-categoria. */
  readonly hasChildren = !!this.category && this.data.categories().some((c) => c.parent_id === this.category!.id);

  readonly parents = computed(() => this.data.categories().filter((c) => c.kind === this.kind && !c.parent_id && c.id !== this.category?.id && !c.archived));

  onParent(id: string | null) {
    const p = id ? this.data.categoryMap().get(id) : undefined;
    if (p && !this.category) { this.icon = p.icon; this.color = p.color; }
  }

  async save() {
    this.busy.set(true);
    try {
      const saved = await this.data.saveCategory({
        id: this.category?.id, name: this.name.trim(), kind: this.kind, icon: this.icon, color: this.color, archived: this.archived,
        parent_id: this.parentId, sort_order: this.category?.sort_order ?? this.data.categories().length,
      });
      this.ref.close(saved); // devolve a categoria gravada (a janela de movimento escolhe-a logo, 22/10)
    } catch (e) { this.ui.error(e); } finally { this.busy.set(false); }
  }
}

@Component({
  selector: 'app-categories-page',
  imports: [MatButtonModule, MatIconModule, MatTabsModule, MatMenuModule, MatTooltipModule, RouterLink, IconBadge],
  template: `
    <div class="page sheet">
      <div class="page-header">
        <h1>Categorias</h1>
        <button matButton="filled" class="new-btn" (click)="add()">
          <mat-icon class="m-only">add</mat-icon><mat-icon class="d-only" fontSet="material-icons-outlined">add_circle_outline</mat-icon>
          <span class="m-only">Nova categoria</span><span class="d-only">Categoria de {{ tab() === 'expense' ? 'despesa' : 'receita' }}</span>
        </button>
      </div>

      @if (!data.categories().length) {
        <div class="card empty">
          <mat-icon>category</mat-icon>
          <p>Ainda não tens categorias.</p>
          <button matButton="filled" (click)="seed()" [disabled]="seeding()">Criar categorias sugeridas</button>
        </div>
      }

      <!-- Computador (10/11, como na outra aplicação de gestão de finanças): separadores a meio-meio, ligação para as arquivadas,
           linhas com o ícone grande e as ações "arquivar" e "+ sub-categoria" em texto azul; sub-categorias só com o nome -->
      <mat-tab-group class="ctabs" (selectedIndexChange)="tab.set($event === 0 ? 'expense' : 'income')" [mat-stretch-tabs]="wide">
        <mat-tab label="Despesas" />
        <mat-tab label="Receitas" />
      </mat-tab-group>

      @if (archivedCount()) {
        <button type="button" class="arch-link" (click)="showArchived.set(!showArchived())">
          {{ showArchived() ? 'Esconder arquivadas' : archivedCount() + (archivedCount() === 1 ? ' categoria arquivada' : ' categorias arquivadas') }}
        </button>
      }

      <div class="card rows">
        @for (g of groups(); track g.parent.id) {
          <div class="row parent" [class.muted]="g.parent.archived">
            <button type="button" class="cat-name" (click)="edit(g.parent)" matTooltip="Editar" matTooltipPosition="above" [matTooltipDisabled]="!wide">
              <app-icon-badge [icon]="g.parent.icon" [color]="g.parent.color" [size]="wide ? 45 : 40" />
              <div class="main">
                <div class="title">{{ g.parent.name }} @if (g.parent.archived) { <small>(arquivada)</small> }</div>
                @if (g.children.length) { <div class="sub m-only">{{ g.children.length }} sub-categoria{{ g.children.length === 1 ? '' : 's' }}</div> }
              </div>
            </button>
            <span class="links d-only">
              <button type="button" class="lnk" (click)="toggleArchive(g.parent)">{{ g.parent.archived ? 'desarquivar' : 'arquivar' }}</button>
              <button type="button" class="lnk" (click)="addSub(g.parent)">+ sub-categoria</button>
            </span>
            <button matIconButton class="m-only" (click)="addSub(g.parent)" matTooltip="Nova sub-categoria"><mat-icon>subdirectory_arrow_right</mat-icon></button>
            <button matIconButton class="more" [matMenuTriggerFor]="m" aria-label="Mais opções"><mat-icon>more_vert</mat-icon></button>
            <mat-menu #m="matMenu">
              <button mat-menu-item [routerLink]="['/movimentos']" [queryParams]="{ categoria: g.parent.id }"><mat-icon>receipt_long</mat-icon>Ver movimentos</button>
              <button mat-menu-item (click)="edit(g.parent)"><mat-icon>edit</mat-icon>Editar</button>
              <button mat-menu-item (click)="remove(g.parent)"><mat-icon>delete</mat-icon>Apagar</button>
            </mat-menu>
          </div>
          @for (c of g.children; track c.id) {
            <div class="row child" [class.muted]="c.archived">
              <button type="button" class="cat-name" (click)="edit(c)">
                <app-icon-badge class="m-only" [icon]="c.icon" [color]="c.color" [size]="28" />
                <div class="main"><div class="title">{{ c.name }} @if (c.archived) { <small>(arquivada)</small> }</div></div>
              </button>
              <span class="links d-only hover">
                <button type="button" class="lnk" (click)="toggleArchive(c)">{{ c.archived ? 'desarquivar' : 'arquivar' }}</button>
              </span>
              <button matIconButton class="more" [matMenuTriggerFor]="mc" aria-label="Mais opções"><mat-icon>more_vert</mat-icon></button>
              <mat-menu #mc="matMenu">
                <button mat-menu-item [routerLink]="['/movimentos']" [queryParams]="{ categoria: c.id }"><mat-icon>receipt_long</mat-icon>Ver movimentos</button>
                <button mat-menu-item (click)="edit(c)"><mat-icon>edit</mat-icon>Editar</button>
                <button mat-menu-item (click)="remove(c)"><mat-icon>delete</mat-icon>Apagar</button>
              </mat-menu>
            </div>
          }
        } @empty {
          <p class="empty">Sem categorias de {{ tab() === 'expense' ? 'despesa' : 'receita' }}.</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .rows { padding: 4px 12px; margin-top: var(--gap); }
    .row.child { padding-left: 40px; min-height: 38px; }
    .row.child .title { font-size: 14px; }
    .cat-name { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; background: none; border: none; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
    .d-only { display: none !important; }
    .arch-link { display: none; }
    @media (min-width: 900px) {
      .m-only { display: none !important; }
      .d-only { display: inline-flex !important; }
      .ctabs { margin: 8px 0 0; }
      .ctabs ::ng-deep .mat-mdc-tab-header { border-bottom: 1px solid var(--line-div); }
      .ctabs ::ng-deep .mat-mdc-tab { height: 40px; --mat-tab-header-label-text-size: 15px; --mat-tab-header-label-text-weight: 500; --mat-tab-header-inactive-label-text-color: var(--ink-soft); --mat-tab-header-active-label-text-color: var(--pos); --mat-tab-header-active-focus-label-text-color: var(--pos); --mat-tab-header-active-hover-label-text-color: var(--pos); --mat-tab-header-active-indicator-color: var(--pos); --mat-tab-header-active-focus-indicator-color: var(--pos); --mat-tab-header-active-hover-indicator-color: var(--pos); --mat-tab-header-active-indicator-height: 3px; }
      .ctabs ::ng-deep .mdc-tab__text-label { color: var(--ink-soft) !important; font-size: 15px; font-weight: 500; }
      .ctabs ::ng-deep .mdc-tab--active .mdc-tab__text-label { color: var(--pos) !important; }
      .arch-link { display: inline-block; margin: 24px 0 4px 15px; padding: 0; background: none; border: none; border-bottom: 1px solid var(--ink-soft); font: inherit; font-size: 13px; font-weight: 500; color: var(--ink-soft); cursor: pointer; }
      .rows { margin-top: 12px; }
      .page.sheet .rows .row { border-bottom: none; border-top: 1px solid var(--line-div); padding: 0; gap: 12px; }
      .page.sheet .rows .row:first-child { border-top: none; }
      .page.sheet .rows .row.parent { min-height: 60px; }
      .page.sheet .rows .row.child { min-height: 52px; padding-left: 40px; }
      .page.sheet .row .title { font-size: 14px; font-weight: 500; color: var(--ink); }
      .page.sheet .row.child .title { color: var(--ink-soft); }
      .cat-name { gap: 15px; align-self: stretch; }
      .cat-name app-icon-badge { border: 2px solid var(--app-card-bg); border-radius: 50%; }
      .links { gap: 20px; align-items: center; }
      .lnk { background: none; border: none; padding: 0; font: inherit; font-size: 14px; font-weight: 500; color: var(--bal); cursor: pointer; }
      @media (hover: hover) { .lnk:hover { text-decoration: underline; } }
      .links.hover { opacity: 0; transition: opacity .15s; }
      .row:hover .links.hover { opacity: 1; }
      .more { color: var(--ink-soft); opacity: .6; }
      .row:hover .more { opacity: 1; }
    }
  `],
})
export class CategoriesPage {
  readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly dialog = inject(MatDialog);
  readonly tab = signal<CategoryKind>('expense');
  readonly seeding = signal(false);

  /** Computador: separadores esticados e ícones maiores (10/11). */
  readonly wide = window.matchMedia('(min-width: 900px)').matches;
  /** As arquivadas ficam escondidas até se carregar em "N categorias arquivadas" (10/11, como na outra aplicação). */
  readonly showArchived = signal(false);
  readonly archivedCount = computed(() => this.data.categories().filter((c) => c.kind === this.tab() && c.archived).length);

  readonly groups = computed(() =>
    this.data.categoryGroups()
      .filter((g) => g.parent.kind === this.tab())
      .filter((g) => this.showArchived() || !g.parent.archived)
      .map((g) => (this.showArchived() ? g : { ...g, children: g.children.filter((c) => !c.archived) }))
      .sort((a, b) => Number(a.parent.archived) - Number(b.parent.archived) || a.parent.name.localeCompare(b.parent.name, 'pt')),
  );

  add() { this.dialog.open(CategoryDialog, { width: '460px', maxWidth: '96vw', data: { kind: this.tab() } }); }
  addSub(parent: Category) { this.dialog.open(CategoryDialog, { width: '460px', maxWidth: '96vw', data: { parentId: parent.id } }); }
  edit(c: Category) { this.dialog.open(CategoryDialog, { width: '460px', maxWidth: '96vw', data: { category: c } }); }

  async toggleArchive(c: Category) {
    try { await this.data.saveCategory({ ...c, archived: !c.archived }); this.ui.toast(c.archived ? 'Categoria desarquivada.' : 'Categoria arquivada.'); }
    catch (e) { this.ui.error(e); }
  }

    async seed() {
    this.seeding.set(true);
    try { await this.data.seedDefaultCategories(); this.ui.toast('Categorias criadas. Podes editá-las à vontade.'); }
    catch (e) { this.ui.error(e); } finally { this.seeding.set(false); }
  }

  async remove(c: Category) {
    const hasKids = this.data.categories().some((x) => x.parent_id === c.id);
    const msg = hasKids
      ? `As sub-categorias de "${c.name}" passam a categorias principais e os movimentos diretos ficam sem categoria. Em alternativa, arquiva-a.`
      : `Os movimentos de "${c.name}" ficam sem categoria. Em alternativa, arquiva-a.`;
    if (!(await this.ui.confirm('Apagar categoria?', msg, 'Apagar categoria'))) return;
    try { await this.data.deleteCategory(c.id); this.data.version.update((v) => v + 1); } catch (e) { this.ui.error(e); }
  }
}
