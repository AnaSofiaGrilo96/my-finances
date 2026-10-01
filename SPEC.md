# MyFinances — Especificação

Documento de referência para quem pegar neste projeto (pessoa ou assistente de IA). Descreve o propósito, as decisões tomadas e as regras de negócio, para que alterações futuras não se desviem do que a app é. Atualizar este ficheiro sempre que uma decisão aqui descrita mudar.

Última revisão: 2026-10-01.

---

## 1. Propósito

App de **finanças pessoais de uma só pessoa** (a Ana), criada para substituir a subscrição paga do Organizze. Serve para registar movimentos em várias contas, categorizá-los, ver relatórios e **planear**: os pagamentos e recebimentos fixos aparecem nos meses futuros como "não pagos", para se perceber quanto vai sobrar.

Prioridades, por ordem:

1. **Fiabilidade dos números** — saldos e totais têm de bater certo ao cêntimo. Qualquer alteração à lógica de saldos (`account_balances`, `opening_balance`, `signFor`) tem de ser verificada contra dados reais.
2. **Rapidez a registar** — um lançamento novo deve demorar segundos, sobretudo no telemóvel.
3. **Simplicidade** — poucas páginas, sem funcionalidades que não se usam. Foi deliberadamente removida a área de "limites de gastos" porque a Ana raramente a usava. Não acrescentar funcionalidades sem ela as pedir.
4. **Longevidade e independência** — tudo em planos gratuitos, código próprio, dados em Postgres normal e exportáveis. Evitar dependências de que seja difícil sair.

O que a app **não** é: não é multi-utilizador (cada utilizador vê só os seus dados, mas não há partilha nem permissões), não tem ligação a bancos, não tem orçamentos/limites, não tem gestão de cartões de crédito como entidade própria (um cartão é uma conta do tipo `credit`).

---

## 2. Stack e decisões técnicas

| Área | Decisão | Porquê |
|---|---|---|
| Frontend | Angular 21 (standalone components, signals, control flow `@if/@for`), Angular Material 21, TypeScript | É o que a Ana domina; mesmo stack da app da associação fotografARTE |
| Dados e auth | Supabase (Postgres + Auth), plano gratuito | Já usado no outro projeto; RLS por utilizador; SQL exportável |
| Login | Google OAuth (PKCE) **e** email + password como alternativa | Google é o preferido; email/password é o plano B e o que se usa antes de configurar o OAuth |
| Hosting | GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`), **hash routing** (`#/…`) | Gratuito; hash routing evita 404 em refresh no Pages |
| Mobile | PWA (manifest + `@angular/service-worker`), navegação por barra inferior + FAB | Sem lojas de apps; instala-se "Adicionar ao ecrã principal" |
| Gráficos | SVG próprio em `src/app/shared/charts.ts` (donut, barras+saldo, anel) | Sem dependência externa de charts; leve e com o tema Material |
| Moeda | EUR, formato `€ 1.234,56` (ponto nos milhares, vírgula nos decimais) — `MoneyPipe` | É o formato a que a Ana está habituada (Organizze) |
| Datas | ISO `YYYY-MM-DD` em todo o lado, sem fusos horários (`src/app/core/dates.ts`) | Evita bugs de timezone em datas de lançamentos |
| Idioma | Interface em **português de Portugal** (tu-cá-tu-lá informal: "Tens 2 contas a pagar") | Utilizadora única, portuguesa |
| Estado | `DataService` (signals) é a única fonte de verdade no cliente: contas, categorias, recorrências, saldos e `settings` carregam uma vez; lançamentos carregam por intervalo de datas; `version()` incrementa a cada alteração de lançamentos e as páginas recarregam por `effect` | Simples, sem store externo |

Ficheiros `src/environments/environment*.ts` contêm o URL e a **chave anon** do Supabase e vão para o Git de propósito (a chave anon é pública por desenho; a segurança está nas políticas RLS). A chave `service_role` nunca pode aparecer no repositório.

---

## 3. Modelo de dados (`supabase/schema.sql`)

Todas as tabelas têm `user_id default auth.uid()` e política RLS `user_id = auth.uid()`.

