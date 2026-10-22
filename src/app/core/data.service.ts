import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Account, Category, CategoryGroup, Frequency, Recurrence, Settings, Transaction, splitInstallments } from './models';
import { addDays, addMonthsIso, diffDays, occurrenceDate, startForOccurrence, todayIso } from './dates';

type NewTransaction = Omit<Transaction, 'id'>;

/**
 * Store central da aplicação. Contas, categorias, limites e saldos ficam em memória
 * (sinais) e são carregados uma vez; os movimentos são carregados por intervalo de datas.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly sb = inject(SupabaseService).client;

  readonly accounts = signal<Account[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly recurrences = signal<Recurrence[]>([]);
  readonly settings = signal<Settings>({ display_name: null, currency: 'EUR', locale: 'pt-PT' });
  readonly balances = signal<Record<string, number>>({});
  readonly loaded = signal(false);

  readonly activeAccounts = computed(() => this.accounts().filter((a) => !a.archived));
  readonly activeCategories = computed(() => this.categories().filter((c) => !c.archived));
  readonly expenseCategories = computed(() => this.activeCategories().filter((c) => c.kind === 'expense'));
  readonly incomeCategories = computed(() => this.activeCategories().filter((c) => c.kind === 'income'));
  readonly accountMap = computed(() => new Map(this.accounts().map((a) => [a.id, a])));
  readonly categoryMap = computed(() => new Map(this.categories().map((c) => [c.id, c])));

  /** Categorias organizadas em grupos (mãe + filhas), por tipo. Inclui arquivadas. */
  readonly categoryGroups = computed<CategoryGroup[]>(() => {
    const all = [...this.categories()].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'pt'));
    const roots = all.filter((c) => !c.parent_id || !this.categoryMap().has(c.parent_id));
    return roots.map((parent) => ({ parent, children: all.filter((c) => c.parent_id === parent.id) }));
  });
  readonly activeCategoryGroups = computed(() =>
    this.categoryGroups()
      .map((g) => ({ parent: g.parent, children: g.children.filter((c) => !c.archived) }))
      .filter((g) => !g.parent.archived || g.children.length),
  );
  expenseGroups = computed(() => this.activeCategoryGroups().filter((g) => g.parent.kind === 'expense'));
  incomeGroups = computed(() => this.activeCategoryGroups().filter((g) => g.parent.kind === 'income'));

  /** Categoria de topo de uma categoria (ela própria se não for sub-categoria). */
  rootOf(id: string | null | undefined): Category | undefined {
    if (!id) return undefined;
    const c = this.categoryMap().get(id);
    if (!c) return undefined;
    const p = c.parent_id ? this.categoryMap().get(c.parent_id) : undefined;
    return p ?? c;
  }

  /** "Mãe > Filha" ou só o nome. */
  categoryLabel(id: string | null | undefined): string {
    const c = id ? this.categoryMap().get(id) : undefined;
    if (!c) return '';
    const p = c.parent_id ? this.categoryMap().get(c.parent_id) : undefined;
    return p ? `${p.name} › ${c.name}` : c.name;
  }

  /** Ids de uma categoria e das suas filhas (para filtros). */
  categoryFamily(id: string): Set<string> {
    return new Set([id, ...this.categories().filter((c) => c.parent_id === id).map((c) => c.id)]);
  }

  displayName(): string {
    return this.settings().display_name?.trim() ?? '';
  }
  readonly totalBalance = computed(() =>
    this.activeAccounts().reduce((s, a) => s + (this.balances()[a.id] ?? a.initial_balance), 0),
  );

  /** Incrementa sempre que os movimentos mudam; as páginas usam-no para recarregar. */
  readonly version = signal(0);
  /** Último movimento criado (22/10): Movimentos vai até ele e destaca-o. */
  readonly lastCreated = signal<{ id: string; date: string } | null>(null);

  private loading?: Promise<void>;

  // ---------- Carregamento inicial ----------
  /**
   * Arranque (22/10): se houver uma cópia da última sessão guardada no aparelho, a app abre logo com ela e só depois
   * vai buscar os dados frescos (por trás). Sem cópia, espera pela base de dados como antes.
   */
  async ensureLoaded(): Promise<void> {
    if (this.loaded()) return;
    if (!this.loading) {
      this.loading = this.reloadAll();
      if (this.restoreSnapshot()) { this.loading.catch(() => {}); return; }
    }
    await this.loading;
  }

  async reloadAll(): Promise<void> {
    const [acc, cat, set, rec] = await Promise.all([
      this.sb.from('accounts').select('*').order('sort_order').order('name'),
      this.sb.from('categories').select('*').order('sort_order').order('name'),
      this.sb.from('settings').select('*').maybeSingle(),
      this.sb.from('recurrences').select('*').order('description'),
    ]);
    if (acc.error) throw acc.error;
    if (cat.error) throw cat.error;
    if (set.error) throw set.error;
    if (rec.error) throw rec.error;
    this.accounts.set((acc.data ?? []).map(numAccount));
    this.categories.set(cat.data ?? []);
    if (set.data) this.settings.set(set.data as Settings);
    this.recurrences.set((rec.data ?? []).map(numRec));
    await this.generateNow(addMonthsIso(todayIso(), 12));
    await this.refreshBalances();
    this.fresh = true;
    this.loaded.set(true);
    if (this.restored) this.version.update((v) => v + 1); // as páginas abertas com a cópia guardada voltam a ler
    this.saveSnapshot();
  }

  // ---------- Cópia local da última sessão (22/10) ----------
  private static readonly SNAP = 'mf-snapshot-v1';
  /** true depois de os dados frescos chegarem da base de dados nesta sessão. */
  private fresh = false;
  private restored = false;
  private snapTimer?: ReturnType<typeof setTimeout>;
  private restoreSnapshot(): boolean {
    try {
      const raw = localStorage.getItem(DataService.SNAP);
      if (!raw) return false;
      const s = JSON.parse(raw);
      this.accounts.set(s.accounts ?? []);
      this.categories.set(s.categories ?? []);
      if (s.settings) this.settings.set(s.settings);
      this.recurrences.set(s.recurrences ?? []);
      this.balances.set(s.balances ?? {});
      for (const [k, v] of s.tx ?? []) this.txCache.set(k, v);
      for (const [k, v] of s.num ?? []) this.numCache.set(k, v);
      this.restored = true;
      this.loaded.set(true);
      return true;
    } catch { return false; }
  }
  /** Guarda (com um pequeno atraso, para juntar alterações seguidas) o essencial para a próxima abertura. */
  private saveSnapshot() {
    if (!this.fresh) return; // nunca gravar por cima com dados que ainda não foram confirmados
    clearTimeout(this.snapTimer);
    this.snapTimer = setTimeout(() => {
      try {
        const tx = [...this.txCache.entries()].slice(-10);
        const num = [...this.numCache.entries()].slice(-30);
        localStorage.setItem(DataService.SNAP, JSON.stringify({
          accounts: this.accounts(), categories: this.categories(), settings: this.settings(), recurrences: this.recurrences(),
          balances: this.balances(), tx, num,
        }));
      } catch { /* sem espaço ou sem acesso: fica só sem a abertura rápida */ }
    }, 800);
  }

  async refreshBalances(): Promise<void> {
    const { data, error } = await this.sb.from('account_balances').select('*');
    if (error) throw error;
    const map: Record<string, number> = {};
    for (const row of data ?? []) map[row.account_id] = Number(row.balance);
    this.balances.set(map);
    this.saveSnapshot();
  }

  clear() {
    this.dropCache();
    try { localStorage.removeItem(DataService.SNAP); } catch { /* ignore */ }
    this.fresh = false; this.restored = false;
    this.accounts.set([]);
    this.categories.set([]);
    this.recurrences.set([]);
    this.balances.set({});
    this.loaded.set(false);
    this.loading = undefined;
  }

  async saveSettings(patch: Partial<Settings>): Promise<void> {
    const { data, error } = await this.sb.from('settings').upsert({ ...this.settings(), ...patch }, { onConflict: 'user_id' }).select().single();
    if (error) throw error;
    this.settings.set(data as Settings);
  }

  async seedDefaultCategories(): Promise<void> {
    const { error } = await this.sb.rpc('seed_default_categories');
    if (error) throw error;
    await this.reloadAll();
  }

  // ---------- Contas ----------
  async saveAccount(a: Partial<Account> & { name: string }): Promise<Account> {
    const payload = { ...a };
    const q = a.id
      ? this.sb.from('accounts').update(payload).eq('id', a.id)
      : this.sb.from('accounts').insert(payload);
    const { data, error } = await q.select().single();
    if (error) throw error;
    const saved = numAccount(data);
    this.accounts.update((list) =>
      a.id ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved],
    );
    await this.refreshBalances();
    return saved;
  }

  async deleteAccount(id: string): Promise<void> {
    const { error } = await this.sb.from('accounts').delete().eq('id', id);
    if (error) throw error;
    this.accounts.update((l) => l.filter((x) => x.id !== id));
  }

  async reorderAccounts(ids: string[]): Promise<void> {
    const updates = ids.map((id, i) => this.sb.from('accounts').update({ sort_order: i }).eq('id', id));
    await Promise.all(updates);
    this.accounts.update((list) => {
      const order = new Map(ids.map((id, i) => [id, i]));
      return [...list].map((a) => ({ ...a, sort_order: order.get(a.id) ?? a.sort_order })).sort((a, b) => a.sort_order - b.sort_order);
    });
  }

  /** Acerta o saldo atual de uma conta criando um movimento "Ajuste de saldo" (categoria Outros) com a diferença. */
  async adjustBalance(accountId: string, newBalance: number): Promise<number> {
    const current = this.balances()[accountId] ?? this.accountMap().get(accountId)?.initial_balance ?? 0;
    const diff = Math.round((newBalance - current) * 100) / 100;
    if (diff === 0) return 0;
    const kind = diff > 0 ? 'income' : 'expense';
    const cat = this.categories().find((c) => c.kind === kind && c.name.toLowerCase() === 'outros' && !c.archived)
      ?? this.categories().find((c) => c.kind === kind && c.name.toLowerCase().startsWith('outr') && !c.archived);
    await this.saveTransaction({ date: todayIso(), kind, amount: Math.abs(diff), description: 'Ajuste de saldo', account_id: accountId, to_account_id: null,
      category_id: cat?.id ?? null, paid: true, notes: null, tags: [], recurrence_id: null, installment_no: null });
    return diff;
  }

  // ---------- Categorias ----------
  async saveCategory(c: Partial<Category> & { name: string; kind: Category['kind'] }): Promise<Category> {
    const q = c.id
      ? this.sb.from('categories').update(c).eq('id', c.id)
      : this.sb.from('categories').insert(c);
    const { data, error } = await q.select().single();
    if (error) throw error;
    this.categories.update((list) =>
      c.id ? list.map((x) => (x.id === data.id ? data : x)) : [...list, data],
    );
    return data;
  }

  async deleteCategory(id: string): Promise<void> {
    const { error } = await this.sb.from('categories').delete().eq('id', id);
    if (error) throw error;
    // as filhas passam a categorias de topo (on delete set null na BD)
    this.categories.update((l) => l.filter((x) => x.id !== id).map((x) => (x.parent_id === id ? { ...x, parent_id: null } : x)));
  }

  // ---------- Recorrências ----------
  private generatedUntil = '';

  /** Horizonte de geração: 12 meses para mensal/anual, 3 meses para as frequências curtas. */
  private horizonFor(r: Recurrence, until: string): string {
    const short = addMonthsIso(todayIso(), 3);
    return r.frequency === 'monthly' || r.frequency === 'yearly' ? until : (until < short ? until : short);
  }

  /** Garante que todas as recorrências ativas têm ocorrências criadas até `until` (YYYY-MM-DD). */
  /** Gera as ocorrências em falta até `until`. Enquanto a app estiver a usar a cópia guardada espera pelos dados frescos
   *  (gerar a partir de uma cópia antiga podia duplicar movimentos). */
  async generateRecurrences(until: string, force = false): Promise<void> {
    if (!this.fresh && this.loading) { try { await this.loading; } catch { return; } }
    return this.generateNow(until, force);
  }

  private async generateNow(until: string, force = false): Promise<void> {
    if (!force && until <= this.generatedUntil) return;
    this.generatedUntil = until;
    let inserted = 0;
    for (const r of this.recurrences()) {
      if (!r.active) continue;
      const rows: Omit<Transaction, 'id'>[] = [];
      const limit = this.horizonFor(r, until);
      const parts = r.installments && r.total_amount != null ? splitInstallments(r.total_amount, r.installments) : null;
      let n = r.generated;
      for (;;) {
        if (r.installments && n >= r.installments) break;
        const date = occurrenceDate(r.start_date, r.frequency, n);
        if (date > limit || (r.end_date && date > r.end_date)) break;
        rows.push({ date, kind: r.kind, amount: parts ? parts[n] : r.amount, description: r.description, account_id: r.account_id, to_account_id: r.to_account_id,
          category_id: r.category_id, paid: false, notes: r.notes, tags: r.tags, recurrence_id: r.id, installment_no: r.installments ? n + 1 : null });
        n++;
      }
      if (!rows.length) continue;
      const { error } = await this.sb.from('transactions').insert(rows);
      if (error) throw error;
      const { error: e2 } = await this.sb.from('recurrences').update({ generated: n }).eq('id', r.id);
      if (e2) throw e2;
      this.recurrences.update((l) => l.map((x) => (x.id === r.id ? { ...x, generated: n } : x)));
      inserted += rows.length;
    }
    if (inserted) this.version.update((v) => v + 1);
  }

  /** Cria uma recorrência e a sua 1.ª ocorrência (com o estado pago indicado). As seguintes são geradas a seguir. */
  async createRecurrence(rule: Omit<Recurrence, 'id' | 'generated' | 'active'>, firstPaid: boolean): Promise<Recurrence> {
    const { data, error } = await this.sb.from('recurrences').insert({ ...rule, generated: 0, active: true }).select().single();
    if (error) throw error;
    const rec = numRec(data);
    const firstAmount = rec.installments && rec.total_amount != null ? splitInstallments(rec.total_amount, rec.installments)[0] : rec.amount;
    const first: Omit<Transaction, 'id'> = { date: rec.start_date, kind: rec.kind, amount: firstAmount, description: rec.description, account_id: rec.account_id,
      to_account_id: rec.to_account_id, category_id: rec.category_id, paid: firstPaid, notes: rec.notes, tags: rec.tags, recurrence_id: rec.id,
      installment_no: rec.installments ? 1 : null };
    const ins = await this.sb.from('transactions').insert(first).select('id, date').single();
    if (ins.error) throw ins.error;
    this.lastCreated.set({ id: ins.data.id, date: ins.data.date });
    const upd = await this.sb.from('recurrences').update({ generated: 1 }).eq('id', rec.id).select().single();
    if (upd.error) throw upd.error;
    this.recurrences.update((l) => [...l, numRec(upd.data)]);
    this.generatedUntil = '';
    await this.generateRecurrences(addMonthsIso(todayIso(), 12));
    await this.afterTxChange();
    return numRec(upd.data);
  }

  /** Atualiza a regra e todas as ocorrências NÃO pagas a partir de `fromDate` (inclusive). */
  async updateRecurrence(id: string, patch: Partial<Recurrence>, fromDate: string): Promise<void> {
    const { data, error } = await this.sb.from('recurrences').update(patch).eq('id', id).select().single();
    if (error) throw error;
    const rec = numRec(data);
    this.recurrences.update((l) => l.map((x) => (x.id === id ? rec : x)));
    const txPatch: Record<string, unknown> = { kind: rec.kind, description: rec.description, account_id: rec.account_id, to_account_id: rec.to_account_id,
      category_id: rec.category_id, notes: rec.notes, tags: rec.tags };
    if (!rec.installments) txPatch['amount'] = rec.amount;
    const { error: e2 } = await this.sb.from('transactions').update(txPatch).eq('recurrence_id', id).eq('paid', false).gte('date', fromDate);
    if (e2) throw e2;
    await this.afterTxChange();
  }

  /** Termina a recorrência a partir de uma data: apaga as ocorrências não pagas desde aí e fecha a regra. */
  async endRecurrence(id: string, fromDate: string): Promise<void> {
    const { error } = await this.sb.from('transactions').delete().eq('recurrence_id', id).eq('paid', false).gte('date', fromDate);
    if (error) throw error;
    const { data, error: e2 } = await this.sb.from('recurrences').update({ active: false, end_date: fromDate }).eq('id', id).select().single();
    if (e2) throw e2;
    this.recurrences.update((l) => l.map((x) => (x.id === id ? numRec(data) : x)));
    await this.afterTxChange();
  }

  /** Apaga a regra e todas as ocorrências não pagas (as pagas ficam no histórico). */
  async deleteRecurrence(id: string): Promise<void> {
    const { error } = await this.sb.from('transactions').delete().eq('recurrence_id', id).eq('paid', false);
    if (error) throw error;
    const { error: e2 } = await this.sb.from('recurrences').delete().eq('id', id);
    if (e2) throw e2;
    this.recurrences.update((l) => l.filter((x) => x.id !== id));
    await this.afterTxChange();
  }

  /** Pausar apaga as ocorrências futuras não pagas; retomar recomeça a partir do próximo mês (mesmo dia). */
  async setRecurrenceActive(id: string, active: boolean): Promise<void> {
    const rec = this.recurrences().find((x) => x.id === id);
    if (!rec) return;
    let patch: Partial<Recurrence> = { active };
    if (!active) {
      const { error } = await this.sb.from('transactions').delete().eq('recurrence_id', id).eq('paid', false).gt('date', todayIso());
      if (error) throw error;
    } else {
      // retomar: próxima ocorrência depois de hoje, mantendo o ritmo original
      let n = 0, next = rec.start_date;
      while (next <= todayIso() && n < 5000) { n++; next = occurrenceDate(rec.start_date, rec.frequency, n); }
      patch = rec.installments ? { active } : { active, start_date: next, generated: 0, end_date: null };
    }
    const { data, error } = await this.sb.from('recurrences').update(patch).eq('id', id).select().single();
    if (error) throw error;
    this.recurrences.update((l) => l.map((x) => (x.id === id ? numRec(data) : x)));
    this.generatedUntil = '';
    await this.generateRecurrences(addMonthsIso(todayIso(), 12));
    await this.afterTxChange();
  }

  /** Séries antigas (sem regra em `recurrences`): apaga as ocorrências não pagas a partir de uma data. */
  async deleteOccurrencesFrom(recurrenceId: string, fromDate: string): Promise<void> {
    const { error } = await this.sb.from('transactions').delete().eq('recurrence_id', recurrenceId).eq('paid', false).gte('date', fromDate);
    if (error) throw error;
    await this.afterTxChange();
  }

  /**
   * "Atualizar apenas este": guarda o movimento e desliga-o da recorrência (fica diferente dos outros,
   * por isso deixa de ser tocado por alterações à série).
   */
  async saveDetached(t: Transaction): Promise<Transaction> {
    return this.saveTransaction({ ...t, recurrence_id: null, installment_no: null });
  }

  /**
   * "Este e os próximos": guarda o movimento e aplica os mesmos dados à regra (se existir) e às ocorrências
   * não pagas seguintes. Em parcelados o valor de cada parcela não se propaga.
   * - Se a DATA mudou (ex.: de segunda para sábado), as ocorrências seguintes deslocam-se o mesmo número de dias
   *   e a regra passa a contar a partir da nova data, para o ritmo se manter.
   * - Se a FREQUÊNCIA mudou, as ocorrências não pagas seguintes são apagadas e geradas de novo a partir deste
   *   movimento com o novo ritmo (nas parceladas a numeração das parcelas continua).
   * `prevDate` é a data que o movimento tinha antes da edição.
   */
  async saveAndFollowing(t: Transaction, prevDate: string, newFrequency?: Frequency): Promise<void> {
    await this.saveTransaction(t);
    const id = t.recurrence_id!;
    const fields = { kind: t.kind, description: t.description, account_id: t.account_id, to_account_id: t.to_account_id, category_id: t.category_id, notes: t.notes };
    const rule = this.recurrences().find((r) => r.id === id);
    const delta = diffDays(prevDate, t.date);
    if (rule) {
      const patch: Partial<Recurrence> = rule.installments ? { ...fields } : { ...fields, amount: t.amount };
      const freqChanged = !!newFrequency && newFrequency !== rule.frequency;
      if (freqChanged) {
        // Novo ritmo: este movimento passa a ser a referência; o que vinha depois é regenerado
        const { error } = await this.sb.from('transactions').delete().eq('recurrence_id', id).eq('paid', false).gt('date', prevDate).neq('id', t.id);
        if (error) throw error;
        const n = rule.installments ? (t.installment_no ?? 1) : 1;   // ocorrências já contadas (esta inclusive)
        Object.assign(patch, { frequency: newFrequency, start_date: startForOccurrence(t.date, newFrequency!, n - 1), generated: n });
        await this.updateRecurrence(id, patch, addDays(prevDate, 1));
        await this.generateRecurrences(addMonthsIso(todayIso(), 12), true);
        return;
      }
      if (delta !== 0) patch.start_date = addDays(rule.start_date, delta);
      await this.updateRecurrence(id, patch, addDays(prevDate, 1));
      if (delta !== 0) await this.shiftFollowing(id, t, prevDate, delta);
    } else {
      const { error } = await this.sb.from('transactions').update({ ...fields, amount: t.amount }).eq('recurrence_id', id).eq('paid', false).gt('date', prevDate);
      if (error) throw error;
      if (delta !== 0) await this.shiftFollowing(id, t, prevDate, delta);
      await this.afterTxChange();
    }
  }

  /** Desloca `delta` dias todas as ocorrências não pagas da série posteriores a `prevDate` (exceto o próprio movimento). */
  private async shiftFollowing(recurrenceId: string, t: Transaction, prevDate: string, delta: number): Promise<void> {
    const { data, error } = await this.sb.from('transactions').select('*').eq('recurrence_id', recurrenceId).eq('paid', false).gt('date', prevDate).neq('id', t.id);
    if (error) throw error;
    const rows = (data ?? []) as Transaction[];
    if (!rows.length) return;
    const { error: e2 } = await this.sb.from('transactions').upsert(rows.map((r) => ({ ...r, date: addDays(r.date, delta) })));
    if (e2) throw e2;
    await this.afterTxChange();
  }

  /** "Apagar este e os próximos": apaga o movimento, as ocorrências não pagas seguintes e termina a regra. Os já pagos ficam. */
  async deleteAndFollowing(t: Transaction): Promise<void> {
    const { error } = await this.sb.from('transactions').delete().eq('id', t.id);
    if (error) throw error;
    const id = t.recurrence_id!;
    if (this.recurrences().some((r) => r.id === id)) await this.endRecurrence(id, t.date);
    else await this.deleteOccurrencesFrom(id, t.date);
  }

  /** Movimentos por pagar até `until` (inclui atrasados). */
  async listDue(until: string): Promise<Transaction[]> {
    const { data, error } = await this.sb.from('transactions').select('*').eq('paid', false).lte('date', until).order('date');
    if (error) throw error;
    return (data ?? []).map(numTx);
  }

  // ---------- Movimentos ----------
  /** Lê em páginas de 1.000 (limite por pedido da Supabase) para intervalos grandes (ex.: vários anos nos relatórios). */
  async listTransactions(start: string, end: string, accountId?: string | null): Promise<Transaction[]> {
    const PAGE = 1000;
    const all: Transaction[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = this.sb.from('transactions').select('*').gte('date', start).lte('date', end);
      if (accountId) q = q.or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`);
      const { data, error } = await q.order('date').order('created_at').order('id').range(from, from + PAGE - 1);
      if (error) throw error;
      all.push(...(data ?? []).map(numTx));
      if (!data || data.length < PAGE) break;
    }
    this.txCache.set(this.txKey(start, end, accountId), all);
    this.saveSnapshot();
    return all;
  }

  /** Movimentos por pagar entre hoje e daqui a N dias (contas a pagar / a receber). */
  async listPending(fromIso: string, toIso: string): Promise<Transaction[]> {
    const { data, error } = await this.sb
      .from('transactions')
      .select('*')
      .eq('paid', false)
      .gte('date', fromIso)
      .lte('date', toIso)
      .order('date');
    if (error) throw error;
    const list = (data ?? []).map(numTx);
    this.txCache.set(`pend|${fromIso}|${toIso}`, list);
    return list;
  }

  async searchTransactions(text: string, limit = 200): Promise<Transaction[]> {
    const { data, error } = await this.sb
      .from('transactions')
      .select('*')
      .ilike('description', `%${text}%`)
      .order('date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(numTx);
  }

  /** Sugestões para o autocomplete da descrição: movimentos recentes do mesmo tipo cuja descrição contém o texto. */
  async suggestTransactions(kind: Transaction['kind'], text: string, limit = 8): Promise<Transaction[]> {
    const q = text.trim();
    if (!q) return [];
    const { data, error } = await this.sb
      .from('transactions')
      .select('*')
      .eq('kind', kind)
      .ilike('description', `%${q.replace(/[%_]/g, '')}%`)
      .order('date', { ascending: false })
      .limit(60);
    if (error) throw error;
    const seen = new Set<string>();
    const out: Transaction[] = [];
    for (const t of (data ?? []).map(numTx)) {
      const key = `${t.description.trim().toLowerCase()}|${t.category_id}|${t.account_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
      if (out.length >= limit) break;
    }
    return out;
  }

  async openingBalance(date: string, accountId: string | null, includeUnpaid: boolean): Promise<number> {
    const { data, error } = await this.sb.rpc('opening_balance', {
      p_date: date,
      p_account: accountId,
      p_include_unpaid: includeUnpaid,
    });
    if (error) throw error;
    const v = Number(data ?? 0);
    this.numCache.set(`open|${date}|${accountId ?? ''}|${includeUnpaid}`, v);
    return v;
  }

  async saveTransaction(t: Partial<Transaction>): Promise<Transaction> {
    const payload: Record<string, unknown> = { ...t };
    delete payload['id'];
    const q = t.id
      ? this.sb.from('transactions').update(payload).eq('id', t.id)
      : this.sb.from('transactions').insert(payload);
    const { data, error } = await q.select().single();
    if (error) throw error;
    if (!t.id) this.lastCreated.set({ id: data.id, date: data.date });
    await this.afterTxChange();
    return numTx(data);
  }

  /** Cria várias linhas de uma vez (repetições / importação). */
  async insertTransactions(list: NewTransaction[]): Promise<number> {
    if (!list.length) return 0;
    const { error, count } = await this.sb.from('transactions').insert(list, { count: 'exact' });
    if (error) throw error;
    await this.afterTxChange();
    return count ?? list.length;
  }

  /** Marca pago/não pago. Otimista (21/10): as listas em memória e os saldos mudam logo; se a base de dados falhar,
   *  esquece a memória, volta a ler tudo e lança o erro. */
  async setPaid(id: string, paid: boolean, t?: Transaction): Promise<void> {
    this.patchCached(id, (x) => ({ ...x, paid }));
    if (t && t.paid !== paid) this.shiftBalances(t, paid ? 1 : -1);
    const { error } = await this.sb.from('transactions').update({ paid }).eq('id', id);
    if (error) { this.dropCache(); await this.afterTxChange(); throw error; }
    await this.afterTxChange();
  }

  async deleteTransaction(id: string, t?: Transaction): Promise<void> {
    this.patchCached(id, () => null);
    if (t?.paid) this.shiftBalances(t, -1);
    const { error } = await this.sb.from('transactions').delete().eq('id', id);
    if (error) { this.dropCache(); await this.afterTxChange(); throw error; }
    await this.afterTxChange();
  }

  /** Depois de qualquer alteração: avisa as páginas logo (recarregam por trás, a partir da memória) e acerta os saldos. */
  private async afterTxChange() {
    this.version.update((v) => v + 1);
    await this.refreshBalances();
  }

  // ---------- Memória de leituras (21/10: páginas e meses já vistos aparecem logo e atualizam por trás) ----------
  private readonly txCache = new Map<string, Transaction[]>();
  private readonly numCache = new Map<string, number>();
  private txKey(start: string, end: string, acc?: string | null) { return `${start}|${end}|${acc ?? ''}`; }
  /** Última leitura de listTransactions para estes argumentos (ou undefined). */
  peekTransactions(start: string, end: string, acc?: string | null) { return this.txCache.get(this.txKey(start, end, acc)); }
  peekOpening(date: string, acc: string | null, includeUnpaid: boolean) { return this.numCache.get(`open|${date}|${acc ?? ''}|${includeUnpaid}`); }
  peekPending(from: string, to: string) { return this.txCache.get(`pend|${from}|${to}`); }
  /** Aplica uma alteração (ou remoção, se devolver null) a um movimento em todas as leituras guardadas. */
  private patchCached(id: string, fn: (t: Transaction) => Transaction | null) {
    for (const [k, list] of this.txCache) {
      if (!list.some((x) => x.id === id)) continue;
      const pend = k.startsWith('pend|'); // as listas de pendentes só têm não pagos
      this.txCache.set(k, list.map((x) => (x.id === id ? fn(x) : x)).filter((x): x is Transaction => x !== null && !(pend && x.paid)));
    }
  }
  private dropCache() { this.txCache.clear(); this.numCache.clear(); }
  /** Ajusta os saldos em memória como se o movimento passasse a contar (dir = 1) ou deixasse de contar (dir = -1). */
  private shiftBalances(t: Transaction, dir: 1 | -1) {
    const b = { ...this.balances() };
    const add = (acc: string | null, v: number) => { if (acc) b[acc] = Math.round(((b[acc] ?? 0) + v) * 100) / 100; };
    if (t.kind === 'income') add(t.account_id, dir * t.amount);
    else if (t.kind === 'expense') add(t.account_id, -dir * t.amount);
    else { add(t.account_id, -dir * t.amount); add(t.to_account_id, dir * t.amount); }
    this.balances.set(b);
  }
}

function numAccount(a: Account): Account {
  return { ...a, initial_balance: Number(a.initial_balance) };
}

function numRec(r: Recurrence): Recurrence {
  return { ...r, amount: Number(r.amount), total_amount: r.total_amount == null ? null : Number(r.total_amount), tags: r.tags ?? [], frequency: r.frequency ?? 'monthly' };
}

function numTx(t: Transaction): Transaction {
  return { ...t, amount: Number(t.amount), tags: t.tags ?? [], installment_no: t.installment_no ?? null };
}
