import { Injectable, inject, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sb = inject(SupabaseService).client;

  readonly session = signal<Session | null>(null);
  readonly user = signal<User | null>(null);
  readonly ready = signal(false);

  private readonly readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.sb.auth.getSession().then(({ data }) => {
      this.setSession(data.session);
      this.ready.set(true);
      this.cleanOAuthParams();
    });
    this.sb.auth.onAuthStateChange((_event, session) => this.setSession(session));
  }

  private setSession(session: Session | null) {
    this.session.set(session);
    this.user.set(session?.user ?? null);
  }

  /** Remove ?code=... da URL (resto de um fluxo OAuth), para não ficar visível. */
  private cleanOAuthParams() {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('code') || url.searchParams.has('error')) {
        url.searchParams.delete('code');
        url.searchParams.delete('error');
        url.searchParams.delete('error_description');
        window.history.replaceState({}, '', url.toString());
      }
    } catch { /* ignore */ }
  }

  async waitUntilReady(): Promise<void> {
    await this.readyPromise;
  }

  async signInWithPassword(email: string, password: string): Promise<string | null> {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
  }

  displayName(): string {
    const u = this.user();
    return (u?.user_metadata?.['full_name'] as string) || (u?.user_metadata?.['name'] as string) || u?.email || '';
  }

  avatarUrl(): string | null {
    return (this.user()?.user_metadata?.['avatar_url'] as string) || null;
  }
}
