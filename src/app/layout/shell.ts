import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../core/auth.service';
import { ThemeService } from '../core/theme.service';
import { DataService } from '../core/data.service';
import { UiService } from '../shared/ui.service';
import { openTransactionDialog } from '../features/transactions/transaction.dialog';
import { ProfileDialog } from '../features/auth/profile.dialog';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatToolbarModule, MatListModule, MatIconModule, MatButtonModule, MatMenuModule, MatTooltipModule, MatProgressBarModule],
  template: `
    <mat-sidenav-container class="container">
      @if (!isSmall()) {
        <mat-sidenav mode="side" opened class="sidenav">
          <div class="brand"><mat-icon>account_balance_wallet</mat-icon><span>MyFinances</span></div>
          <mat-nav-list>
            @for (item of sideItems; track item.path) {
              <a mat-list-item [routerLink]="item.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.path === '/' }">
                <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
                <span matListItemTitle>{{ item.label }}</span>
              </a>
            }
          </mat-nav-list>
          <div class="side-actions">
            <button matButton="filled" (click)="newTransaction()"><mat-icon>add</mat-icon>Novo movimento</button>
          </div>
        </mat-sidenav>
      }
      <mat-sidenav-content>
        <mat-toolbar class="topbar">
          @if (isSmall()) {
            <mat-icon class="logo">account_balance_wallet</mat-icon>
            <span class="brand-small">MyFinances</span>
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
        @if (!data.loaded()) {
          <mat-progress-bar mode="indeterminate" />
        } @else {
          <router-outlet />
        }
      </mat-sidenav-content>
    </mat-sidenav-container>

    @if (isSmall()) {
      <nav class="bottom-nav">
        @for (item of navItems; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.path === '/' }">
            <mat-icon>{{ item.icon }}</mat-icon>
            <span>{{ item.short }}</span>
          </a>
        }
      </nav>
      <button matFab class="fab" (click)="newTransaction()" aria-label="Novo movimento"><mat-icon>add</mat-icon></button>
    }
  `,
  styles: [`
    .container { height: 100dvh; }
    .sidenav { width: 240px; border-right: none; display: flex; flex-direction: column; }
    .brand { display: flex; align-items: center; gap: 10px; padding: 20px 16px 12px; font-weight: 500; font-size: 17px; color: var(--mat-sys-primary); }
    .brand-small { font-weight: 500; margin-left: 8px; }
    .logo { color: var(--mat-sys-primary); }
    .side-actions { padding: 16px; margin-top: auto; }
    .side-actions button { width: 100%; }
    .topbar { background: var(--mat-sys-surface); border-bottom: 1px solid var(--mat-sys-outline-variant); position: sticky; top: 0; z-index: 10; }
    .avatar { width: 28px; height: 28px; border-radius: 50%; display: block; }
    .user-info { padding: 8px 16px 12px; border-bottom: 1px solid var(--mat-sys-outline-variant); margin-bottom: 4px; }
    .user-info .name { font-weight: 500; }
    .user-info .muted { font-size: 12px; }
    a.active { background: var(--mat-sys-secondary-container); border-radius: 24px; }
    .bottom-nav { position: fixed; left: 0; right: 0; bottom: 0; display: flex; background: var(--mat-sys-surface); border-top: 1px solid var(--mat-sys-outline-variant); padding-bottom: env(safe-area-inset-bottom); z-index: 20; }
    .bottom-nav a { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 4px 10px; font-size: 11px; color: var(--mat-sys-on-surface-variant); text-decoration: none; }
    .bottom-nav a.active { color: var(--mat-sys-primary); }
    .bottom-nav a mat-icon { padding: 2px 16px; border-radius: 14px; }
    .bottom-nav a.active mat-icon { background: var(--mat-sys-secondary-container); }
    mat-sidenav-content { padding-bottom: 0; }
  `],
})
export class Shell {
  readonly auth = inject(AuthService);
  readonly themeSvc = inject(ThemeService);
  readonly data = inject(DataService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly ui = inject(UiService);
  private readonly bp = inject(BreakpointObserver);

  readonly isSmall = toSignal(this.bp.observe('(max-width: 899px)').pipe(map((r) => r.matches)), { initialValue: false });
  readonly loadError = signal(false);

  readonly navItems = [
    { path: '/', icon: 'dashboard', label: 'Visão geral', short: 'Início' },
    { path: '/movimentos', icon: 'receipt_long', label: 'Movimentos', short: 'Movimentos' },
    { path: '/relatorios', icon: 'bar_chart', label: 'Relatórios', short: 'Relatórios' },
  ];

  readonly sideItems = this.navItems;

  constructor() {
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
