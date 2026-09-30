import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Login com Google (PKCE): o Supabase devolve ?code=... na query string,
        // que o cliente troca por uma sessão. Compatível com o hash routing.
        flowType: 'pkce',
        detectSessionInUrl: true,
      },
    });
  }
}
