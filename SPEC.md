# MyFinances — Especificação

Documento de referência para quem pegar neste projeto (pessoa ou assistente de IA). Descreve o propósito, as decisões tomadas e as regras de negócio, para que alterações futuras não se desviem do que a app é. Atualizar este ficheiro sempre que uma decisão aqui descrita mudar.

Última revisão: 2026-10-02 (v3). **Estado atual em §10** — ler primeiro quando se retoma o trabalho.

---

## 1. Propósito

App de **finanças pessoais de uma só pessoa** (a Ana), criada para substituir a subscrição paga do Organizze. Serve para registar movimentos em várias contas, categorizá-los, ver relatórios e **planear**: os pagamentos e recebimentos fixos aparecem nos meses futuros como "não pagos", para se perceber quanto vai sobrar.

Prioridades, por ordem:

1. **Fiabilidade dos números** — saldos e totais têm de bater certo ao cêntimo. Qualquer alteração à lógica de saldos (`account_balances`, `opening_balance`, `signFor`) tem de ser verificada contra dados reais.
2. **Rapidez a registar** — um movimento novo deve demorar segundos, sobretudo no telemóvel.
3. **Simplicidade** — poucas páginas, sem funcionalidades que não se usam. Foram deliberadamente removidos: a área de "limites de gastos", as **tags** e os **anexos** (a Ana não os usa). Observações existem mas ficam escondidas atrás de um botão. Não acrescentar funcionalidades sem ela as pedir.
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
| Datas | ISO `YYYY-MM-DD` em todo o lado, sem fusos horários (`src/app/core/dates.ts`) | Evita bugs de timezone em datas de movimentos |
| Idioma | Interface em **português de Portugal** (tu-cá-tu-lá informal: "Tens 2 contas a pagar") | Utilizadora única, portuguesa |
| Vocabulário | "**Movimentos**" (não "lançamentos") para despesas/receitas/transferências; rota `/movimentos` (`/lancamentos` redireciona) | Pedido da Ana |
| Estado | `DataService` (signals) é a única fonte de verdade no cliente: contas, categorias, recorrências, saldos e `settings` carregam uma vez; movimentos carregam por intervalo de datas; `version()` incrementa a cada alteração de movimentos e as páginas recarregam por `effect` | Simples, sem store externo |

Ficheiros `src/environments/environment*.ts` contêm o URL e a **chave anon** do Supabase e vão para o Git de propósito (a chave anon é pública por desenho; a segurança está nas políticas RLS). A chave `service_role` nunca pode aparecer no repositório.

---

## 3. Modelo de dados (`supabase/schema.sql`)

Todas as tabelas têm `user_id default auth.uid()` e política RLS `user_id = auth.uid()`.

### accounts — contas
`name`, `type` (`checking | savings | cash | investment | credit | other`), `color`, `icon`, `initial_balance`, `archived`, `sort_order`.
- `initial_balance` é o saldo antes do primeiro movimento registado. Nas contas importadas do Organizze é 0 (o "Saldo inicial" veio como movimento).
- Contas arquivadas não entram no saldo geral nem nos selects, mas o histórico fica.
- Uma conta com movimentos não pode ser apagada (FK `on delete restrict`) — arquiva-se.

### categories — categorias e sub-categorias
`name`, `kind` (`expense | income`), `color`, `icon`, `parent_id` (null = categoria principal), `archived`, `sort_order`.
- **Um nível apenas**: uma sub-categoria não pode ter filhas. A UI impede transformar em sub-categoria uma categoria que já tem filhas.
- Pode existir o mesmo nome em `expense` e `income` (ex.: "Investimentos", "Outros").
- Relatórios e visão geral agregam pela **categoria principal** (`DataService.rootOf`), com detalhe por sub-categoria expansível. Filtrar movimentos por uma principal inclui as filhas (`categoryFamily`).
- Apagar uma categoria: movimentos ficam sem categoria (`on delete set null`); filhas passam a principais.

