# MyFinances

Gestão de finanças pessoais de uma só pessoa — contas, categorias e sub-categorias, movimentos (despesas, receitas e transferências), recorrências fixas e parceladas, e relatórios. Funciona no browser e como app no telemóvel (PWA). Interface em português de Portugal.

Stack: **Angular 21 + Angular Material**, **Supabase** (Postgres + Auth por email/password), **GitHub Pages**. Sem dependências pagas.

A especificação completa (decisões, modelo de dados, regras de negócio, convenções de UI e estado atual) está em [`SPEC.md`](SPEC.md). Quem for mexer no código deve começar por lá; `CLAUDE.md` tem o resumo para assistentes.

---

## 1. Correr localmente

```bash
npm install
npm start
```

Abre http://localhost:4200. Antes disso é preciso configurar o Supabase (secção 2).

## 2. Configurar o Supabase

1. Em https://supabase.com cria um projeto novo (ex.: `myfinances`).
2. **SQL Editor → New query**: cola o conteúdo de `supabase/schema.sql` e executa. É um **script único e idempotente** que cria tudo: tabelas, políticas de segurança (RLS), vista de saldos, funções auxiliares e a função de backup. Pode voltar a correr-se sem estragar nada. No fim devolve a **chave de backup** (só na primeira execução) — guarda-a para o Apps Script (secção 5).
3. **Project Settings → API**: copia o `Project URL` e a `anon public` key para `src/environments/environment.ts` **e** `src/environments/environment.prod.ts`. (A chave `anon` é pública por desenho — a segurança está nas políticas RLS. A chave `service_role` nunca entra no repositório.)
4. **Dados**: o repositório **não contém dados** (é público). Para repor contas, categorias, recorrências e movimentos num projeto novo usa-se um script de restauro gerado a partir do `dados.json` do backup (secção 5). Esses scripts, e qualquer outro com inserts de dados, ficam em `_local/` (ignorado pelo git).

Não existe pasta de migrações: qualquer alteração ao esquema edita o `schema.sql` e corre-se o excerto no SQL Editor.

## 3. Login

Login por **email + password** (Supabase Auth). Cria o utilizador em **Authentication → Users → Add user** (com *Auto Confirm User*) e desliga os registos públicos em **Authentication → Providers → Email → Allow new users to sign up**. A app é de um único utilizador — para mudar a password usa-se *Reset password* nesse mesmo ecrã; **nunca apagar o utilizador**, porque os dados estão ligados a ele (recuperar implica um restauro do backup).

## 4. Publicar no GitHub Pages

1. Cria o repositório no GitHub e faz push do código (branch `main`).
2. **Settings → Pages → Source: GitHub Actions**.
3. O workflow `.github/workflows/deploy.yml` corre a cada push para `main`, faz `ng build --base-href /MyFinances/`, copia `index.html` para `404.html` e publica em `https://<o-teu-user>.github.io/MyFinances/`. A app usa *hash routing* (`#/movimentos`) para o refresh nunca dar 404.
4. (Opcional) Em **Settings → Secrets and variables → Actions → Variables** define `SUPABASE_URL` e `SUPABASE_ANON_KEY`; se não definires, usa-se o `environment.prod.ts` do repositório.

Depois de um push, a PWA instalada pode mostrar a versão antiga até atualizar — a app avisa "Há uma nova versão" com botão **Atualizar**.

## 5. Backup mensal para o Google Drive

