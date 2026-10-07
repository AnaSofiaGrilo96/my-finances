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
import { MatProgressBarModule } from '@angular/material/progress-bar';
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatIconModule, MatButtonModule, MatMenuModule, MatTooltipModule, MatProgressBarModule],
  template: `
    <!-- Barra superior verde com a navegação ao centro (computador) / só título (telemóvel); sem menu lateral -->
    <mat-toolbar class="topbar" [class.desktop]="!isSmall()">
      <a class="brand" routerLink="/"><mat-icon>account_balance_wallet</mat-icon><span>MyFinances</span></a>
      @if (!isSmall()) {
        <nav class="links">
          @for (item of navItems; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.path === '/' }">{{ item.label }}</a>
          }
        </nav>
      }
      <span class="spacer"></span>
      @if (!isSmall()) {
        <button matIconButton (click)="newTransaction()" matTooltip="Novo movimento" aria-label="Novo movimento"><mat-icon>add_circle</mat-icon></button>
      }
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
      <mat-menu #userMenu="matMenu">
        <div class="user-info">
          <div class="name">{{ data.displayName() || auth.displayName() }}</div>
          <div class="muted">{{ auth.user()?.email }}</div>
        </div>
        <button mat-menu-item routerLink="/contas"><mat-icon>account_balance</mat-icon>Contas</button>
        <button mat-menu-item routerLink="/categorias"><mat-icon>category</mat-icon>Categorias</button>
        <button mat-menu-item routerLink="/recorrencias"><mat-icon>repeat</mat-icon>Recorrências</button>
        <button mat-menu-item (click)="editProfile()"><mat-icon>badge</mat-icon>O meu nome</button>
        <button mat-menu-item (click)="logout()"><mat-icon>logout</mat-icon>Sair</button>
      </mat-menu>
    </mat-toolbar>

    <main class="content">
      @if (!data.loaded()) {
        <mat-progress-bar mode="indeterminate" />
      } @else {
        <router-outlet />
      }
    </main>

    @if (isSmall()) {
      <nav class="bottom-nav">
        @for (item of navItems; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.path === '/' }">
            <mat-icon>{{ item.icon }}</mat-icon>
            <span>{{ item.short }}</span>
          </a>
        }
      </nav>
      @if (showFab()) {
        <button matFab class="fab" (click)="newTransaction()" aria-label="Novo movimento"><mat-icon>add</mat-icon></button>
      }
    }
  `,
  styles: [`
    :host { display: block; height: 100dvh; }
    /* ---- barra superior verde ---- */
    .topbar { position: sticky; top: 0; z-index: 10; background: #1cbf4f; color: #fff; --mat-icon-button-icon-color: #fff; --mat-sys-on-surface: #fff; gap: 4px; }
    :host-context(html.dark) .topbar { background: #178f45; }
    .brand { display: inline-flex; align-items: center; gap: 8px; color: #fff; text-decoration: none; font-weight: 600; font-size: 19px; letter-spacing: -.2px; }
    .brand mat-icon { font-size: 28px; width: 28px; height: 28px; }
    .links { display: flex; align-items: stretch; gap: 4px; height: 100%; margin-left: 48px; }
    .links a { display: flex; align-items: center; padding: 0 16px; color: rgba(255,255,255,.85); text-decoration: none; font-size: 16.5px; font-weight: 400; border-bottom: 3px solid transparent; transition: color .15s, border-color .15s, background-color .15s; }
    .links a:hover { color: #fff; background: rgba(255,255,255,.08); }
    .links a.active { color: #fff; font-weight: 600; border-bottom-color: #fff; }
    .topbar.desktop { height: 64px; padding: 0 24px; }
    .topbar.desktop .brand { font-size: 22px; }
    .avatar { width: 28px; height: 28px; border-radius: 50%; display: block; }
    .user-info { padding: 8px 16px 12px; border-bottom: 1px solid var(--mat-sys-outline-variant); margin-bottom: 4px; }
    .user-info .name { font-weight: 500; }
    .user-info .muted { font-size: 12px; }
    /* ---- conteúdo ---- */
    .content { display: block; }
    /* ---- telemóvel ---- */
    .bottom-nav { position: fixed; left: 0; right: 0; bottom: 0; display: flex; background: var(--mat-sys-surface); border-top: 1px solid var(--mat-sys-outline-variant); padding-bottom: env(safe-area-inset-bottom); z-index: 20; }
    .bottom-nav a { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 4px 10px; font-size: 11px; color: var(--mat-sys-on-surface-variant); text-decoration: none; }
    .bottom-nav a.active { color: var(--mat-sys-primary); }
    .bottom-nav a mat-icon { padding: 2px 16px; border-radius: 14px; }
    .bottom-nav a.active mat-icon { background: var(--mat-sys-secondary-container); }
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
    { path: '/', icon: 'dashboard', label: 'Visão geral', short: 'Início' },
    { path: '/movimentos', icon: 'receipt_long', label: 'Movimentos', short: 'Movimentos' },
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
