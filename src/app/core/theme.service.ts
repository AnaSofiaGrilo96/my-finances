import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

const KEY = 'myfinances-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  readonly dark = signal<boolean>(false);

  constructor() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'dark' || saved === 'light') this.dark.set(saved === 'dark');
      else this.dark.set(window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
    } catch { /* ignore */ }

    effect(() => {
      const dark = this.dark();
      this.doc.documentElement.classList.toggle('dark', dark);
      // Barras do sistema no Android (estado em cima, botões em baixo): o Chrome lê o theme-color e o color-scheme
      // da página para as pintar, por isso acompanham o modo claro/escuro (cores iguais às da barra verde da app).
      this.doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#178f45' : '#00a650');
      this.doc.querySelector('meta[name="color-scheme"]')?.setAttribute('content', dark ? 'dark' : 'light');
      try { localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch { /* ignore */ }
    });
  }
}
