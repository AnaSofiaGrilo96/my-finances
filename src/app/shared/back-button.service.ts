import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatBottomSheetRef } from '@angular/material/bottom-sheet';

interface Overlay { close(): void; }

/**
 * Faz o botão "Voltar" (Android / navegador) fechar a janela ou folha aberta em vez de sair da página.
 * Cada janela/folha empilha uma entrada no histórico ao abrir; o popstate fecha a de cima.
 * Se fechar por outra via, a entrada é consumida com history.back() silencioso.
 */
@Injectable({ providedIn: 'root' })
export class BackButtonService {
  private readonly stack: Overlay[] = [];
  private suppress = 0;

  constructor() {
    window.addEventListener('popstate', () => {
      if (this.suppress > 0) { this.suppress--; return; }
      const top = this.stack.pop();
      if (top) { top.close(); }
    });
    // Todas as janelas Material passam por aqui automaticamente
    inject(MatDialog).afterOpened.subscribe((ref) => this.track(ref));
  }

  /** Regista uma janela (MatDialogRef) ou folha (MatBottomSheetRef) aberta. */
  track(ref: MatDialogRef<unknown> | MatBottomSheetRef<unknown>) {
    let closedByBack = false;
    const entry: Overlay = { close: () => { closedByBack = true; if ('dismiss' in ref) ref.dismiss(); else ref.close(); } };
    this.stack.push(entry);
    history.pushState({ overlay: this.stack.length }, '');
    const done = 'afterDismissed' in ref ? ref.afterDismissed() : ref.afterClosed();
    done.subscribe(() => {
      if (closedByBack) return;
      const i = this.stack.indexOf(entry);
      if (i < 0) return;
      this.stack.splice(i, 1);
      // Consome a entrada de histórico que esta janela empilhou, sem que isso feche outra
      this.suppress++;
      history.back();
    });
  }
}
