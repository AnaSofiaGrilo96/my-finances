-- Migração 001 — para projetos criados com a primeira versão do schema.sql.
-- (Quem cria o projeto de raiz com o schema.sql atual não precisa de correr isto.)

-- Sub-categorias
alter table public.categories add column if not exists parent_id uuid references public.categories(id) on delete set null;

-- Nome a mostrar na app (a saudação usa-o)
alter table public.settings add column if not exists display_name text;

-- Limites de gastos deixaram de existir na app
drop table if exists public.budgets;
