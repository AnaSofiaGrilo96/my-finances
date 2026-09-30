# MyFinances

Gestão de finanças pessoais — contas, categorias e sub-categorias, lançamentos (despesas, receitas e transferências) e relatórios. Funciona no browser e como app no telemóvel (PWA).

Stack: **Angular 21 + Angular Material**, **Supabase** (Postgres + Auth com Google), **GitHub Pages**.

---

## 1. Correr localmente

```bash
npm install
npm start
```

Abre http://localhost:4200. (Antes disso precisas de configurar o Supabase — ver abaixo.)

## 2. Configurar o Supabase

1. Em https://supabase.com cria um projeto novo (ex.: `myfinances`).
2. **SQL Editor → New query**: cola o conteúdo de `supabase/schema.sql` e executa. É um **script único** que cria tudo: tabelas, políticas de segurança (RLS), vista de saldos, funções auxiliares e a função de backup. Pode voltar a correr-se sem estragar nada. No fim devolve a **chave de backup** (só na primeira execução) — copia-a para o Apps Script (secção 5).
3. **Project Settings → API**: copia o `Project URL` e a `anon public` key para
   `src/environments/environment.ts` **e** `src/environments/environment.prod.ts`.
   (A chave `anon` é pública por desenho — a segurança está nas políticas RLS da base de dados.)
4. **Dados**: o repositório **não contém dados** (é público). Para repor as contas, categorias, recorrências e movimentos num projeto novo usa-se um script de restauro gerado a partir do `dados.json` do backup (secção 5). Esses scripts, e qualquer outro com inserts de dados, ficam em `_local/` (ignorado pelo git) e nunca são commitados.

## 3. Login

O login é por **email + password** (decisão de 07/10: o login com Google foi ponderado e descartado — não justifica para uma app de uma só pessoa; a conta usa uma password forte).
Cria o utilizador no Supabase em **Authentication → Users → Add user** (com *Auto Confirm User*). Convém desligar os registos públicos em
**Authentication → Providers → Email → Allow new users to sign up**, para ninguém criar contas na tua instância.

## 4. Publicar no GitHub Pages

1. Cria o repositório `MyFinances` no GitHub e faz push do código (branch `main`).
2. **Settings → Pages → Source: GitHub Actions**.
3. O workflow `.github/workflows/deploy.yml` corre a cada push para `main` e publica em
   `https://<o-teu-user>.github.io/MyFinances/`.
4. (Opcional) Em **Settings → Secrets and variables → Actions → Variables** define `SUPABASE_URL` e `SUPABASE_ANON_KEY`; se não definires, usa-se o `environment.prod.ts` do repositório.

## 5. Backup mensal para o Google Drive

Todos os meses (dia 1, de manhã) um Google Apps Script vai buscar todos os dados à Supabase e grava-os em
**Backups / My Finances / AAAA-MM-DD /** no teu Drive: uma CSV por conta no formato do export da outra aplicação de gestão de finanças,
`movimentos.csv`, `contas.csv`, `categorias.csv`, `recorrencias.csv` (com ids, para restauro) e `dados.json` (cópia integral).

1. A chave de backup é devolvida pelo `supabase/schema.sql` na primeira execução (secção 2). Se já a perdeste, corre no SQL Editor:
   `delete from private.backup_keys;` e depois o bloco final do `schema.sql` ("Chave de backup") — devolve uma chave nova e invalida a anterior.
2. Em https://script.google.com → *Novo projeto* → cola `backup/apps-script.gs`. Preenche `SUPABASE_URL`, `SUPABASE_ANON_KEY`
   (igual ao de `src/environments/environment.prod.ts`) e `BACKUP_KEY` (a chave do passo 1).
3. Executa a função `backupAgora` — o Google pede autorização para o Drive; confirma que a pasta ficou criada.
4. Executa a função `instalarGatilho` — fica a correr sozinho todos os meses. Podes correr `backupAgora` à mão sempre que quiseres.

A chave de backup só dá acesso de leitura ao export e nunca é guardada em claro (fica só o hash). O script corre na tua conta Google;
a app em si não precisa de nada disto.

## 6. Instalar no telemóvel

Abre o site no Chrome (Android) ou Safari (iPhone) e escolhe **"Adicionar ao ecrã principal"**. A app abre em ecrã inteiro, com navegação por separadores em baixo e botão "+" para lançamentos rápidos.

---

## Estrutura

```
supabase/schema.sql            esquema da base de dados (tabelas, RLS, vista de saldos, funções)
src/app/core/                  Supabase, auth, store de dados (DataService), modelos, datas
src/app/shared/                gráficos SVG (donut, entradas x saídas, anel), pipe de moeda, diálogos
src/app/layout/shell.ts        layout: menu lateral (desktop) / barra inferior + FAB (mobile)
src/app/features/dashboard     visão geral
src/app/features/transactions  lançamentos (lista mensal, filtros, diálogo de criação/edição)
src/app/features/reports       relatórios: categorias (com detalhe por sub-categoria), entradas x saídas, contas, tags (+ exportar CSV)
src/app/features/accounts      contas
src/app/features/recurrences   recorrências mensais (regras)
src/app/features/categories    categorias
```

## Conceitos

- **Transferência** é um único lançamento (`kind = 'transfer'`) com conta de origem e destino; não conta como despesa nem receita nos totais gerais.
- **Pago / por pagar**: lançamentos futuros ou por confirmar podem ficar "por pagar"; os saldos das contas só consideram os pagos. Nos relatórios podes escolher se os não pagos entram.
- **Recorrências**: ao criar um lançamento podes escolher "Repetir: todos os meses" (ou durante N meses). Fica guardada uma regra em `recurrences` e a app gera automaticamente as ocorrências dos 12 meses seguintes como não pagas (`recurrence_id` liga-as à regra). Ao editar uma ocorrência dá para aplicar as alterações aos meses seguintes ou terminar a recorrência a partir daí; em Recorrências (menu do utilizador) vês todas as regras, o total fixo mensal, e podes pausar/retomar/apagar.
- **Aviso no topo da visão geral**: lista o que há para pagar/receber hoje e amanhã (e atrasados), com botão para marcar como pago.
- **Saldo inicial** de cada conta é o saldo antes do primeiro lançamento registado.
- **Sub-categorias**: uma categoria pode pertencer a uma categoria principal (ex.: Transporte › Portagens). Os relatórios e a visão geral agrupam pela principal, com detalhe por sub-categoria; ao filtrar lançamentos por uma principal incluem-se as filhas.
- **O meu nome** (menu do utilizador): nome usado na saudação; útil quando o login é por email.

## Dados, importações e restauro

Os scripts com dados (importação do histórico de outra aplicação de gestão de finanças, carregamentos de recorrências, restauros a partir do backup) são gerados conforme necessário e guardados **só localmente** em `_local/supabase-dados/` (pasta ignorada pelo git). Regras que todos seguem: nunca duplicar movimentos (procurar primeiro por descrição sem acentos, conta, tipo e data próxima), transferências como uma única linha (origem → destino), idempotência (`on conflict (id) do nothing`), e o SQL Editor da Supabase não aceita ficheiros muito grandes — dividir em lotes de ~1.000 linhas.

## Próximos passos previstos

- Anexos, pesquisa global, gráficos de evolução anual.
