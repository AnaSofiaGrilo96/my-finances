import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Account, Budget, Category, Transaction } from './models';

type NewTransaction = Omit<Transaction, 'id'>;

/**
 * Store central da aplicação. Contas, categorias, limites e saldos ficam em memória
 * (sinais) e são carregados uma vez; os lançamentos são carregados por intervalo de datas.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly sb = inject(SupabaseService).client;

  readonly accounts = signal<Account[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly budgets = signal<Budget[]>([]);
  readonly balances = signal<Record<string, number>>({});
  readonly loaded = signal(false);

  readonly activeAccounts = computed(() => this.accounts().filter((a) => !a.archived));
  readonly activeCategories = computed(() => this.categories().filter((c) => !c.archived));
  readonly expenseCategories = computed(() => this.activeCategories().filter((c) => c.kind === 'expense'));
  readonly incomeCategories = computed(() => this.activeCategories().filter((c) => c.kind === 'income'));
  readonly accountMap = computed(() => new Map(this.accounts().map((a) => [a.id, a])));
  readonly categoryMap = computed(() => new Map(this.categories().map((c) => [c.id, c])));
  readonly totalBalance = computed(() =>
    this.activeAccounts().reduce((s, a) => s + (this.balances()[a.id] ?? a.initial_balance), 0),
  );

  /** Incrementa sempre que os lançamentos mudam; as páginas usam-no para recarregar. */
  readonly version = signal(0);

  private loading?: Promise<void>;

  // ---------- Carregamento inicial ----------
  async ensureLoaded(): Promise<void> {
    if (this.loaded()) return;
    if (!this.loading) this.loading = this.reloadAll();
    await this.loading;
  }

  async reloadAll(): Promise<void> {
    const [acc, cat, bud] = await Promise.all([
      this.sb.from('accounts').select('*').order('sort_order').order('name'),
      this.sb.from('categories').select('*').order('sort_order').order('name'),
      this.sb.from('budgets').select('*'),
    ]);
    if (acc.error) throw acc.error;
    if (cat.error) throw cat.error;
    if (bud.error) throw bud.error;
    this.accounts.set((acc.data ?? []).map(numAccount));
    this.categories.set(cat.data ?? []);
    this.budgets.set((bud.data ?? []).map((b) => ({ ...b, amount: Number(b.amount) })));
    await this.refreshBalances();
    this.loaded.set(true);
  }

  async refreshBalances(): Promise<void> {
    const { data, error } = await this.sb.from('account_balances').select('*');
    if (error) throw error;
    const map: Record<string, number> = {};
    for (const row of data ?? []) map[row.account_id] = Number(row.balance);
    this.balances.set(map);
  }

  clear() {
    this.accounts.set([]);
    this.categories.set([]);
    this.budgets.set([]);
    this.balances.set({});
    this.loaded.set(false);
    this.loading = undefined;
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
    this.categories.update((l) => l.filter((x) => x.id !== id));
    this.budgets.update((l) => l.filter((b) => b.category_id !== id));
  }

  // ---------- Limites ----------
  async setBudget(categoryId: string, amount: number | null): Promise<void> {
    if (amount === null || amount <= 0) {
      const { error } = await this.sb.from('budgets').delete().eq('category_id', categoryId);
      if (error) throw error;
      this.budgets.update((l) => l.filter((b) => b.category_id !== categoryId));
      return;
    }
    const { data, error } = await this.sb
      .from('budgets')
      .upsert({ category_id: categoryId, amount }, { onConflict: 'user_id,category_id' })
      .select()
      .single();
    if (error) throw error;
    const saved = { ...data, amount: Number(data.amount) } as Budget;
    this.budgets.update((l) => {
      const i = l.findIndex((b) => b.category_id === categoryId);
      return i >= 0 ? l.map((b, j) => (j === i ? saved : b)) : [...l, saved];
    });
  }

  // ---------- Lançamentos ----------
  async listTransactions(start: string, end: string, accountId?: string | null): Promise<Transaction[]> {
    let q = this.sb.from('transactions').select('*').gte('date', start).lte('date', end);
    if (accountId) q = q.or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`);
    const { data, error } = await q.order('date').order('created_at');
    if (error) throw error;
    return (data ?? []).map(numTx);
  }

  /** Lançamentos por pagar entre hoje e daqui a N dias (contas a pagar / a receber). */
  async listPending(fromIso: string, toIso: string): Promise<Transaction[]> {
    const { data, error } = await this.sb
      .from('transactions')
      .select('*')
      .eq('paid', false)
      .gte('date', fromIso)
      .lte('date', toIso)
      .order('date');
    if (error) throw error;
    return (data ?? []).map(numTx);
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

  async openingBalance(date: string, accountId: string | null, includeUnpaid: boolean): Promise<number> {
    const { data, error } = await this.sb.rpc('opening_balance', {
      p_date: date,
      p_account: accountId,
      p_include_unpaid: includeUnpaid,
    });
    if (error) throw error;
    return Number(data ?? 0);
  }

  async saveTransaction(t: Partial<Transaction>): Promise<Transaction> {
    const payload: Record<string, unknown> = { ...t };
    delete payload['id'];
    const q = t.id
      ? this.sb.from('transactions').update(payload).eq('id', t.id)
      : this.sb.from('transactions').insert(payload);
    const { data, error } = await q.select().single();
    if (error) throw error;
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

  async setPaid(id: string, paid: boolean): Promise<void> {
    const { error } = await this.sb.from('transactions').update({ paid }).eq('id', id);
    if (error) throw error;
    await this.afterTxChange();
  }

  async deleteTransaction(id: string): Promise<void> {
    const { error } = await this.sb.from('transactions').delete().eq('id', id);
    if (error) throw error;
    await this.afterTxChange();
  }

  async deleteRecurrence(recurrenceId: string, fromDate: string): Promise<void> {
    const { error } = await this.sb.from('transactions').delete().eq('recurrence_id', recurrenceId).gte('date', fromDate);
    if (error) throw error;
    await this.afterTxChange();
  }

  private async afterTxChange() {
    await this.refreshBalances();
    this.version.update((v) => v + 1);
  }
}

function numAccount(a: Account): Account {
  return { ...a, initial_balance: Number(a.initial_balance) };
}

function numTx(t: Transaction): Transaction {
  return { ...t, amount: Number(t.amount), tags: t.tags ?? [] };
}
