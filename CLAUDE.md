# MyFinances

Antes de qualquer alteração, lê `SPEC.md` (começa pela secção **10 — Estado atual**) — é a especificação da app (propósito, decisões, modelo de dados, regras de negócio, convenções) e deve manter-se atualizada quando uma regra muda.

Resumo de 10 segundos: app de finanças pessoais de uma só pessoa (Ana), Angular 21 + Angular Material + Supabase, PWA publicada no GitHub Pages com hash routing. Interface em português de Portugal. Prioridades: números certos ao cêntimo, registo rápido, simplicidade (não acrescentar funcionalidades não pedidas), independência de fornecedores.

Regras rápidas:
- Sinal dos movimentos: usar sempre `signFor()` em `src/app/core/models.ts`.
- Saldos das contas só contam movimentos pagos; transferências são uma única linha (origem → destino).
- Alterações ao esquema: nova migração numerada em `supabase/migrations/` + atualizar `supabase/schema.sql`.
- Nunca sobrescrever `src/environments/*` da Ana (têm as chaves do projeto real); nunca commitar a chave `service_role`.
- Verificar com `ng build --configuration production` antes de entregar.
