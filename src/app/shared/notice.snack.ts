import { Component, inject } from '@angular/core';
import { MAT_SNACK_BAR_DATA } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';

export interface NoticeData { message: string; icon: string; tone: 'ok' | 'del'; }

/** Aviso curto com ícone ("Movimento pago", "Movimento apagado"…), à imagem da app Android da outra aplicação de gestão de finanças (10/11). */
@Component({
  selector: 'app-notice-snack',
  imports: [MatIconModule],
  template: `<div class="n" [class.del]="d.tone === 'del'"><mat-icon fontSet="material-icons-outlined">{{ d.icon }}</mat-icon><span>{{ d.message }}</span></div>`,
  styles: [`
    .n { display: flex; align-items: center; gap: 12px; font-size: 15px; font-weight: 500; }
    mat-icon { font-size: 22px; width: 22px; height: 22px; color: #1eb980; flex-shrink: 0; }
    .n.del mat-icon { color: inherit; }
  `],
})
export class NoticeSnack {
  readonly d = inject<NoticeData>(MAT_SNACK_BAR_DATA);
}