### transactions — movimentos (lançamentos)
`date`, `kind` (`expense | income | transfer`), `amount` (sempre ≥ 0; o sinal vem do `kind`), `description`, `account_id`, `to_account_id` (só em transferências), `category_id` (null em transferências), `paid`, `notes` ("observação"), `tags text[]` (coluna mantida, **sem UI**), `recurrence_id`, `installment_no` (n.º da parcela).
- **Transferência = uma única linha**: `account_id` é a origem, `to_account_id` o destino. Não é despesa nem receita: nos totais gerais soma zero; no extrato de uma conta conta como saída (origem) ou entrada (destino). Esta lógica está centralizada em `signFor()` (`models.ts`) — usar sempre essa função, nunca reimplementar.
- `paid = false` significa "planeado / por pagar". Os **saldos das contas só consideram os pagos**. Nos relatórios há a opção "considerar movimentos não pagos" (ligada por defeito). A visão geral mostra os totais do mês incluindo não pagos (é essa a utilidade: planear).
- `recurrence_id` liga a ocorrência à regra em `recurrences`. Movimentos antigos criados pela primeira versão do "repetir N meses" têm `recurrence_id` sem regra correspondente — a UI trata esse caso (`deleteOccurrencesFrom`).
- **Ajuste de saldo**: em Contas → "Acertar saldo" a Ana escreve o saldo real; a app cria um movimento pago com a data de hoje, descrição "Ajuste de saldo", valor = diferença, na categoria **Outros** (despesa se negativo, receita "Outros" se positivo; `DataService.adjustBalance`). Nunca se altera `initial_balance` para acertar.

### recurrences — regras de repetição (fixas ou parceladas)
`kind`, `amount` (valor de cada ocorrência), `description`, `account_id`, `to_account_id`, `category_id`, `tags`, `notes`, `frequency` (`daily | weekly | biweekly | monthly | yearly`), `installments` (null = fixo; n = parcelado em n parcelas), `total_amount` (parcelado: total), `start_date`, `end_date` (null = sem fim), `generated` (n.º de ocorrências já criadas), `active`.
- Ocorrência n: `occurrenceDate(start_date, frequency, n)` — diária +n dias, semanal +7n, quinzenal +14n, mensal +n meses (dia limitado ao fim do mês, calculado sempre a partir de `start_date` para não derivar), anual +12n meses.
- **Fixo**: `amount` repete-se; opcionalmente "terminar após N vezes" (`end_date` = data da N-ésima). **Parcelado**: o utilizador indica o **valor total** e o n.º de parcelas; a app mostra a pré-visualização "12× € 50,00 todos os meses, de … a …"; as parcelas são `splitInstallments(total, n)` (cêntimos certos, a última acerta o resto) e cada movimento leva `installment_no` (mostrado como "3/12").
- Horizonte de geração (`generateRecurrences`): 12 meses à frente para mensal/anual, 3 meses para diária/semanal/quinzenal; alarga-se ao navegar para meses mais distantes. Ocorrências nascem `paid=false`; a primeira com o estado escolhido no diálogo.
- Editar uma ocorrência com "aplicar às seguintes" atualiza a regra e as ocorrências **não pagas** a partir do dia seguinte (nas parceladas o valor por parcela não é alterado por esta via). As pagas nunca são tocadas.
- "Terminar a partir daqui": apaga as não pagas desde essa data e fecha a regra. Pausar: apaga as futuras não pagas, mantém a regra. Retomar: recomeça na próxima ocorrência depois de hoje, mantendo o ritmo. Apagar a regra: apaga só as não pagas.
- Página Recorrências mostra o total fixo mensal **equivalente** (semanal ×52/12, quinzenal ×26/12, diária ×365/12, anual ÷12).

### settings — definições do utilizador
`display_name` (usado na saudação; necessário porque no login por email não há nome), `currency`, `locale`.

### Vista e funções
- `account_balances` (view, `security_invoker`): saldo atual por conta = `initial_balance` + receitas pagas − despesas pagas − transferências pagas de saída + transferências pagas de entrada.
- `opening_balance(p_date, p_account, p_include_unpaid)`: saldo antes de uma data (todas as contas ou uma), para o "saldo no dia" e para o saldo inicial dos relatórios.
- `seed_default_categories()`: categorias sugeridas para um utilizador novo (não usada na conta da Ana, que tem as do Organizze).

