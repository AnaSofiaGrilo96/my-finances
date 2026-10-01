-- ============================================================
-- Migração 005 — recorrências iniciais (lista da Ana, out/2026)
-- Cria as 24 regras em `recurrences`. Para não duplicar o que já está registado em outubro,
-- cada ocorrência de outubro que já exista (mesma descrição, conta e tipo, data igual ou ±3 dias)
-- é LIGADA à regra em vez de ser criada; as seguintes são geradas pela app ao abrir.
-- Correr uma vez, depois da migração 004. Pode voltar a correr-se: regras já existentes (mesmo id) são ignoradas.
-- ============================================================
do $$
declare
  uid uuid;
  r record;
  acc_id uuid; to_id uuid; cat_id uuid; rid uuid;
  n int; occ date; tx_id uuid; linked int; created int := 0; skipped int := 0; linked_total int := 0;
  horizon date := date '2026-10-31';
begin
  if (select count(*) from auth.users) <> 1 then
    raise exception 'Esperava exatamente 1 utilizador em auth.users.';
  end if;
  select id into uid from auth.users order by created_at limit 1;
  create extension if not exists unaccent;

  -- id determinístico por descrição (uuid v5 calculado em Python; serve para a migração ser idempotente)
  create temp table rules (
    ord int, id uuid, kind text, description text, account text, to_account text,
    cat_kind text, cat_name text, frequency text, start_date date, amount numeric, installments int, total_amount numeric
  ) on commit drop;

  insert into rules values
    ( 1, '7d9bb6b4-6d5c-5b5e-a1a3-6a7cd9b6d2a1', 'expense',  'Seguro Vida Casa',                   'Crédito Agricola', null,               'expense', 'Seguro Vida',             'monthly',  '2026-10-01',   11.98, null, null),
    ( 2, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e01', 'expense',  'Prestação Crédito Terreno',          'Crédito Agricola', null,               'expense', 'Créditos',                'monthly',  '2026-10-01',  155.51, null, null),
    ( 3, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e02', 'expense',  'Depilação',                          'MOEY!',            null,               'expense', 'Depilação',               'biweekly', '2026-10-01',   13.00, null, null),
    ( 4, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e03', 'expense',  'Prestação Bimby',                    'MOEY!',            null,               'expense', 'Créditos',                'monthly',  '2026-10-03',   51.63, null, null),
    ( 5, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e04', 'income',   'Daniel',                             'MOEY!',            null,               'income',  'Outras receitas',         'weekly',   '2026-10-05',  100.00, null, null),
    ( 6, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e05', 'expense',  'Natação',                            'MOEY!',            null,               'expense', 'Ginásio/Desporto',        'monthly',  '2026-10-05',   22.00, null, null),
    ( 7, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e06', 'expense',  'Combustível',                        'MOEY!',            null,               'expense', 'Combustível',             'biweekly', '2026-10-01',  100.00, null, null),
    ( 8, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e07', 'expense',  'Assinatura Google Drive',            'MOEY!',            null,               'expense', 'Assinaturas e serviços',  'yearly',   '2026-10-12',   29.99, null, null),
    ( 9, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e08', 'expense',  'Luz (Cantanhede)',                   'Crédito Agricola', null,               'expense', 'Eletricidade',            'monthly',  '2026-10-21',   50.00, null, null),
    (10, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e09', 'income',   'Salário',                            'Crédito Agricola', null,               'income',  'Salário',                 'monthly',  '2026-10-25', 2079.81, null, null),
    (11, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e10', 'transfer', 'Poupança para Cookidoo',             'Crédito Agricola', 'MOEY - Poupanças', null, null,                           'monthly',  '2026-10-25',    5.00, null, null),
    (12, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e11', 'transfer', 'Transferência entre Contas',         'Crédito Agricola', 'MOEY - Poupanças', null, null,                           'monthly',  '2026-10-25',  415.00, null, null),
    (13, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e12', 'transfer', 'Poupança para IMI Terreno',          'Crédito Agricola', 'MOEY - Poupanças', null, null,                           'monthly',  '2026-10-25',   15.00, null, null),
    (14, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e13', 'transfer', 'Poupança para Pets',                 'Crédito Agricola', 'MOEY - Poupanças', null, null,                           'monthly',  '2026-10-25',   20.00, null, null),
    (15, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e14', 'transfer', 'Poupança para Casa',                 'Crédito Agricola', 'MOEY - Poupanças', null, null,                           'monthly',  '2026-10-25',  850.00, null, null),
    (16, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e15', 'transfer', 'Poupança para Manutenções do Carro', 'Crédito Agricola', 'MOEY - Poupanças', null, null,                           'monthly',  '2026-10-25',   60.00, null, null),
    (17, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e16', 'transfer', 'Poupança para Seguro do Carro',      'Crédito Agricola', 'MOEY - Poupanças', null, null,                           'monthly',  '2026-10-25',   55.00, null, null),
    (18, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e17', 'transfer', 'Poupança para IUC',                  'Crédito Agricola', 'MOEY - Poupanças', null, null,                           'monthly',  '2026-10-25',   25.00, null, null),
    (19, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e18', 'expense',  'Prestação Crédito Construção',       'Crédito Agricola', null,               'expense', 'Créditos',                'monthly',  '2026-10-01',  393.73, null, null),
    (20, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e19', 'expense',  'Unhas',                              'MOEY!',            null,               'expense', 'Unhas',                   'monthly',  '2026-10-28',    9.00, null, null),
    (21, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e20', 'expense',  'Inova (Cantanhede)',                 'Crédito Agricola', null,               'expense', 'Fornecimento de Água',    'monthly',  '2026-10-30',   22.71, null, null),
    (22, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e21', 'expense',  'Carpintarias Veiga (3ª fase)',       'Crédito Agricola', null,               'expense', 'Casa',                    'monthly',  '2026-11-27',  291.48, 20, 5829.60),
    (23, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e22', 'expense',  'Quotas fotografARTE',                'MOEY!',            null,               'expense', 'Assinaturas e serviços',  'yearly',   '2027-07-01',   12.00, null, null),
    (24, 'a0a1e2a1-3c4b-5d6e-8f90-1a2b3c4d5e23', 'expense',  'IUC',                                'MOEY!',            null,               'expense', 'IUC',                     'yearly',   '2027-02-26',  241.50, null, null);

  for r in select * from rules order by ord loop
    if exists (select 1 from public.recurrences where id = r.id) then
      skipped := skipped + 1; continue;
    end if;

    select id into acc_id from public.accounts where user_id = uid and lower(name) = lower(r.account) limit 1;
    if acc_id is null then raise exception 'Conta não encontrada: %', r.account; end if;

    to_id := null;
    if r.to_account is not null then
      select id into to_id from public.accounts where user_id = uid and lower(name) = lower(r.to_account) limit 1;
      if to_id is null then raise exception 'Conta de destino não encontrada: %', r.to_account; end if;
    end if;

    cat_id := null;
    if r.cat_name is not null then
      -- prefere sub-categoria; se não houver, categoria principal com esse nome
      select id into cat_id from public.categories
       where user_id = uid and kind = r.cat_kind and lower(name) = lower(r.cat_name)
       order by (parent_id is null) limit 1;
      if cat_id is null then raise exception 'Categoria não encontrada: % (%)', r.cat_name, r.cat_kind; end if;
    end if;

    -- Liga ocorrências já registadas em outubro (data igual, senão ±3 dias), em sequência a partir da 1.ª
    n := 0; linked := 0;
    loop
      occ := case r.frequency
               when 'daily'    then r.start_date + n
               when 'weekly'   then r.start_date + 7 * n
               when 'biweekly' then r.start_date + 14 * n
               when 'monthly'  then (r.start_date + (n || ' months')::interval)::date
               when 'yearly'   then (r.start_date + (n || ' years')::interval)::date
             end;
      exit when occ > horizon or (r.installments is not null and n >= r.installments);

      select t.id into tx_id from public.transactions t
       where t.user_id = uid and t.recurrence_id is null and t.kind = r.kind and t.account_id = acc_id
         and (to_id is null or t.to_account_id = to_id)
         and lower(unaccent(trim(t.description))) = lower(unaccent(r.description))
         and t.date between occ - 3 and occ + 3
       order by abs(t.date - occ), t.created_at limit 1;

      exit when tx_id is null;
      update public.transactions set recurrence_id = r.id, installment_no = case when r.installments is not null then n + 1 end where id = tx_id;
      linked := linked + 1; n := n + 1;
    end loop;

    insert into public.recurrences (id, user_id, kind, amount, description, account_id, to_account_id, category_id, tags, notes,
                                    frequency, installments, total_amount, start_date, end_date, generated, active)
    values (r.id, uid, r.kind, r.amount, r.description, acc_id, to_id, cat_id, '{}', null,
            r.frequency, r.installments, r.total_amount, r.start_date, null, linked, true);
    created := created + 1; linked_total := linked_total + linked;
  end loop;

  raise notice 'Recorrências criadas: %, já existentes (ignoradas): %, movimentos de outubro ligados: %', created, skipped, linked_total;
end $$;
