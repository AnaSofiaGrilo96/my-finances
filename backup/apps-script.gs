/**
 * MyFinances — backup mensal para o Google Drive (Google Apps Script)
 * ------------------------------------------------------------------
 * Todos os meses vai buscar TODOS os dados à Supabase e grava em
 *   Backups / My Finances / AAAA-MM-DD /
 *     <uma CSV por conta>.csv   — formato do export da outra aplicação de gestão de finanças (Data; Descrição; Categoria; Valor; Situação; Tags; Informações adicionais)
 *     movimentos.csv            — todos os movimentos, com ids (para restauro)
 *     contas.csv, categorias.csv, recorrencias.csv
 *     dados.json                — cópia integral tal como veio da base de dados
 *
 * Instalação (uma vez):
 *   1. https://script.google.com → Novo projeto → cola este ficheiro inteiro.
 *   2. Preenche SUPABASE_URL, SUPABASE_ANON_KEY (está em src/environments/environment.prod.ts) e BACKUP_KEY
 *      (a chave mostrada pela migração 007 no Supabase).
 *   3. Executa uma vez a função `backupAgora` (o Google pede autorização ao Drive) e confirma a pasta.
 *   4. Executa a função `instalarGatilho` — cria o gatilho mensal (dia 1, de manhã). Fica a correr sozinho.
 */

const SUPABASE_URL = 'https://XXXXXXXX.supabase.co';
const SUPABASE_ANON_KEY = 'cola-aqui-a-chave-anon';
const BACKUP_KEY = 'cola-aqui-a-chave-de-backup';
const FOLDER_PATH = ['Backups', 'My Finances'];   // pasta de destino no teu Drive (é criada se não existir)
const SEP = ';';                                   // separador CSV (o Excel em português abre direto)

function backupAgora() {
  const data = fetchExport();
  const folder = getOrCreatePath(FOLDER_PATH.concat([Utilities.formatDate(new Date(), 'Europe/Lisbon', 'yyyy-MM-dd')]));
  const files = buildFiles(data);
  Object.keys(files).forEach((name) => {
    const existing = folder.getFilesByName(name);
    while (existing.hasNext()) existing.next().setTrashed(true); // se correr duas vezes no mesmo dia, substitui
    folder.createFile(name, files[name], name.endsWith('.json') ? 'application/json' : 'text/csv');
  });
  Logger.log('Backup gravado em ' + folder.getUrl() + ' — ' + data.transactions.length + ' movimentos.');
}

function instalarGatilho() {
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === 'backupAgora') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('backupAgora').timeBased().onMonthDay(1).atHour(6).inTimezone('Europe/Lisbon').create();
  Logger.log('Gatilho mensal instalado (dia 1, ~06:00).');
}

