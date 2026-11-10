import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { ThemeService } from '../core/theme.service';
import { DataService } from '../core/data.service';
import { UiService } from '../shared/ui.service';
import { openTransactionDialog } from '../features/transactions/transaction.dialog';
import { ProfileDialog } from '../features/auth/profile.dialog';
import { BackButtonService } from '../shared/back-button.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, MatButtonModule, MatMenuModule, MatTooltipModule],
  template: `
    <!-- Computador (10/11, como a nova versão da outra aplicação de gestão de finanças): barra lateral fixa à esquerda, num
         cartão de cantos redondos, com a navegação e o perfil em baixo. No telemóvel (21/10) não há barra: cada página tem o seu
         título e a navegação está toda na barra inferior. -->
    <!-- Computador: barra lateral + conteúdo num bloco de 1920px no máximo, centrado (em ecrãs muito largos sobra fundo dos dois
         lados em vez de esticar os cartões — como na outra aplicação de gestão de finanças, 10/11) -->
    <div class="frame" [class.desk]="!isSmall()">
    @if (!isSmall()) {
    <aside class="side">
      <a class="brand" routerLink="/"><span class="logo"><mat-icon>account_balance_wallet</mat-icon></span><span>MyFinances</span></a>
      <nav class="side-body">
        <div class="grp">
          @for (item of navItems; track item.path) {
            <a class="lnk" [routerLink]="item.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.path === '/' }">
              <mat-icon fontSet="material-icons-outlined">{{ item.side }}</mat-icon><span>{{ item.label }}</span>
            </a>
          }
        </div>
        <div class="grp">
          <a class="lnk" routerLink="/contas" routerLinkActive="active">
            <mat-icon fontSet="material-icons-outlined">account_balance</mat-icon><span>Contas</span>
            <span class="count">{{ data.activeAccounts().length }}</span>
          </a>
          <a class="lnk" routerLink="/categorias" routerLinkActive="active">
            <mat-icon fontSet="material-icons-outlined">category</mat-icon><span>Categorias</span>
          </a>
        </div>
      </nav>
      <button type="button" class="user" [matMenuTriggerFor]="userMenu" aria-label="Perfil">
        @if (auth.avatarUrl(); as url) { <img class="avatar" [src]="url" alt="" referrerpolicy="no-referrer" /> } @else { <span class="avatar ph"><mat-icon>person</mat-icon></span> }
        <span class="who"><b>{{ data.displayName() || auth.displayName() }}</b><small>{{ auth.user()?.email }}</small></span>
      </button>
    </aside>
    }
      <mat-menu #userMenu="matMenu">
        <div class="user-info">
          <div class="name">{{ data.displayName() || auth.displayName() }}</div>
          <div class="muted">{{ auth.user()?.email }}</div>
        </div>
        <button mat-menu-item routerLink="/contas"><mat-icon>account_balance</mat-icon>Contas</button>
        <button mat-menu-item routerLink="/categorias"><mat-icon>category</mat-icon>Categorias</button>
        <button mat-menu-item (click)="editProfile()"><mat-icon>badge</mat-icon>O meu nome</button>
        <button mat-menu-item (click)="themeSvc.dark.set(!themeSvc.dark())"><mat-icon>{{ themeSvc.dark() ? 'light_mode' : 'dark_mode' }}</mat-icon>{{ themeSvc.dark() ? 'Modo claro' : 'Modo escuro' }}</button>
        <button mat-menu-item (click)="logout()"><mat-icon>logout</mat-icon>Sair</button>
      </mat-menu>

    <main class="content" [class.with-side]="!isSmall()">
      @if (data.loaded()) {
        <router-outlet />
      }
    </main>
    </div>

    <!-- Botão flutuante redondo: só no telemóvel (exceto Relatórios). No computador (10/11) cria-se pelo "+" da Visão geral e pelo botão "Movimento" de Movimentos -->
    @if (showFab()) {
      <button matFab class="fab" (click)="newTransaction()" aria-label="Novo movimento" matTooltip="Novo movimento"><mat-icon>add</mat-icon></button>
    }

    @if (isSmall()) {
      <nav class="bottom-nav">
        @for (item of navItems; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.path === '/' }" [attr.aria-label]="item.short">
            <mat-icon>{{ item.icon }}</mat-icon>
          </a>
        }
        <!-- Foto: abre o menu do perfil (Contas, Categorias, O meu nome, modo escuro, Sair) -->
        <button type="button" class="me" [matMenuTriggerFor]="userMenu" aria-label="Perfil">
          @if (auth.avatarUrl(); as url) { <img class="avatar big" [src]="url" alt="" referrerpolicy="no-referrer" /> } @else { <mat-icon>account_circle</mat-icon> }
        </button>
      </nav>
    }
  `,
  styles: [`
    :host { display: block; min-height: 100dvh; } /* min-height (não height): senão a barra sticky sai com o fim do host nas páginas que fazem scroll */
    /* ---- barra lateral (computador, 10/11) — medidas da outra aplicação de gestão de finanças ---- */
    .frame.desk { display: flex; align-items: flex-start; max-width: 1920px; margin: 0 auto; }
    .side { position: sticky; top: 16px; height: calc(100dvh - 32px); margin: 16px 0 0 16px; flex: 0 0 var(--side-w); width: var(--side-w); z-index: 10; display: flex; flex-direction: column; box-sizing: border-box; background: var(--app-card-bg); border: 1px solid var(--line-div); border-radius: 30px; }
    .brand { display: flex; align-items: center; gap: 10px; padding: 20px 20px 0 20px; height: 52px; box-sizing: content-box; color: var(--ink); text-decoration: none; font-weight: 600; font-size: 20px; letter-spacing: -.3px; }
    .logo { width: 32px; height: 32px; border-radius: 50%; background: #16c64f; color: #fff; display: grid; place-items: center; }
    .logo mat-icon { font-size: 19px; width: 19px; height: 19px; }
    .side-body { flex: 1; min-height: 0; overflow-y: auto; padding: 20px 20px 12px; display: flex; flex-direction: column; gap: 24px; scrollbar-width: thin; }
    .grp { display: flex; flex-direction: column; gap: 4px; }
    .lnk { display: flex; align-items: center; gap: 12px; height: 40px; box-sizing: border-box; padding: 8px 12px; border-radius: 15px; color: var(--ink-2); text-decoration: none; font-size: 16px; font-weight: 500; transition: background-color .15s, color .15s; }
    .lnk mat-icon { font-size: 22px; width: 24px; height: 24px; display: grid; place-items: center; flex-shrink: 0; }
    .lnk span:not(.count) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    @media (hover: hover) { .lnk:hover { background: var(--app-bg); } }
    .lnk.active { background: var(--nav-active-bg); color: var(--ink); }
    .lnk.active mat-icon { color: var(--pos); }
    .count { font-size: 12px; font-weight: 500; color: var(--ink-soft); border: 1px solid var(--line-strong); border-radius: 999px; padding: 1px 8px; }
    .user { display: flex; align-items: center; gap: 12px; margin: 0 20px 20px; padding: 8px; border-radius: 999px; border: 1px solid var(--line-div); background: var(--app-bg); font: inherit; color: var(--ink); text-align: left; cursor: pointer; transition: filter .15s; }
    @media (hover: hover) { .user:hover { filter: brightness(.98); } }
    .user .avatar { width: 40px; height: 40px; flex-shrink: 0; }
    .avatar.ph { display: grid; place-items: center; border-radius: 50%; background: var(--line-strong); color: var(--ink-2); }
    .who { display: flex; flex-direction: column; min-width: 0; }
    .who b { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .who small { font-size: 12px; font-weight: 400; color: var(--ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .avatar { width: 28px; height: 28px; border-radius: 50%; display: block; object-fit: cover; }
    .user-info { padding: 8px 16px 12px; border-bottom: 1px solid var(--mat-sys-outline-variant); margin-bottom: 4px; }
    .user-info .name { font-weight: 500; }
    .user-info .muted { font-size: 12px; }
    /* ---- conteúdo ---- */
    .content { display: block; }
    .content.with-side { flex: 1; min-width: 0; margin-left: 20px; }
    /* ---- telemóvel ---- */
    /* barra inferior só com ícones (21/10, como na outra aplicação): o ativo fica a verde, sem pílula */
    .bottom-nav { position: fixed; left: 0; right: 0; bottom: 0; display: flex; height: calc(var(--nav-h) + env(safe-area-inset-bottom)); box-sizing: border-box; background: var(--app-bar-bg, var(--mat-sys-surface)); border-top: 1px solid var(--line-soft); padding-bottom: env(safe-area-inset-bottom); z-index: 20; }
    .bottom-nav a, .bottom-nav .me { flex: 1; display: grid; place-items: center; color: var(--mat-sys-on-surface); text-decoration: none; border: none; background: none; padding: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
    .bottom-nav a mat-icon { font-size: 28px; width: 28px; height: 28px; transition: transform .12s; }
    .bottom-nav a:active mat-icon { transform: scale(.88); }
    .bottom-nav a.active { color: var(--nav-active); }
    .avatar.big { width: 32px; height: 32px; }
    .bottom-nav .me mat-icon { font-size: 30px; width: 30px; height: 30px; color: var(--mat-sys-on-surface-variant); }
    /* telemóvel (22/10): letra 1–2px mais pequena (gerado a partir dos tamanhos acima) */
    @media (max-width: 899px) { .user-info .muted { font-size: 11px; } }
  `],
})
export class Shell {
  readonly auth = inject(AuthService);
  readonly themeSvc = inject(ThemeService);
  readonly data = inject(DataService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly back = inject(BackButtonService); // ativa o tratamento do botão Voltar
  private readonly ui = inject(UiService);
  private readonly bp = inject(BreakpointObserver);

  readonly isSmall = toSignal(this.bp.observe('(max-width: 899px)').pipe(map((r) => r.matches)), { initialValue: false });
  readonly loadError = signal(false);
  /** Sem botão "+" nos Relatórios (lá não se criam movimentos). */
  private readonly url = toSignal(this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map((e) => e.urlAfterRedirects)), { initialValue: this.router.url });
  readonly showFab = computed(() => this.isSmall() && !this.url().startsWith('/relatorios'));

