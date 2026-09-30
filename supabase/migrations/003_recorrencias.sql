-- Migração 003 — recorrências mensais (pagamentos e recebimentos fixos).
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
  start_date    date not null,                 -- data da 1.ª ocorrência (define o dia do mês)
  end_date      date,                          -- null = sem fim
  generated     int  not null default 0,       -- n.º de ocorrências já criadas (a próxima é start_date + generated meses)
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table public.recurrences enable row level security;
drop policy if exists "recurrences_owner" on public.recurrences;
create policy "recurrences_owner" on public.recurrences for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists transactions_recurrence_idx on public.transactions (recurrence_id, date);