// ---------------------------------------------------------------- dados
function fetchExport() {
  const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/backup_export', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
    payload: JSON.stringify({ p_key: BACKUP_KEY }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('Supabase respondeu ' + res.getResponseCode() + ': ' + res.getContentText());
  return JSON.parse(res.getContentText());
}

function buildFiles(d) {
  const acc = {}; d.accounts.forEach((a) => (acc[a.id] = a));
  const cat = {}; d.categories.forEach((c) => (cat[c.id] = c));
  const files = {};

  // Uma CSV por conta, no formato do export da outra aplicação de gestão de finanças (transferências aparecem nas duas contas, com sinais opostos)
  d.accounts.forEach((a) => {
    const rows = [];
    d.transactions.forEach((t) => {
      let value = null;
      if (t.kind === 'transfer') {
        if (t.account_id === a.id) value = -t.amount; else if (t.to_account_id === a.id) value = t.amount; else return;
      } else if (t.account_id === a.id) {
        value = t.kind === 'expense' ? -t.amount : t.amount;
      } else return;
      rows.push([fmtDate(t.date), t.description, t.kind === 'transfer' ? 'Transferências' : (cat[t.category_id] ? cat[t.category_id].name : ''),
        fmtNum(value), t.paid ? 'Pago' : 'Não pago', (t.tags || []).join(','), t.notes || '']);
    });
    rows.sort((x, y) => x[0].split('.').reverse().join('').localeCompare(y[0].split('.').reverse().join('')));
    files[safeName(a.name) + '.csv'] = csv([['Data', 'Descrição', 'Categoria', 'Valor', 'Situação', 'Tags', 'Informações adicionais']].concat(rows));
  });

  // Dumps completos (com ids) para restauro
  files['movimentos.csv'] = csv([['id', 'data', 'tipo', 'valor', 'descricao', 'conta', 'conta_destino', 'categoria', 'pago', 'observacao', 'tags', 'recorrencia_id', 'parcela']]
    .concat(d.transactions.map((t) => [t.id, t.date, t.kind, fmtNum(t.amount), t.description, acc[t.account_id] ? acc[t.account_id].name : t.account_id,
      t.to_account_id ? (acc[t.to_account_id] ? acc[t.to_account_id].name : t.to_account_id) : '', t.category_id ? catLabel(cat, t.category_id) : '',
      t.paid ? 'sim' : 'não', t.notes || '', (t.tags || []).join(','), t.recurrence_id || '', t.installment_no || ''])));
  files['contas.csv'] = csv([['id', 'nome', 'tipo', 'saldo_inicial', 'arquivada', 'ordem', 'cor', 'icone']]
    .concat(d.accounts.map((a) => [a.id, a.name, a.type, fmtNum(a.initial_balance), a.archived ? 'sim' : 'não', a.sort_order, a.color, a.icon])));
  files['categorias.csv'] = csv([['id', 'nome', 'tipo', 'categoria_principal', 'arquivada', 'ordem', 'cor', 'icone']]
    .concat(d.categories.map((c) => [c.id, c.name, c.kind, c.parent_id ? (cat[c.parent_id] ? cat[c.parent_id].name : c.parent_id) : '', c.archived ? 'sim' : 'não', c.sort_order, c.color, c.icon])));
  files['recorrencias.csv'] = csv([['id', 'descricao', 'tipo', 'valor', 'frequencia', 'inicio', 'fim', 'parcelas', 'valor_total', 'conta', 'conta_destino', 'categoria', 'ativa', 'geradas', 'observacao']]
    .concat(d.recurrences.map((r) => [r.id, r.description, r.kind, fmtNum(r.amount), r.frequency, r.start_date, r.end_date || '', r.installments || '', r.total_amount != null ? fmtNum(r.total_amount) : '',
      acc[r.account_id] ? acc[r.account_id].name : r.account_id, r.to_account_id ? (acc[r.to_account_id] ? acc[r.to_account_id].name : r.to_account_id) : '',
      r.category_id ? catLabel(cat, r.category_id) : '', r.active ? 'sim' : 'não', r.generated, r.notes || ''])));
  files['dados.json'] = JSON.stringify(d, null, 1);
  return files;
}

// ---------------------------------------------------------------- utilitários
function catLabel(cat, id) { const c = cat[id]; if (!c) return id; return c.parent_id && cat[c.parent_id] ? cat[c.parent_id].name + ' › ' + c.name : c.name; }
function fmtDate(iso) { const p = iso.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }       // dd.mm.aaaa como a outra aplicação
function fmtNum(n) { return Number(n).toFixed(2).replace('.', ','); }                              // 1234,56
function safeName(s) { return s.replace(/[\\/:*?"<>|]/g, '-').trim(); }
function csv(rows) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + rows.map((r) => r.map(esc).join(SEP)).join('\r\n');                             // BOM para o Excel reconhecer UTF-8
}
function getOrCreatePath(parts) {
  let folder = DriveApp.getRootFolder();
  parts.forEach((name) => { const it = folder.getFoldersByName(name); folder = it.hasNext() ? it.next() : folder.createFolder(name); });
  return folder;
}