### accounts — contas
`name`, `type` (`checking | savings | cash | investment | credit | other`), `color`, `icon`, `initial_balance`, `archived`, `sort_order`.
- `initial_balance` é o saldo antes do primeiro lançamento registado. Nas contas importadas do Organizze é 0 (o "Saldo inicial" veio como lançamento).
- Contas arquivadas não entram no saldo geral nem nos selects, mas o histórico fica.
- Uma conta com lançamentos não pode ser apagada (FK `on delete restrict`) — arquiva-se.

### categories — categorias e sub-categorias
`name`, `kind` (`expense | income`), `color`, `icon`, `parent_id` (null = categoria principal), `archived`, `sort_order`.
- **Um nível apenas**: uma sub-categoria não pode ter filhas. A UI impede transformar em sub-categoria uma categoria que já tem filhas.
- Pode existir o mesmo nome em `expense` e `income` (ex.: "Investimentos", "Outros").
- Relatórios e visão geral agregam pela **categoria principal** (`DataService.rootOf`), com detalhe por sub-categoria expansível. Filtrar lançamentos por uma principal inclui as filhas (`categoryFamily`).
- Apagar uma categoria: lançamentos ficam sem categoria (`on delete set null`); filhas passam a principais.

### transactions — lançamentos
`date`, `kind` (`expense | income | transfer`), `amount` (sempre ≥ 0; o sinal vem do `kind`), `description`, `account_id`, `to_account_id` (só em transferências), `category_id` (null em transferências), `paid`, `notes`, `tags text[]`, `recurrence_id`.
- **Transferência = uma única linha**: `account_id` é a origem, `to_account_id` o destino. Não é despesa nem receita: nos totais gerais soma zero; no extrato de uma conta conta como saída (origem) ou entrada (destino). Esta lógica está centralizada em `signFor()` (`models.ts`) — usar sempre essa função, nunca reimplementar.
- `paid = false` significa "planeado / por pagar". Os **saldos das contas só consideram os pagos**. Nos relatórios há a opção "considerar movimentos não pagos" (ligada por defeito). A visão geral mostra os totais do mês incluindo não pagos (é essa a utilidade: planear).
- `recurrence_id` liga a ocorrência à regra em `recurrences`. Lançamentos antigos criados pela primeira versão do "repetir N meses" têm `recurrence_id` sem regra correspondente — a UI trata esse caso (`deleteOccurrencesFrom`).

### recurrences — regras mensais
`kind`, `amount`, `description`, `account_id`, `to_account_id`, `category_id`, `tags`, `notes`, `start_date`, `end_date` (null = sem fim), `generated` (n.º de ocorrências já criadas), `active`.
- Periodicidade: **só mensal**, no dia de `start_date`; a ocorrência n é `start_date + n meses` com o dia limitado ao último dia do mês (`addMonthsIso`), calculada sempre a partir de `start_date` para não haver deriva (31 → 28 → 28…).
- A app garante ocorrências criadas até **12 meses à frente** (`generateRecurrences`), ao arrancar e quando se navega para um mês mais distante. As ocorrências nascem com `paid = false`; a primeira nasce com o estado escolhido no diálogo.
- Editar uma ocorrência com "aplicar aos meses seguintes" atualiza a regra e as ocorrências **não pagas** a partir do dia seguinte. As pagas nunca são tocadas.
- "Terminar a partir daqui": apaga as não pagas desde essa data e fecha a regra (`active=false`, `end_date`).
- Pausar: apaga as futuras não pagas, mantém a regra. Retomar: recomeça no próximo mês, mesmo dia.
- Apagar a regra: apaga só as ocorrências não pagas; o histórico pago fica.

### settings — definições do utilizador
`display_name` (usado na saudação; necessário porque no login por email não há nome), `currency`, `locale`.

### Vista e funções
- `account_balances` (view, `security_invoker`): saldo atual por conta = `initial_balance` + receitas pagas − despesas pagas − transferências pagas de saída + transferências pagas de entrada.
- `opening_balance(p_date, p_account, p_include_unpaid)`: saldo antes de uma data (todas as contas ou uma), para o "saldo no dia" e para o saldo inicial dos relatórios.
- `seed_default_categories()`: categorias sugeridas para um utilizador novo (não usada na conta da Ana, que tem as do Organizze).