### Migrações
`supabase/migrations/` numeradas: `001_subcategorias_perfil.sql`, `003_recorrencias.sql`, `004_frequencias_parcelas.sql`, `005_recorrencias_iniciais.sql` (dados: as 24 regras fixas da Ana a partir de out/2026; liga movimentos de outubro já existentes em vez de duplicar; idempotente). O `schema.sql` reflete sempre o estado final (para projetos novos). **Qualquer alteração ao esquema cria uma migração nova numerada e atualiza o `schema.sql`.** A pasta `importacao_organizze/` contém a importação única do histórico (ver §6) — não voltar a correr.

---

## 4. Estrutura da aplicação

```
src/app/core/       supabase.service, auth.service, auth.guard, data.service, models, dates, theme.service
src/app/shared/     ui.service (toast/erro/confirm), charts, money.pipe, icon-badge, month-nav (fita de meses), confirm.dialog, picker.sheet (folha inferior de escolha), swipe-row (arrastar para revelar ações)
src/app/layout/     shell — menu lateral (≥900px) / barra inferior + FAB (<900px), menu do utilizador
src/app/features/
  auth/             login.page (Google + email/password), profile.dialog ("O meu nome")
  dashboard/        visão geral
  transactions/     transactions.page (lista mensal), transaction.dialog (criar/editar; recorrências), transaction-detail.sheet (folha de detalhe)
  reports/          relatórios: Categorias, Entradas x Saídas, Contas; exportar CSV
  recurrences/      lista de regras, total fixo mensal, pausar/retomar/apagar
  accounts/         contas (CRUD, ordenar, arquivar)
  categories/       categorias em árvore (CRUD, sub-categorias)
```

### Páginas e o que mostram

**Visão geral (`/`)**
- **Telemóvel (< 900px) mostra APENAS**: saudação ("Boa tarde," + **nome completo** tal como escrito em "O meu nome"; senão o nome da conta Google), cartão de aviso (ou "Nada a pagar ou receber hoje e amanhã"), saldo geral + lista de contas, botão "Gerir contas". Nada mais — decisão explícita da Ana.
- **Computador** mostra além disso: receita/despesa/resultado do mês com navegador de mês e botões Despesa / Entrada / Transferência; Maiores gastos do mês (top 5 por categoria principal + donut); Próximos movimentos por pagar (depois de amanhã, até 30 dias).
- Cartão de aviso: "Tens N contas a pagar e N a receber · hoje e amanhã: a pagar X · a receber Y · N em atraso"; expande para a lista com botão de marcar como pago. Inclui atrasados (data < hoje) até serem pagos. Transferências não entram.

**Movimentos (`/movimentos`)** — mês a mês; **filtros escondidos** atrás do botão de filtro no cabeçalho (badge com o n.º de filtros ativos): Conta / Tipo / Categoria (agrupada) / Estado (pagos, por pagar) / Pesquisa (descrição, observação). **A lista vem primeiro; o resumo Entradas/Saídas/Resultado fica fixo no fundo** (barra sticky acima da navegação). Lista agrupada por dia ("Hoje", "Amanhã") com "Saldo no dia" (só quando os filtros o tornam coerente). **Movimentos por pagar com data até amanhã (ou atrasados) têm fundo amarelo translúcido** — os mesmos do aviso do início. Parcelas mostram "3/12". Cada linha mostra o estado em texto.
- **Nomenclatura fixa de estado**: "pago" / "não pago" para despesas e transferências, "recebido" / "não recebido" para receitas — nada mais (nunca "por efetuar", "efetuada"). O ícone é sempre o **polegar**: 👍 pago/recebido, 👎 não pago/não recebido (lista, folha de detalhe, janela de movimento e aviso do início).
- **Telemóvel: arrastar a linha para a esquerda** (`SwipeRow`) revela três ações: polegar (alterna pago), lápis (editar), caixote (apagar, com confirmação). Só uma linha aberta de cada vez. **No computador não há hover** — usa-se a folha de detalhe.
- **Tocar/clicar numa linha (telemóvel e computador) abre a folha de detalhe** (`TransactionDetailSheet`, à imagem do Organizze): ícone grande da categoria, descrição, valor colorido, quatro botões redondos (apagar, duplicar, polegar, editar) e os dados — Data (hoje/ontem/amanhã/dd/mm/aaaa), Estado, Conta (ou origem/destino), Categoria, Observação ("Adicionar" abre a edição já com o campo visível), Repetição. Editar abre a janela de movimento; **duplicar** abre-a como novo movimento pré-preenchido (data de hoje, sem ligação à recorrência).
- Query params `mes`, `conta`, `tipo`, `categoria`, `q` para links vindos de outras páginas.

