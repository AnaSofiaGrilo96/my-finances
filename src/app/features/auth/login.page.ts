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

        <form (ngSubmit)="email()" class="form">
          <mat-form-field><mat-label>Email</mat-label><input matInput type="email" name="email" [(ngModel)]="emailValue" required autocomplete="username" /></mat-form-field>
          <mat-form-field><mat-label>Password</mat-label><input matInput type="password" name="password" [(ngModel)]="passwordValue" required autocomplete="current-password" /></mat-form-field>
          <button matButton="filled" type="submit" class="submit" [disabled]="busy()">
            @if (busy()) { <mat-spinner diameter="20" /> } @else { Entrar }
          </button>
        </form>

        @if (error(); as e) { <p class="error">{{ e }}</p> }
      </div>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100dvh; display: grid; place-items: center; padding: 16px; }
    .login { width: 100%; max-width: 380px; text-align: center; padding: 32px 24px; }
    .logo mat-icon { font-size: 56px; width: 56px; height: 56px; color: var(--mat-sys-primary); }
    h1 { margin: 8px 0 4px; font-weight: 500; }
    .form { display: flex; flex-direction: column; gap: 4px; margin-top: 20px; text-align: left; }
    .submit { height: 46px; margin-top: 4px; }
    .error { color: var(--mat-sys-error); font-size: 13px; }
  `],
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  emailValue = '';
  passwordValue = '';

  async email() {
    this.busy.set(true);
    this.error.set(null);
    const err = await this.auth.signInWithPassword(this.emailValue, this.passwordValue);
    this.busy.set(false);
    if (err) this.error.set(err === 'Invalid login credentials' ? 'Email ou password incorretos.' : err);
    else this.router.navigate(['/']);
  }
}
