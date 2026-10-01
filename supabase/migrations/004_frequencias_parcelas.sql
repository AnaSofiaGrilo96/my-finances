-- Migração 004 — recorrências com várias frequências e parcelamento; remoção de tags da UI (coluna fica).

alter table public.recurrences
  add column if not exists frequency    text not null default 'monthly'
    check (frequency in ('daily','weekly','biweekly','monthly','yearly')),
  add column if not exists installments int,            -- parcelado: n.º de parcelas (null = fixo, sem fim ou até end_date)
  add column if not exists total_amount numeric(14,2);  -- parcelado: valor total (amount passa a ser o valor de cada parcela)

alter table public.transactions
  add column if not exists installment_no int;          -- n.º da parcela (1..installments) nas recorrências parceladas