**Diálogo de movimento** (`transaction.dialog.ts`, aberto por `openTransactionDialog()` — ecrã inteiro no telemóvel, janela de 480px no computador; mesma estrutura nos dois). Desenhado à imagem do Organizze mobile, a pedido da Ana:
- **Cabeçalho colorido pelo tipo** (vermelho despesa, verde receita, cinzento transferência) com as três abas Despesa / Receita / Transferência (indicador por baixo), o **valor em letras grandes** à direita e o ícone de polegar que alterna pago/não pago.
- **Passo 1 (só em criação)**: teclado numérico próprio (1–9, 0, apagar, limpar) que escreve da direita para a esquerda em cêntimos (1-2-5-0 → 12,50); no computador o teclado físico também funciona (dígitos, Backspace, Enter). Já se pode escrever a descrição neste passo. O botão verde ✓ confirma o valor e passa ao passo 2. Tocar no valor no cabeçalho volta ao teclado.
- **Passo 2**: lista de campos em linhas grandes: Descrição; Categoria (badge + nome); "Pago com" / "Recebi em" (ou Conta origem + Conta destino nas transferências); Data ("Hoje", "Ontem", "Amanhã" ou dd/mm/aaaa, abre o calendário); Repetir movimento com **chips Fixo / Parcelado** (ao escolher aparecem frequência e n.º de parcelas / "terminar após", com pré-visualização); "Mais opções ▾" (Observação; em edição também Apagar e Terminar a partir daqui). Botão ✓ grande fixo em baixo para guardar.
- Categoria e contas escolhem-se numa **folha inferior** (`PickerSheet`): categorias agrupadas (sub-categorias indentadas), contas com o saldo atual como dica.
- **Autocomplete da descrição**: a partir da 1.ª letra procura movimentos recentes do mesmo tipo cuja descrição contém o texto (`DataService.suggestTransactions`, sem duplicados por descrição+categoria+conta, máx. 8) e mostra-os com badge da categoria, conta e valor; escolher um preenche **descrição, categoria e conta** (e conta destino nas transferências). O valor não é copiado.
- Em edição abre diretamente no passo 2 com o tipo bloqueado; a checkbox "aplicar também às seguintes por pagar" aparece quando o movimento pertence a uma recorrência.

**Relatórios (`/relatorios`)** — seletor de mês em fita sempre visível (ano a ano no modo Ano; no modo 12 meses indica "últimos 12 meses até …"); **filtros escondidos** atrás do botão de filtro: período Mês / Ano / 12 meses (**por defeito Mês**), conta, "considerar não pagos", Exportar CSV. Separadores: Categorias (despesas e receitas por principal, expansível, donut), Entradas x Saídas (gráfico + tabela diária/semanal/mensal com saldo acumulado a partir de `opening_balance`), Contas (movimento por conta no período + saldo atual). Exportar CSV (`;` como separador, BOM UTF-8, para abrir direto no Excel PT).

**Recorrências (`/recorrencias`)**, **Contas (`/contas`, inclui "Acertar saldo")**, **Categorias (`/categorias`)** — gestão.

