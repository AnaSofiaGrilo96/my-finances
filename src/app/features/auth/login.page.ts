import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule],
  template: `
    <div class="wrap">
      <div class="card login">
        <div class="logo"><mat-icon>account_balance_wallet</mat-icon></div>
        <h1>MyFinances</h1>
        <p class="muted">As tuas contas, categorias e relatórios num só sítio.</p>

        <button matButton="filled" class="google" (click)="google()" [disabled]="busy()">
          @if (busy()) { <mat-spinner diameter="20" /> } @else {
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.5 30.3 0 24 0 14.6 0 6.5 5.4 2.5 13.3l7.9 6.1C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.4 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
          }
          <span>Entrar com Google</span>
        </button>

        <button class="link" type="button" (click)="showEmail.set(!showEmail())">
          {{ showEmail() ? 'Esconder' : 'Entrar com email e password' }}
        </button>

        @if (showEmail()) {
          <form (ngSubmit)="email()" class="form">
            <mat-form-field><mat-label>Email</mat-label><input matInput type="email" name="email" [(ngModel)]="emailValue" required autocomplete="username" /></mat-form-field>
            <mat-form-field><mat-label>Password</mat-label><input matInput type="password" name="password" [(ngModel)]="passwordValue" required autocomplete="current-password" /></mat-form-field>
            <button matButton="outlined" type="submit" [disabled]="busy()">Entrar</button>
          </form>
        }

        @if (error(); as e) { <p class="error">{{ e }}</p> }
      </div>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100dvh; display: grid; place-items: center; padding: 16px; }
    .login { width: 100%; max-width: 380px; text-align: center; padding: 32px 24px; }
    .logo mat-icon { font-size: 56px; width: 56px; height: 56px; color: var(--mat-sys-primary); }
    h1 { margin: 8px 0 4px; font-weight: 500; }
    .google { width: 100%; height: 46px; margin-top: 20px; display: inline-flex; gap: 10px; }
    .link { background: none; border: none; color: var(--mat-sys-primary); cursor: pointer; margin-top: 16px; font: inherit; font-size: 13px; }
    .form { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; text-align: left; }
    .error { color: var(--mat-sys-error); font-size: 13px; }
  `],
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly showEmail = signal(false);
  emailValue = '';
  passwordValue = '';

  async google() {
    this.busy.set(true);
    this.error.set(null);
    const err = await this.auth.signInWithGoogle();
    if (err) { this.error.set(err); this.busy.set(false); }
    // caso contrário o browser é redirecionado para o Google
  }

  async email() {
    this.busy.set(true);
    this.error.set(null);
    const err = await this.auth.signInWithPassword(this.emailValue, this.passwordValue);
    this.busy.set(false);
    if (err) this.error.set(err === 'Invalid login credentials' ? 'Email ou password incorretos.' : err);
    else this.router.navigate(['/']);
  }
}
