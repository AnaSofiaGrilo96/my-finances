import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatToolbarModule } from '@angular/material/toolbar';
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatIconModule, MatButtonModule, MatMenuModule, MatTooltipModule],
  template: `
    <!-- Barra superior verde com a navegação ao centro — só no computador. No telemóvel (21/10, como na outra aplicação de
         gestão de finanças) não há barra: cada página tem o seu título e a navegação está toda na barra inferior. -->
    @if (!isSmall()) {
    <mat-toolbar class="topbar desktop">
      <a class="brand" routerLink="/"><mat-icon>account_balance_wallet</mat-icon><span>MyFinances</span></a>
      @if (!isSmall()) {
        <nav class="links">
          @for (item of navItems; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.path === '/' }">{{ item.label }}</a>
          }
        </nav>
      }
      <span class="spacer"></span>
      <button matIconButton (click)="themeSvc.dark.set(!themeSvc.dark())" [matTooltip]="themeSvc.dark() ? 'Modo claro' : 'Modo escuro'">
        <mat-icon>{{ themeSvc.dark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
      </button>
      <button matIconButton [matMenuTriggerFor]="userMenu" aria-label="Conta">
        @if (auth.avatarUrl(); as url) {
          <img class="avatar" [src]="url" alt="" referrerpolicy="no-referrer" />
        } @else {
          <mat-icon>account_circle</mat-icon>
        }
      </button>
    </mat-toolbar>
    }
      <mat-menu #userMenu="matMenu">
        <div class="user-info">
          <div class="name">{{ data.displayName() || auth.displayName() }}</div>
          <div class="muted">{{ auth.user()?.email }}</div>
        </div>
        <button mat-menu-item routerLink="/contas"><mat-icon>account_balance</mat-icon>Contas</button>
        <button mat-menu-item routerLink="/categorias"><mat-icon>category</mat-icon>Categorias</button>
        <button mat-menu-item routerLink="/recorrencias"><mat-icon>repeat</mat-icon>Recorrências</button>
        <button mat-menu-item (click)="editProfile()"><mat-icon>badge</mat-icon>O meu nome</button>
        @if (isSmall()) {
          <button mat-menu-item (click)="themeSvc.dark.set(!themeSvc.dark())"><mat-icon>{{ themeSvc.dark() ? 'light_mode' : 'dark_mode' }}</mat-icon>{{ themeSvc.dark() ? 'Modo claro' : 'Modo escuro' }}</button>
        }
        <button mat-menu-item (click)="logout()"><mat-icon>logout</mat-icon>Sair</button>
      </mat-menu>

    <main class="content">
      @if (data.loaded()) {
        <router-outlet />
      }
    </main>

    <!-- Botão flutuante redondo em todos os ecrãs (exceto Relatórios) -->
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
        <!-- Foto: abre o menu do perfil (Contas, Categorias, Recorrências, O meu nome, modo escuro, Sair) -->
        <button type="button" class="me" [matMenuTriggerFor]="userMenu" aria-label="Perfil">
          @if (auth.avatarUrl(); as url) { <img class="avatar big" [src]="url" alt="" referrerpolicy="no-referrer" /> } @else { <mat-icon>account_circle</mat-icon> }
        </button>
      </nav>
    }
  `,
  styles: [`
    :host { display: block; min-height: 100dvh; } /* min-height (não height): senão a barra sticky sai com o fim do host nas páginas que fazem scroll */
    /* ---- barra superior verde ---- */
    .topbar { position: sticky; top: 0; z-index: 10; background: #16c64f; color: #fff; --mat-icon-button-icon-color: #fff; --mat-sys-on-surface: #fff; gap: 4px; }
    :host-context(html.dark) .topbar { background: #178f45; }
    .brand { display: inline-flex; align-items: center; gap: 8px; color: #fff; text-decoration: none; font-weight: 600; font-size: 19px; letter-spacing: -.2px; }
    .brand mat-icon { font-size: 28px; width: 28px; height: 28px; }
    .links { position: absolute; left: 50%; top: 0; bottom: 0; transform: translateX(-50%); display: flex; align-items: stretch; gap: 4px; }
    .links a { display: flex; align-items: center; padding: 0 16px; color: rgba(255,255,255,.85); text-decoration: none; font-size: 16.5px; font-weight: 400; border-bottom: 3px solid transparent; transition: color .15s, border-color .15s, background-color .15s; }
    .links a:hover { color: #fff; background: rgba(255,255,255,.08); }
    .links a.active { color: #fff; font-weight: 600; border-bottom-color: #fff; }
    .topbar.desktop { height: 52px; padding: 0 20px; position: sticky; } /* 52px como na outra aplicação de gestão de finanças (20/10) */
    .topbar.desktop .brand { font-size: 20px; }
    .topbar.desktop .links a { font-size: 14px; font-weight: 500; padding: 0 12px; text-transform: lowercase; } /* "visão geral", "movimentos"… em minúsculas como na outra aplicação (20/10) */
    .topbar.desktop .links a.active { font-weight: 700; }
    .avatar { width: 28px; height: 28px; border-radius: 50%; display: block; }
    .user-info { padding: 8px 16px 12px; border-bottom: 1px solid var(--mat-sys-outline-variant); margin-bottom: 4px; }
    .user-info .name { font-weight: 500; }
    .user-info .muted { font-size: 12px; }
    /* ---- conteúdo ---- */
    .content { display: block; }
    /* ---- telemóvel ---- */
    /* barra inferior só com ícones (21/10, como na outra aplicação): o ativo fica a verde, sem pílula */
    .bottom-nav { position: fixed; left: 0; right: 0; bottom: 0; display: flex; height: calc(var(--nav-h) + env(safe-area-inset-bottom)); box-sizing: border-box; background: var(--app-bar-bg, var(--mat-sys-surface)); border-top: 1px solid var(--line-soft); padding-bottom: env(safe-area-inset-bottom); z-index: 20; }
    .bottom-nav a, .bottom-nav .me { flex: 1; display: grid; place-items: center; color: var(--mat-sys-on-surface); text-decoration: none; border: none; background: none; padding: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
    .bottom-nav a mat-icon { font-size: 28px; width: 28px; height: 28px; transition: transform .12s; }
    .bottom-nav a:active mat-icon { transform: scale(.88); }
    .bottom-nav a.active { color: var(--nav-active); }
    .avatar.big { width: 32px; height: 32px; }
    .bottom-nav .me mat-icon { font-size: 30px; width: 30px; height: 30px; color: var(--mat-sys-on-surface-variant); }
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
  readonly showFab = computed(() => !this.url().startsWith('/relatorios'));

  readonly navItems = [
    { path: '/', icon: 'home', label: 'Visão geral', short: 'Início' },
    { path: '/movimentos', icon: 'swap_horiz', label: 'Movimentos', short: 'Movimentos' },
    { path: '/relatorios', icon: 'bar_chart', label: 'Relatórios', short: 'Relatórios' },
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
