import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialog } from './confirm.dialog';

@Injectable({ providedIn: 'root' })
export class UiService {
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  toast(message: string) {
    this.snack.open(message, 'OK', { duration: 3000 });
  }

  error(e: unknown) {
    const msg = (e as { message?: string })?.message ?? String(e);
    console.error(e);
    this.snack.open(`Erro: ${msg}`, 'Fechar', { duration: 6000 });
  }

  async confirm(title: string, message: string, okLabel = 'Confirmar', danger = true): Promise<boolean> {
    const ref = this.dialog.open(ConfirmDialog, { data: { title, message, okLabel, danger }, width: '380px' });
    return (await ref.afterClosed().toPromise()) === true;
  }
}