### Migrações
`supabase/migrations/` numeradas: `001_subcategorias_perfil.sql`, `003_recorrencias.sql`. O `schema.sql` reflete sempre o estado final (para projetos novos). **Qualquer alteração ao esquema cria uma migração nova numerada e atualiza o `schema.sql`.** A pasta `importacao_organizze/` contém a importação única do histórico (ver §6) — não voltar a correr.

---

## 4. Estrutura da aplicação

```
src/app/core/       supabase.service, auth.service, auth.guard, data.service, models, dates, theme.service
src/app/shared/     ui.service (toast/erro/confirm), charts, money.pipe, icon-badge, month-nav, confirm.dialog
src/app/layout/     shell — menu lateral (≥900px) / barra inferior + FAB (<900px), menu do utilizador
src/app/features/
  auth/             login.page (Google + email/password), profile.dialog ("O meu nome")
  dashboard/        visão geral
  transactions/     transactions.page (lista mensal), transaction.dialog (criar/editar; recorrências)
  reports/          relatórios: Categorias, Entradas x Saídas, Contas, Tags; exportar CSV
  recurrences/      lista de regras, total fixo mensal, pausar/retomar/apagar
  accounts/         contas (CRUD, ordenar, arquivar)
  categories/       categorias em árvore (CRUD, sub-categorias)
```

### Páginas e o que mostram

**Visão geral (`/`)**
1. Cartão de aviso (só se houver algo): "Tens N contas a pagar e N a receber · hoje e amanhã: a pagar X · a receber Y · N em atraso". Expande para a lista com botão de marcar como pago. Inclui atrasados (data < hoje) — ficam lá até serem pagos. Transferências não entram.
2. Saudação com o primeiro nome (`settings.display_name`, senão nome do Google, senão parte do email), receita/despesa/resultado do mês, navegador de mês, botões Despesa / Entrada / Transferência.
3. Maiores gastos do mês (top 5 por categoria principal + donut) · Saldo geral e lista de contas · Próximos movimentos por pagar (depois de amanhã, até 30 dias).

**Lançamentos (`/lancamentos`)** — mês a mês; filtros Conta / Tipo / Categoria (agrupada) / Pesquisa (descrição, tags, notas); resumo Entradas/Saídas/Resultado; lista agrupada por dia com "Saldo no dia" (só quando os filtros o tornam coerente: sem filtro de tipo/categoria/pesquisa); polegar para alternar pago/por pagar. Query params `mes`, `conta`, `tipo`, `categoria`, `q` para links vindos de outras páginas.

**Diálogo de lançamento** — tipo (Despesa/Receita/Transferência), valor, descrição, data, conta (+ conta destino), categoria agrupada, pago, **Repetir** (Não / Todos os meses / Durante N meses), tags, notas. Em edição de uma ocorrência: checkbox "aplicar aos meses seguintes" e botão "Terminar a partir daqui".

**Relatórios (`/relatorios`)** — período Mês / Ano / 12 meses; filtro por conta; "considerar não pagos"; separadores: Categorias (despesas e receitas por principal, expansível, donut), Entradas x Saídas (gráfico + tabela diária/semanal/mensal com saldo acumulado a partir de `opening_balance`), Contas (movimento por conta no período + saldo atual), Tags. Exportar CSV (`;` como separador, BOM UTF-8, para abrir direto no Excel PT).

**Recorrências (`/recorrencias`)**, **Contas (`/contas`)**, **Categorias (`/categorias`)** — gestão.

### Convenções de UI
- Material 3 com paleta verde (`styles.scss`), modo escuro por botão no topo (guardado em `localStorage`).
- Verde `#1eb980` = entrada/receita, vermelho `#e5484d` = saída/despesa, cinzento = transferência. Valores com sinal (`money:'signed'`).
- Ícones Material Icons (fonte Google); categorias e contas têm cor + ícone, mostrados por `app-icon-badge`.
- Diálogos com `width: 520px`, `maxWidth: 96vw`. Confirmar sempre antes de apagar (`UiService.confirm`).
- Layout mobile-first: FAB "+" e barra inferior com 5 entradas (Início, Lançamentos, Relatórios, Contas, Categorias); Recorrências e "O meu nome" ficam no menu do utilizador. No desktop o menu lateral tem também Recorrências.

