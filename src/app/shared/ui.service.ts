import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialog } from './confirm.dialog';
import { ChoiceDialog, ChoiceOption } from './choice.dialog';
import { NoticeSnack } from './notice.snack';

@Injectable({ providedIn: 'root' })
export class UiService {
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  toast(message: string) {
    this.snack.open(message, 'OK', { duration: 3000 });
  }

  /** Aviso com ícone, sem botão (10/11): "Movimento adicionado", "Movimento pago", "Movimento apagado"… */
  notice(message: string, icon = 'check_circle', tone: 'ok' | 'del' = 'ok') {
    this.snack.openFromComponent(NoticeSnack, { data: { message, icon, tone }, duration: 2500, panelClass: 'notice-snack' });
  }

  error(e: unknown) {
    const msg = (e as { message?: string })?.message ?? String(e);
    console.error(e);
    this.snack.open(`Erro: ${msg}`, 'Fechar', { duration: 6000 });
  }

  async confirm(title: string, message: string, okLabel = 'Confirmar', danger = true): Promise<boolean> {
    const ref = this.dialog.open(ConfirmDialog, { data: { title, message, okLabel, danger }, width: '400px', maxWidth: '92vw', panelClass: 'choice-dialog', autoFocus: false });
    return (await ref.afterClosed().toPromise()) === true;
  }

  /** Pergunta com várias opções empilhadas; devolve o valor escolhido ou undefined se cancelar. */
  async choose<T extends string>(title: string, options: ChoiceOption<T>[], message?: string): Promise<T | undefined> {
    const ref = this.dialog.open(ChoiceDialog<T>, { data: { title, message, options }, width: '400px', maxWidth: '92vw', panelClass: 'choice-dialog', autoFocus: false });
    return await ref.afterClosed().toPromise();
  }

  /** O que fazer com um movimento que pertence a uma recorrência. */
  recurrenceScope(verb: 'Atualizar' | 'Apagar'): Promise<'one' | 'following' | undefined> {
    return this.choose<'one' | 'following'>('Este movimento repete-se noutras datas. O que deseja fazer?', [
      { value: 'one', label: `${verb} apenas este`, primary: true, danger: verb === 'Apagar' },
      { value: 'following', label: 'Este e os próximos' },
    ]);
  }
}
