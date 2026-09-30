import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { DataService } from '../../core/data.service';
import { AuthService } from '../../core/auth.service';
import { UiService } from '../../shared/ui.service';

@Component({
  selector: 'app-profile-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>O meu nome</h2>
    <mat-dialog-content>
      <p class="muted">Usado na saudação da visão geral.</p>
      <mat-form-field class="full">
        <mat-label>Nome</mat-label>
        <input matInput [(ngModel)]="name" name="name" autofocus (keyup.enter)="save()" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancelar</button>
      <button matButton="filled" (click)="save()" [disabled]="busy()">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: [`.full { width: 100%; } p { margin-top: 0; }`],
})
export class ProfileDialog {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly ui = inject(UiService);
  private readonly ref = inject(MatDialogRef<ProfileDialog>);
  readonly busy = signal(false);
  name = this.data.displayName() || this.auth.displayName().split('@')[0];

  async save() {
    this.busy.set(true);
    try { await this.data.saveSettings({ display_name: this.name.trim() || null }); this.ref.close(true); }
    catch (e) { this.ui.error(e); } finally { this.busy.set(false); }
  }
}
