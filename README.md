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
2. **SQL Editor → New query**: cola o conteúdo de `supabase/schema.sql` e executa. Cria as tabelas, as políticas de segurança (cada utilizador só vê os seus dados), a vista de saldos e as funções auxiliares.
   - Se já tinhas corrido uma versão anterior do `schema.sql`, corre também `supabase/migrations/001_subcategorias_perfil.sql`.
   - Para importar o histórico do Organizze: os ficheiros de `supabase/migrations/importacao_organizze/`, por ordem (ver secção "Importação" abaixo).
3. **Project Settings → API**: copia o `Project URL` e a `anon public` key para
   `src/environments/environment.ts` **e** `src/environments/environment.prod.ts`.
   (A chave `anon` é pública por desenho — a segurança está nas políticas RLS da base de dados.)

## 3. Login com Google

1. Em https://console.cloud.google.com cria um projeto (ou usa um existente) → **APIs & Services → Credentials → Create credentials → OAuth client ID** → tipo *Web application*.
   - Se pedir, configura primeiro o *OAuth consent screen* (tipo External, adiciona o teu email como test user).
   - **Authorized JavaScript origins**: `http://localhost:4200` e `https://<o-teu-user>.github.io`
   - **Authorized redirect URIs**: `https://<ref-do-projeto>.supabase.co/auth/v1/callback`
     (o valor exato aparece no Supabase em Authentication → Providers → Google, campo *Callback URL*).
2. No Supabase: **Authentication → Providers → Google** → ativa e cola o *Client ID* e o *Client Secret*.
3. No Supabase: **Authentication → URL Configuration**:
   - *Site URL*: `https://<o-teu-user>.github.io/MyFinances/`
   - *Redirect URLs*: adiciona `http://localhost:4200/**` e `https://<o-teu-user>.github.io/MyFinances/**`

Se preferires (ou enquanto o Google não estiver configurado), também dá para entrar com email + password: cria o utilizador em **Authentication → Users → Add user**.

Só tu vais usar a app, mas se alguém entrar com outra conta Google vê uma app vazia — os dados são sempre separados por utilizador.

## 4. Publicar no GitHub Pages

1. Cria o repositório `MyFinances` no GitHub e faz push do código (branch `main`).
2. **Settings → Pages → Source: GitHub Actions**.
3. O workflow `.github/workflows/deploy.yml` corre a cada push para `main` e publica em
   `https://<o-teu-user>.github.io/MyFinances/`.
4. (Opcional) Em **Settings → Secrets and variables → Actions → Variables** define `SUPABASE_URL` e `SUPABASE_ANON_KEY`; se não definires, usa-se o `environment.prod.ts` do repositório.

## 5. Instalar no telemóvel

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
src/app/features/categories    categorias
```

## Conceitos

- **Transferência** é um único lançamento (`kind = 'transfer'`) com conta de origem e destino; não conta como despesa nem receita nos totais gerais.
- **Pago / por pagar**: lançamentos futuros ou por confirmar podem ficar "por pagar"; os saldos das contas só consideram os pagos. Nos relatórios podes escolher se os não pagos entram.
- **Repetir mensalmente** cria N lançamentos (um por mês) ligados por `recurrence_id`; ao editar um, dá para apagar "este e seguintes".
- **Saldo inicial** de cada conta é o saldo antes do primeiro lançamento registado.
- **Sub-categorias**: uma categoria pode pertencer a uma categoria principal (ex.: Transporte › Portagens). Os relatórios e a visão geral agrupam pela principal, com detalhe por sub-categoria; ao filtrar lançamentos por uma principal incluem-se as filhas.
- **O meu nome** (menu do utilizador): nome usado na saudação; útil quando o login é por email.

## Importação do Organizze

Os ficheiros em `supabase/migrations/importacao_organizze/` (01 a 10, para correr por essa ordem — o SQL Editor não aceita um ficheiro único tão grande) foram gerados a partir do export `movimentacoes_*.xls` (uma folha por conta) e:

- cria as 6 contas com os nomes das folhas e as categorias/sub-categorias com a mesma hierarquia do Organizze;
- junta cada par de linhas "Transferências" (saída numa conta + entrada noutra, mesma data e valor, com tolerância de 3 dias) numa única transferência;
- mantém o estado pago / não pago e as "Informações adicionais" como notas.

**Apaga primeiro todos os dados existentes do utilizador** — é para correr uma vez, num projeto acabado de criar. Os saldos resultantes foram verificados contra os do Organizze conta a conta.

## Próximos passos previstos

- Anexos, pesquisa global, gráficos de evolução anual.