### Convenções de UI
- Material 3 com paleta verde (`styles.scss`), modo escuro por botão no topo (guardado em `localStorage`).
- **Cada área é um cartão** (`.card`): fundo ligeiramente diferente do da página (`surface-container-lowest` em claro, `surface-container` em escuro), borda subtil, cantos arredondados (18px). Novas secções devem usar `.card`.
- Verde `#1eb980` = entrada/receita, vermelho `#e5484d` = saída/despesa, cinzento = transferência. Valores com sinal (`money:'signed'`).
- Ícones Material Icons (fonte Google); categorias e contas têm cor + ícone, mostrados por `app-icon-badge`.
- Diálogos normais com `width: 440–520px`, `maxWidth: 96vw`; folhas inferiores (`MatBottomSheet`) para escolhas e detalhe. Confirmar sempre antes de apagar (`UiService.confirm`).
- **Estilos por tema dentro de componentes**: usar `:host-context(html.dark)` / `:host-context(html:not(.dark))` — `html.dark .x` dentro de `styles:` de um componente NÃO funciona (encapsulamento).
- **Service worker**: o `Shell` escuta `SwUpdate.versionUpdates` e mostra "Há uma nova versão da app — Atualizar". Sem isto, uma versão nova só se aplicava ao fechar e reabrir a PWA (confundiu a Ana uma vez).
- Layout mobile-first: FAB "+" **redondo e grande (64px)** no telemóvel em todas as páginas **exceto Relatórios** (lá não se criam movimentos); em Movimentos sobe para ficar acima da barra de totais e a lista tem espaço extra no fim para a última linha nunca ficar debaixo dele; barra inferior com 3 entradas (Início, Movimentos, Relatórios). **Contas, Categorias, Recorrências e "O meu nome" ficam no menu do ícone de perfil** (canto superior direito), tanto no telemóvel como no computador; o menu lateral do desktop tem só as 3 páginas principais.
- **Seletor de mês em fita** (`app-month-nav`): ‹ Setembro [Outubro] Novembro › — o mês atual numa pílula ao centro, vizinhos clicáveis; **arrastar a fita para a esquerda/direita também muda o mês** (telemóvel); fica **fixa no topo** (abaixo da barra superior) enquanto o conteúdo faz scroll (`.sticky-top`). Usado em Movimentos e Relatórios (em Relatórios com modo "Ano" navega ano a ano). Clicar na pílula volta ao mês atual.

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
- Resultado: 7.084 movimentos; saldos por conta iguais aos do Organizze ao cêntimo.
- IDs das contas e categorias importadas são UUID v5 determinísticos (gerados por `uuid5(namespace, 'acc:<nome>')` etc.) — útil para scripts futuros.

---

## 7. Riscos conhecidos e mitigação

- **Supabase free pausa o projeto após 7 dias sem atividade** — restaura-se no dashboard (janela de 1 ano). Sem backups automáticos no plano gratuito.
- Limite de 2 projetos gratuitos por organização — já ocupados (fotografARTE + MyFinances).
- Mitigação planeada (ainda não feita, a Ana adiou): botão "Fazer backup" que exporta todas as tabelas para um ficheiro, e script de restauro para um Postgres/Supabase novo. Entretanto: Relatórios → 12 meses → Exportar CSV.

---

## 8. Roadmap / ideias discutidas (só fazer quando pedido)

- A Ana disse em 02/10/2026: "ainda há coisas a melhorar, terminamos mais tarde" — vai trazer mais prints/pedidos de melhorias visuais e funcionais. Pedir-lhe a lista quando retomar.
- Importar os movimentos registados no Organizze depois de 30/09/2026 **sem duplicar** os que já existem na app (a Ana vai fornecer o export quando a app estiver estável). Modelo: `005_recorrencias_iniciais.sql` (correspondência por descrição sem acentos, conta, tipo, data ±3 dias).
- Backup e restauro completos (ver §7) — a Ana adiou ("para já não").
- Pesquisa global fora do mês, gráficos de evolução anual, área "Importar" na app para CSV.
- **Não fazer** (decisões explícitas): botão de calculadora no teclado numérico (nunca usou), tags, anexos, limites de gastos, hover para ações no computador.

---

## 9. Como trabalhar neste projeto

