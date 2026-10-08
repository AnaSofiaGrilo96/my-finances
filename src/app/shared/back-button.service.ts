import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatBottomSheetRef } from '@angular/material/bottom-sheet';

interface Overlay { close(): void; }

/**
 * Faz o botão "Voltar" (Android / navegador) fechar a janela ou folha aberta em vez de sair da página.
 * Cada janela/folha empilha uma entrada no histórico ao abrir; o popstate fecha a de cima.
 * Se fechar por outra via, a entrada é consumida com history.back() silencioso.
 *
 * Cuidado com a ordem: `history.back()` é assíncrono e aponta para a entrada anterior *no momento da chamada*.
 * Se entretanto se fizer `pushState` (ex.: folha de detalhe fecha e abre logo a janela de edição), o browser
 * recua para trás da entrada nova e a contagem fica errada — acabava por sair para a página inicial ao gravar.
 * Por isso: (1) quem abre espera que um recuo pendente termine antes de empilhar; (2) só se recua quando há
 * entradas nossas por cima (contador `depth`).
 */
@Injectable({ providedIn: 'root' })
export class BackButtonService {
  private readonly stack: Overlay[] = [];
  private depth = 0;          // entradas de histórico nossas por cima da página
  private suppress = 0;       // popstates provocados por nós (a ignorar)
  private pendingBack: Promise<void> | null = null;

  constructor() {
    window.addEventListener('popstate', () => {
      if (this.suppress > 0) { this.suppress--; return; }
      if (this.depth > 0) this.depth--;
      const top = this.stack.pop();
      if (top) top.close();
    });
    // Todas as janelas Material passam por aqui automaticamente
    inject(MatDialog).afterOpened.subscribe((ref) => this.track(ref));
  }

  /** Regista uma janela (MatDialogRef) ou folha (MatBottomSheetRef) aberta. */
  async track(ref: MatDialogRef<unknown> | MatBottomSheetRef<unknown>) {
    if (this.pendingBack) await this.pendingBack;
    let closedByBack = false;
    const entry: Overlay = { close: () => { closedByBack = true; if ('dismiss' in ref) ref.dismiss(); else ref.close(); } };
    this.stack.push(entry);
    this.depth++;
    history.pushState({ overlay: this.depth }, '');
    const done = 'afterDismissed' in ref ? ref.afterDismissed() : ref.afterClosed();
    done.subscribe(() => {
      if (closedByBack) return;
      const i = this.stack.indexOf(entry);
      if (i >= 0) this.stack.splice(i, 1);
      this.goBack();
    });
  }

  /** Consome a entrada de histórico de uma janela fechada normalmente, sem que isso feche outra. */
  private goBack() {
    if (this.depth <= 0) return;
    this.depth--;
    this.suppress++;
    const prev = this.pendingBack ?? Promise.resolve();
    this.pendingBack = prev.then(() => new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => { if (finished) return; finished = true; window.removeEventListener('popstate', finish); resolve(); };
      window.addEventListener('popstate', finish);
      setTimeout(finish, 400); // segurança: se o popstate não vier, não bloquear quem abre a seguir
      history.back();
    })).then(() => { this.pendingBack = null; });
  }
}