  readonly navItems = [
    { path: '/', icon: 'home', side: 'space_dashboard', label: 'Visão geral', short: 'Início' },
    { path: '/movimentos', icon: 'swap_horiz', side: 'receipt_long', label: 'Movimentos', short: 'Movimentos' },
    { path: '/relatorios', icon: 'bar_chart', side: 'bar_chart', label: 'Relatórios', short: 'Relatórios' },
  ];

  private readonly swUpdate = inject(SwUpdate);
  private readonly snack = inject(MatSnackBar);

  constructor() {
    // Nova versão publicada: avisa e oferece recarregar (senão só se aplicava ao fechar e reabrir a app).
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY')).subscribe(() => {
        this.snack.open('Há uma nova versão da app.', 'Atualizar', { duration: 0 }).onAction().subscribe(() => document.location.reload());
      });
      this.swUpdate.checkForUpdate().catch(() => {});
    }
    this.data.ensureLoaded().catch((e) => { this.loadError.set(true); this.ui.error(e); });
  }

  newTransaction() {
    openTransactionDialog(this.dialog, {});
  }

  editProfile() {
    this.dialog.open(ProfileDialog, { width: '400px', maxWidth: '96vw' });
  }

  async logout() {
    await this.auth.signOut();
    this.data.clear();
    this.router.navigate(['/login']);
  }
}
