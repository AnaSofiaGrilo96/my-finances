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
      this.doc.documentElement.classList.toggle('dark', this.dark());
      try { localStorage.setItem(KEY, this.dark() ? 'dark' : 'light'); } catch { /* ignore */ }
    });
  }
}