Todos os meses (dia 1) um Google Apps Script vai buscar todos os dados à Supabase e grava-os em **Backups / My Finances / AAAA-MM-DD /** no Drive: uma CSV por conta (formato do export de outra aplicação de gestão de finanças), `movimentos.csv`, `contas.csv`, `categorias.csv`, `recorrencias.csv` (com ids, para restauro) e `dados.json` (cópia integral).

1. A chave de backup é devolvida pelo `schema.sql` na primeira execução. Se a perdeste, corre no SQL Editor `delete from private.backup_keys;` e depois o bloco final do `schema.sql` ("Chave de backup") — devolve uma chave nova e invalida a anterior.
2. Em https://script.google.com → *Novo projeto* → cola `backup/apps-script.gs`. Preenche `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `BACKUP_KEY`.
3. Executa `backupAgora` — o Google pede autorização para o Drive; confirma que a pasta ficou criada.
4. Executa `instalarGatilho` — passa a correr sozinho todos os meses.

A chave só dá acesso de leitura ao export e nunca é guardada em claro (fica só o hash). **Restauro**: a partir do `dados.json` gera-se localmente um script SQL (ids originais preservados, categorias principais primeiro, lotes de 1.000 movimentos, `on conflict (id) do nothing`) que se corre no SQL Editor — já foi usado com sucesso.

## 6. Instalar no telemóvel

Abre o site no Chrome (Android) ou Safari (iPhone) e escolhe **"Adicionar ao ecrã principal"**. A app abre em ecrã inteiro, com barra inferior (Início, Movimentos, Relatórios), botão "+" para registar movimentos e menu de perfil com Contas, Categorias, Recorrências, "O meu nome" e modo escuro.

---

## O que a app faz

- **Visão geral**: saudação, aviso do que há a pagar/receber hoje (e atrasados) com botão para marcar como pago, saldo geral por conta; no computador também os totais do mês, maiores gastos e os próximos movimentos a pagar/a receber ("Vence hoje" / "Próximas").
- **Movimentos**: lista mês a mês (roda de meses no cabeçalho fixo), filtros em pílulas (conta, tipo, categoria, estado, pesquisa), agrupado por dia com "saldo no dia", totais fixos no fundo. No telemóvel arrastar a linha revela pagar/editar/apagar; tocar abre a folha de detalhe (apagar, duplicar, pago, editar). Ao abrir o mês atual faz scroll para o primeiro dia com movimentos por validar.
- **Novo movimento**: janela com teclado numérico, descrição com sugestões (preenchem categoria e conta), categoria por defeito "Outros"/"Outras receitas", data, repetição **fixa ou parcelada** (diária, semanal, quinzenal, mensal, anual), observação.
- **Recorrências**: a app gera as ocorrências futuras como não pagas (12 meses à frente nas mensais/anuais, 3 nas restantes); ao editar ou apagar uma ocorrência pergunta "apenas este" ou "este e os próximos". A página Recorrências mostra as regras, o total fixo mensal equivalente e permite pausar/retomar/apagar.
- **Relatórios**: período com presets (hoje, semana, mês, últimos 3/6/12 meses, ano, intervalo à escolha), filtro por conta e estado; separadores Categorias (por principal, com sub-categorias) e Entradas x Saídas (gráfico + tabela diária/semanal/mensal com saldo acumulado); filtros na URL (link partilhável); exportar CSV (`;`, BOM UTF-8, abre direto no Excel PT). Clicar numa categoria abre os Movimentos com o mesmo intervalo.
- **Contas** (CRUD, ordenar, arquivar, acertar saldo) e **Categorias** (árvore de um nível).
- **Modo escuro**, botão Voltar do Android fecha janelas, aviso de nova versão.

## Conceitos

- **Transferência** é um único movimento (`kind = 'transfer'`) com conta de origem e destino; não conta como despesa nem receita nos totais gerais. O sinal de qualquer movimento vem sempre de `signFor()` (`src/app/core/models.ts`).
- **Pago / não pago** (receitas: recebido / não recebido): os **saldos das contas só consideram os pagos**; nos relatórios escolhe-se se os não pagos entram (por defeito sim, para planear).
- **Saldo inicial** de cada conta é o saldo antes do primeiro movimento registado. "Acertar saldo" cria um movimento de ajuste na categoria Outros; nunca altera o saldo inicial.
- **Sub-categorias**: um nível (Transporte › Portagens). Relatórios e visão geral agrupam pela principal; filtrar por uma principal inclui as filhas.
- **Formato**: EUR `€ 1.234,56`, datas ISO sem fusos horários.

## Estrutura

```
supabase/schema.sql            esquema da base de dados (script único: tabelas, RLS, vista de saldos, funções, backup)
backup/apps-script.gs          backup mensal para o Google Drive
src/app/core/                  Supabase, auth, DataService (fonte de verdade, paginado a 1.000), modelos, datas, tema
src/app/shared/                gráficos SVG, pipe de moeda, roda de meses, diálogos, folhas, swipe, botão Voltar
src/app/layout/shell.ts        barra superior verde (computador) / barra inferior + FAB (telemóvel), menu do utilizador
src/app/features/dashboard     visão geral
src/app/features/transactions  movimentos (lista, janela de criação/edição, folha de detalhe)
src/app/features/reports       relatórios (categorias, entradas x saídas, exportar CSV)
src/app/features/recurrences   regras de repetição
src/app/features/accounts      contas
src/app/features/categories    categorias
_local/                        (ignorado pelo git) scripts com dados: importações, restauros
```

## Dados, importações e restauro

Os scripts com dados (importação do histórico de outra aplicação de gestão de finanças, cargas de recorrências, restauros a partir do backup) são gerados conforme necessário e guardados **só localmente** em `_local/supabase-dados/`. Regras: nunca duplicar movimentos (procurar primeiro por descrição sem acentos, conta, tipo e data próxima), transferências como uma única linha, idempotência (`on conflict (id) do nothing`), lotes de ~1.000 linhas (o SQL Editor rejeita ficheiros grandes), e o SQL Editor não mostra `raise notice` — resumos devolvem-se com `select`.

## Antes de entregar alterações

`npx tsc --noEmit` e `ng build --configuration production` sem erros; se mexeres em saldos ou relatórios, validar contra dados reais. Alterou-se uma regra de negócio? Atualizar o `SPEC.md`.
