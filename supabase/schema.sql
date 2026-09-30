-- ============================================================
-- MyFinances — esquema da base de dados (Supabase / Postgres)
-- Executar no SQL Editor do projeto Supabase (uma vez).
-- Todas as tabelas têm RLS: cada utilizador só vê os seus dados.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Contas ----------
create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null,
  type            text not null default 'checking' check (type in ('checking','savings','cash','investment','credit','other')),
  color           text not null default '#00c853',
  icon            text not null default 'account_balance_wallet',
  initial_balance numeric(14,2) not null default 0,
  archived        boolean not null default false,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

-- ---------- Categorias ----------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  kind       text not null check (kind in ('expense','income')),
  color      text not null default '#7986cb',
  icon       text not null default 'label',
  parent_id  uuid references public.categories(id) on delete set null,  -- sub-categoria de…
  archived   boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Lançamentos (despesas, receitas e transferências) ----------
-- Uma transferência é UMA linha: kind = 'transfer', account_id = origem, to_account_id = destino.
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date          date not null default current_date,
  kind          text not null check (kind in ('expense','income','transfer')),
  amount        numeric(14,2) not null check (amount >= 0),
  description   text not null default '',
  account_id    uuid not null references public.accounts(id) on delete restrict,
  to_account_id uuid references public.accounts(id) on delete restrict,
  category_id   uuid references public.categories(id) on delete set null,
  paid          boolean not null default true,
  notes         text,
  tags          text[] not null default '{}',
  recurrence_id uuid,                       -- agrupa lançamentos gerados por uma recorrência
  created_at    timestamptz not null default now(),
  constraint transfer_needs_destination check (
    (kind = 'transfer' and to_account_id is not null and to_account_id <> account_id)
    or (kind <> 'transfer' and to_account_id is null)
  )
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);
create index if not exists transactions_account_idx   on public.transactions (account_id);
create index if not exists transactions_category_idx  on public.transactions (category_id);

-- ---------- Definições do utilizador ----------
create table if not exists public.settings (
  user_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text,
  currency     text not null default 'EUR',
  locale       text not null default 'pt-PT'
);

-- ---------- RLS ----------
alter table public.accounts     enable row level security;
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;
alter table public.settings     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','transactions','settings'] loop
    execute format('drop policy if exists "%1$s_owner" on public.%1$s', t);
    execute format(
      'create policy "%1$s_owner" on public.%1$s for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------- Saldos atuais por conta (vista; respeita RLS via security_invoker) ----------
create or replace view public.account_balances
with (security_invoker = on) as
select
  a.id as account_id,
  a.initial_balance
    + coalesce((select sum(t.amount) from public.transactions t where t.paid and t.kind = 'income'   and t.account_id    = a.id), 0)
    - coalesce((select sum(t.amount) from public.transactions t where t.paid and t.kind = 'expense'  and t.account_id    = a.id), 0)
    - coalesce((select sum(t.amount) from public.transactions t where t.paid and t.kind = 'transfer' and t.account_id    = a.id), 0)
    + coalesce((select sum(t.amount) from public.transactions t where t.paid and t.kind = 'transfer' and t.to_account_id = a.id), 0)
  as balance
from public.accounts a;

-- ---------- Saldo de abertura antes de uma data (para o "saldo no dia") ----------
-- p_account null => todas as contas (transferências anulam-se).
create or replace function public.opening_balance(p_date date, p_account uuid default null, p_include_unpaid boolean default true)
returns numeric
language sql
stable
security invoker
as $$
  select
    coalesce((select sum(a.initial_balance) from public.accounts a where (p_account is null or a.id = p_account)), 0)
    + coalesce((select sum(case
          when t.kind = 'income'  and (p_account is null or t.account_id = p_account) then t.amount
          when t.kind = 'expense' and (p_account is null or t.account_id = p_account) then -t.amount
          when t.kind = 'transfer' and p_account is not null and t.account_id    = p_account then -t.amount
          when t.kind = 'transfer' and p_account is not null and t.to_account_id = p_account then  t.amount
          else 0 end)
        from public.transactions t
        where t.date < p_date and (p_include_unpaid or t.paid)), 0);
$$;

-- ---------- Categorias iniciais para um utilizador novo (opcional) ----------
create or replace function public.seed_default_categories()
returns void
language plpgsql
security invoker
as $$
begin
  if exists (select 1 from public.categories where user_id = auth.uid()) then return; end if;
  insert into public.categories (name, kind, color, icon, sort_order) values
    ('Casa',                     'expense', '#7986cb', 'home',              1),
    ('Alimentação',              'expense', '#e57399', 'restaurant',        2),
    ('Supermercado',             'expense', '#f06292', 'shopping_cart',     3),
    ('Transporte',               'expense', '#4fc3f7', 'directions_bus',    4),
    ('Combustível',              'expense', '#29b6f6', 'local_gas_station', 5),
    ('Cafés/Bares e restaurantes','expense','#5c6bc0', 'local_cafe',        6),
    ('Saúde',                    'expense', '#42a5f5', 'medical_services',  7),
    ('Beleza/Estética',          'expense', '#ef5350', 'face',              8),
    ('Compras',                  'expense', '#e040fb', 'shopping_bag',      9),
    ('Lazer e hobbies',          'expense', '#9ccc65', 'sports_esports',   10),
    ('Presentes e doações',      'expense', '#5e35b1', 'card_giftcard',    11),
    ('Animais',                  'expense', '#ffa726', 'pets',             12),
    ('Impostos e Taxas',         'expense', '#ff7043', 'percent',          13),
    ('Educação',                 'expense', '#26a69a', 'school',           14),
    ('Outras despesas',          'expense', '#90a4ae', 'more_horiz',       99),
    ('Salário',                  'income',  '#26c6da', 'star',              1),
    ('Investimentos',            'income',  '#66bb6a', 'trending_up',       2),
    ('Outras receitas',          'income',  '#1de9b6', 'more_horiz',       99);
end $$;
