-- ============================================================
-- MyFinances — esquema COMPLETO da base de dados (Supabase / Postgres)
-- Script único: cria a base de dados de raiz (tabelas, RLS, vista de saldos, funções, backup).
-- Executar no SQL Editor do projeto Supabase. Pode voltar a correr-se (idempotente).
-- Os DADOS (contas, categorias, movimentos) não estão aqui: repõem-se a partir do backup do Drive
-- com um script de restauro gerado localmente (nunca vai para o repositório — ver README §2).
-- ============================================================

create extension if not exists "pgcrypto";
set search_path to public, extensions;  -- na Supabase o pgcrypto (gen_random_bytes, digest) vive no esquema `extensions`

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
  installment_no int,                       -- n.º da parcela (recorrências parceladas)
  created_at    timestamptz not null default now(),
  constraint transfer_needs_destination check (
    (kind = 'transfer' and to_account_id is not null and to_account_id <> account_id)
    or (kind <> 'transfer' and to_account_id is null)
  )
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);
create index if not exists transactions_account_idx   on public.transactions (account_id);
create index if not exists transactions_category_idx  on public.transactions (category_id);

-- ---------- Recorrências mensais ----------
-- Cada regra gera automaticamente os lançamentos futuros (como "não pagos") até 12 meses à frente.
create table if not exists public.recurrences (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('expense','income','transfer')),
  amount        numeric(14,2) not null check (amount >= 0),
  description   text not null default '',
  account_id    uuid not null references public.accounts(id) on delete cascade,
  to_account_id uuid references public.accounts(id) on delete cascade,
  category_id   uuid references public.categories(id) on delete set null,
  tags          text[] not null default '{}',
  notes         text,
  frequency     text not null default 'monthly' check (frequency in ('daily','weekly','biweekly','monthly','yearly')),
  installments  int,                           -- parcelado: n.º de parcelas (null = fixo)
  total_amount  numeric(14,2),                 -- parcelado: valor total (amount é o valor de cada parcela)
  start_date    date not null,                 -- data da 1.ª ocorrência
  end_date      date,                          -- null = sem fim
  generated     int  not null default 0,       -- n.º de ocorrências já criadas
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists transactions_recurrence_idx on public.transactions (recurrence_id, date);

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
alter table public.recurrences  enable row level security;
alter table public.settings     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','transactions','recurrences','settings'] loop
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

-- ---------- Categorias iniciais para um utilizador novo (opcional; a Ana usa as do backup/restauro) ----------
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

-- ============================================================
-- Backup mensal (Google Apps Script em backup/apps-script.gs)
-- Função que devolve TODOS os dados em JSON, chamada por HTTP (/rest/v1/rpc/backup_export) com a chave anon
-- + uma chave de backup secreta cujo hash fica em private.backup_keys. Sem a chave certa devolve erro.
-- ============================================================
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.backup_keys (
  id         int primary key default 1 check (id = 1),
  key_hash   text not null,
  created_at timestamptz not null default now(),
  last_used  timestamptz
);

create or replace function public.backup_export(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp  -- `extensions`: onde a Supabase instala o pgcrypto (digest)
as $$
declare
  uid uuid;
  result jsonb;
begin
  if p_key is null or not exists (select 1 from private.backup_keys where key_hash = encode(digest(p_key, 'sha256'), 'hex')) then
    raise exception 'chave de backup inválida' using errcode = '28000';
  end if;
  update private.backup_keys set last_used = now() where id = 1;  -- a Supabase recusa update sem where
  select id into uid from auth.users order by created_at limit 1;

  select jsonb_build_object(
    'exported_at', now(),
    'accounts',     (select coalesce(jsonb_agg(to_jsonb(a) order by a.sort_order, a.name), '[]') from public.accounts a where a.user_id = uid),
    'categories',   (select coalesce(jsonb_agg(to_jsonb(c) order by c.kind, c.sort_order, c.name), '[]') from public.categories c where c.user_id = uid),
    'recurrences',  (select coalesce(jsonb_agg(to_jsonb(r) order by r.description), '[]') from public.recurrences r where r.user_id = uid),
    'settings',     (select to_jsonb(s) from public.settings s where s.user_id = uid),
    'transactions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.date, t.created_at), '[]') from public.transactions t where t.user_id = uid)
  ) into result;
  return result;
end $$;

revoke all on function public.backup_export(text) from public;
grant execute on function public.backup_export(text) to anon, authenticated;

-- Chave de backup: criada só se ainda não existir, e devolvida como RESULTADO desta query (copia-a para o Apps Script;
-- não volta a aparecer). Se já existir, não devolve nada. Para rodar a chave: delete from private.backup_keys; e correr este bloco.
with k as (select encode(gen_random_bytes(24), 'hex') as key),
ins as (
  insert into private.backup_keys (id, key_hash)
  select 1, encode(digest(key, 'sha256'), 'hex') from k
  on conflict (id) do nothing
  returning id
)
select key as "Chave de backup — copia agora" from k join ins on true;
