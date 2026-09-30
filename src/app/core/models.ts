export type AccountType = 'checking' | 'savings' | 'cash' | 'investment' | 'credit' | 'other';
export type CategoryKind = 'expense' | 'income';
export type TransactionKind = 'expense' | 'income' | 'transfer';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  color: string;
  icon: string;
  initial_balance: number;
  archived: boolean;
  sort_order: number;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string;
  parent_id: string | null; // sub-categoria de…
  archived: boolean;
  sort_order: number;
}

/** Categoria-mãe com as suas sub-categorias (para listas e selects agrupados). */
export interface CategoryGroup {
  parent: Category;
  children: Category[];
}

export interface Settings {
  display_name: string | null;
  currency: string;
  locale: string;
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  kind: TransactionKind;
  amount: number;
  description: string;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  paid: boolean;
  notes: string | null;
  tags: string[];
  recurrence_id: string | null;
}

/** Regra de recorrência mensal. As ocorrências são lançamentos com recurrence_id = id. */
export interface Recurrence {
  id: string;
  kind: TransactionKind;
  amount: number;
  description: string;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  tags: string[];
  notes: string | null;
  start_date: string;
  end_date: string | null;
  generated: number;
  active: boolean;
}

export const ACCOUNT_TYPES: { id: AccountType; label: string; icon: string }[] = [
  { id: 'checking', label: 'Conta à ordem', icon: 'account_balance_wallet' },
  { id: 'savings', label: 'Poupança', icon: 'savings' },
  { id: 'cash', label: 'Numerário', icon: 'payments' },
  { id: 'investment', label: 'Investimento', icon: 'trending_up' },
  { id: 'credit', label: 'Cartão de crédito', icon: 'credit_card' },
  { id: 'other', label: 'Outra', icon: 'account_balance' },
];

export const PALETTE = [
  '#00c853', '#7986cb', '#e57399', '#4fc3f7', '#5c6bc0', '#42a5f5', '#ef5350', '#e040fb',
  '#9ccc65', '#5e35b1', '#ffa726', '#ff7043', '#26a69a', '#26c6da', '#66bb6a', '#ffca28',
  '#8d6e63', '#78909c', '#d81b60', '#3949ab',
];

export const ICONS = [
  'home', 'restaurant', 'shopping_cart', 'directions_bus', 'local_gas_station', 'local_cafe', 'medical_services',
  'face', 'shopping_bag', 'sports_esports', 'card_giftcard', 'pets', 'percent', 'school', 'more_horiz', 'star',
  'trending_up', 'work', 'flight', 'fitness_center', 'phone_iphone', 'wifi', 'bolt', 'water_drop', 'local_hospital',
  'child_care', 'directions_car', 'two_wheeler', 'movie', 'music_note', 'menu_book', 'checkroom', 'spa', 'savings',
  'account_balance', 'credit_card', 'payments', 'receipt_long', 'build', 'celebration', 'local_bar', 'local_pizza',
  'label',
];

/** Sinal do movimento numa conta: +1 entra, -1 sai, 0 não afeta. */
export function signFor(t: Transaction, accountId?: string | null): number {
  if (t.kind === 'income') return !accountId || t.account_id === accountId ? 1 : 0;
  if (t.kind === 'expense') return !accountId || t.account_id === accountId ? -1 : 0;
  // transferência
  if (!accountId) return 0;
  if (t.account_id === accountId) return -1;
  if (t.to_account_id === accountId) return 1;
  return 0;
}