- **Nunca duplicar movimentos**: qualquer importação ou criação em massa tem de procurar primeiro o que já existe (descrição sem acentos/maiúsculas, conta, tipo, data igual ou próxima) e ligar/ignorar em vez de inserir — ver `005_recorrencias_iniciais.sql` como modelo.

- **Fluxo de entrega usado até agora** (assistente a trabalhar a partir da cloud, com a pasta da Ana ligada): construir e verificar o código numa cópia de trabalho; empacotar com `tar --exclude=node_modules --exclude=src/environments`; copiar para a pasta `My Apps`; extrair por cima de `MyFinances`; `git add -A && git commit` com mensagem em português; **a Ana faz o `git push`** (dispara o deploy). Nunca sobrescrever `src/environments/*` dela. Apagar os `.git/*.lock` que o git deixa quando corre pela shell montada.
- Verificação visual: servidor `ng serve` + Playwright com as chamadas ao Supabase simuladas (mock), screenshots a 390px (telemóvel) e 1280px (computador), em modo claro e escuro; os ícones Material aparecem como texto nesse ambiente (sem acesso à fonte) — não é um bug.
- A Ana vê a app pela PWA instalada no telemóvel e pela versão publicada no computador; o `npm start` local é opcional. Depois de um push, lembrar que a PWA pode mostrar a versão antiga até atualizar (botão "Atualizar" ou fechar/reabrir).
- `npm install` / `npm start` correm no Windows dela; o build de verificação pode ser feito noutro ambiente mas `src/environments/*` dela não devem ser sobrescritos (contêm as chaves do projeto real).
- Antes de entregar: `ng build --configuration production` sem erros; se mexer em saldos/relatórios, validar com dados reais ou com o Postgres local + `schema.sql` + migrações.
- Alterou o esquema? → nova migração numerada + `schema.sql` atualizado + instrução para correr no SQL Editor (o editor rejeita ficheiros > ~1 MB; dividir se necessário).
- Alterou uma regra de negócio? → atualizar este `SPEC.md`.

---

## 10. Estado atual (02/10/2026) — ler primeiro ao retomar

**Tudo o que está descrito neste documento está implementado, commitado e com push feito** (último commit `d957391`, "Folha de detalhe do movimento…"). A app está publicada em `https://anasofiagrilo96.github.io/MyFinances/` e instalada como PWA no telemóvel da Ana; o login é por email + password (o Google OAuth ainda não foi configurado — a Ana não pediu).

**Base de dados (Supabase, projeto `iblswnveqkrckbxozdpl`)** — migrações já corridas pela Ana, por ordem: `schema.sql` (versão inicial), `001`, `003`, `004`, `005`, e a importação `importacao_organizze/01…10`. Contém o histórico completo desde 2018 (7.084 movimentos), as 57 categorias, as 6 contas e as **24 recorrências** da folha `recorrencias.xlsx` (todas mensais exceto: Daniel semanal às segundas desde 05/10; Depilação e Combustível quinzenais desde 01/10; Google Drive, IUC e Quotas fotografARTE anuais; Carpintarias Veiga parcelado 20× 291,48 € desde 27/11, categoria Casa). O Salário passa a entrar no Crédito Agrícola. A Prestação Crédito Terreno tem 155,51 € como valor de planeamento — a Ana ajusta cêntimos mês a mês.

**Sessão de 02/10 — o que foi feito, por ordem**: aviso de nova versão (service worker); correção de cortes na janela de movimento (box-sizing) e teclado mais compacto; polegar + nomenclatura fixa; arrastar linha para ações no telemóvel; fita de meses fixa no topo com swipe; FAB acima dos totais e ausente nos Relatórios; folha de detalhe ao clicar numa linha com duplicar; remoção do hover no computador.

**Pendentes conhecidos / a confirmar com a Ana**:
- Ela ia reportar mais melhorias visuais ("terminamos mais tarde").
- Confirmar que a correspondência da 005 ligou bem os movimentos de outubro (ela não chegou a dizer o número de "movimentos de outubro ligados").
- Export dos movimentos do Organizze pós-30/09 para importar sem duplicar.
- Google OAuth (passos no README §3) — só se ela quiser.
- Backup/restauro.