---

## 5. Autenticação e deploy

- Supabase Auth com `flowType: 'pkce'` e `detectSessionInUrl: true`; o regresso do Google traz `?code=` na query (compatível com hash routing) e `AuthService` limpa a URL depois.
- `redirectTo` = `origin + pathname` (funciona em `localhost:4200` e em `…github.io/MyFinances/`). As URLs têm de estar em Supabase → Authentication → URL Configuration.
- Deploy: push para `main` → GitHub Actions faz `ng build --base-href /MyFinances/`, copia `index.html` para `404.html`, publica no Pages. Variáveis opcionais `SUPABASE_URL` / `SUPABASE_ANON_KEY` em Actions → Variables sobrepõem o `environment.prod.ts`.
- Repositório: `github.com/AnaSofiaGrilo96/MyFinances`. Pasta local: `C:\Users\agrilo\Documents\My Apps\MyFinances`.

---

## 6. Dados importados do Organizze (histórico)

Em 30/09/2026 importou-se o export completo do Organizze (`movimentacoes_*.xls`, uma folha por conta, 8.043 linhas desde 2018) com `supabase/migrations/importacao_organizze/01…10`. Regras aplicadas:
- 6 contas: MOEY!, MOEY - Poupanças, Crédito Agricola, Numerário, Trading 212 - Juros, Trading 212 - Investimentos (`initial_balance = 0`).
- 57 categorias com a hierarquia exata do Organizze (18 principais de despesa, 4 de receita; "Educação" arquivada).
- Linhas "Transferências" emparelhadas entre contas por valor igual e sinal oposto na mesma data (tolerância de 3 dias) → 959 transferências únicas. Duas sem par (−20 € em 06/06/2019 e −200 € em 19/06/2019, MOEY!) ficaram como despesa em "Outros" com nota.
- Resultado: 7.084 lançamentos; saldos por conta iguais aos do Organizze ao cêntimo.
- IDs das contas e categorias importadas são UUID v5 determinísticos (gerados por `uuid5(namespace, 'acc:<nome>')` etc.) — útil para scripts futuros.

---

## 7. Riscos conhecidos e mitigação

- **Supabase free pausa o projeto após 7 dias sem atividade** — restaura-se no dashboard (janela de 1 ano). Sem backups automáticos no plano gratuito.
- Limite de 2 projetos gratuitos por organização — já ocupados (fotografARTE + MyFinances).
- Mitigação planeada (ainda não feita, a Ana adiou): botão "Fazer backup" que exporta todas as tabelas para um ficheiro, e script de restauro para um Postgres/Supabase novo. Entretanto: Relatórios → 12 meses → Exportar CSV.

---

## 8. Roadmap / ideias discutidas (só fazer quando pedido)

- Backup e restauro completos (ver §7).
- Criar por SQL a lista de recorrências fixas que a Ana vai fornecer.
- Anexos a lançamentos, pesquisa global fora do mês, gráficos de evolução anual.
- Área "Importar" na app para CSV (hoje a importação foi feita uma vez por SQL).

---

## 9. Como trabalhar neste projeto

- Alterações entregues na pasta local da Ana e commitadas com mensagens em português; ela faz o push.
- `npm install` / `npm start` correm no Windows dela; o build de verificação pode ser feito noutro ambiente mas `src/environments/*` dela não devem ser sobrescritos (contêm as chaves do projeto real).
- Antes de entregar: `ng build --configuration production` sem erros; se mexer em saldos/relatórios, validar com dados reais ou com o Postgres local + `schema.sql` + migrações.
- Alterou o esquema? → nova migração numerada + `schema.sql` atualizado + instrução para correr no SQL Editor (o editor rejeita ficheiros > ~1 MB; dividir se necessário).
- Alterou uma regra de negócio? → atualizar este `SPEC.md`.
