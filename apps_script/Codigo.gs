// Servidor do sistema da Transição Governamental 2026, publicado como App da Web do Google Apps Script.
// Fica dentro da planilha Google que guarda os dados. Abas usadas:
//   usuarios (usuario | nome | senha | perfil), registros, opc_tipo, opc_unidade, opc_titulo.
// Login e perfis são conferidos aqui, a cada pedido. Depois de alterar este arquivo, publique uma nova versão.

var COLUNAS = [
  ['id', 'id'], ['unidade', 'Responsável'], ['tipo', 'Tipo'], ['titulo', 'Título'], ['descricao', 'Descrição'],
  ['ato', 'Ato de criação'], ['criadoPor', 'Criado por'], ['criadoEm', 'Criado em'],
  ['atualizadoPor', 'Atualizado por'], ['atualizadoEm', 'Atualizado em']
];
var COLEGIADO = 'Colegiado';
var MAX_DESCRICAO = 2000;
var HORAS_SESSAO = 6;           // limite do cache do Google
var MAX_TENTATIVAS = 5;
var MINUTOS_BLOQUEIO = 15;

function doGet() {
  return saida({ ok: true, sistema: 'Transição Governamental 2026' });
}

function doPost(e) {
  try {
    var pedido = JSON.parse(e.postData.contents);
    var resposta = pedido.acao === 'entrar' ? entrar(pedido) : executar(pedido);
    resposta.ok = true;
    return saida(resposta);
  } catch (erro) {
    if (erro && erro.publico) return saida({ ok: false, erro: erro.publico, sessao: !!erro.sessao });
    console.error(erro);
    return saida({ ok: false, erro: 'Erro no servidor. Tente de novo.' });
  }
}

function saida(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}

function falhar(mensagem, sessao) {
  throw { publico: mensagem, sessao: !!sessao };
}

function executar(pedido) {
  var u = autenticar(pedido.token);
  switch (pedido.acao) {
    case 'listar': return { usuario: u, listas: listas(), registros: lerRegistros() };
    case 'salvar': return comTrava(function () { salvar(u, pedido.registro); return { registros: lerRegistros() }; });
    case 'excluir': return comTrava(function () { excluir(u, pedido.id); return { registros: lerRegistros() }; });
    case 'importar': return comTrava(function () { var p = importar(u, pedido.linhas); return { placar: p, registros: lerRegistros() }; });
    case 'sair': CacheService.getScriptCache().remove('s:' + pedido.token); return {};
  }
  falhar('Ação desconhecida.');
}

function comTrava(funcao) {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) falhar('O sistema está ocupado. Tente de novo.');
  try {
    return funcao();
  } finally {
    trava.releaseLock();
  }
}

// ---------- planilha ----------
function aba(nome) {
  var a = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!a) falhar('Falta a aba ' + nome + ' na planilha.');
  return a;
}

// Linhas da aba como objetos; o cabeçalho é a primeira linha preenchida (em minúsculas).
function linhasDaAba(nome) {
  var valores = aba(nome).getDataRange().getDisplayValues();
  var i = 0;
  while (i < valores.length && valores[i].join('') === '') i++;
  if (i >= valores.length) return [];
  var cabecalho = valores[i].map(function (c) { return String(c).trim().toLowerCase(); });
  return valores.slice(i + 1).map(function (linha) {
    var o = {};
    cabecalho.forEach(function (c, j) { o[c] = String(linha[j]).trim(); });
    return o;
  });
}

function listas() {
  var tipos = {};
  linhasDaAba('opc_tipo').forEach(function (t) { if (t.id_tipo) tipos[t.id_tipo] = t.tipo; });
  var titulos = [];
  linhasDaAba('opc_titulo').forEach(function (t) {
    if (t.titulo && tipos[t.id_tipo]) titulos.push({ titulo: t.titulo, tipo: tipos[t.id_tipo], unidade: t['responsável'] });
  });
  return {
    tipos: Object.keys(tipos).map(function (k) { return tipos[k]; }),
    unidades: linhasDaAba('opc_unidade').map(function (u) { return u['responsável']; }).filter(String),
    titulos: titulos
  };
}

// Os registros têm a linha 1 de cabeçalho, sempre com as colunas nesta ordem.
function lerRegistros() {
  return aba('registros').getDataRange().getDisplayValues().slice(1).filter(function (l) { return l[0]; }).map(function (l) {
    var r = {};
    COLUNAS.forEach(function (c, j) { r[c[0]] = String(l[j] === undefined ? '' : l[j]); });
    return r;
  });
}

function linhaDoId(id) {
  var ids = aba('registros').getDataRange().getDisplayValues().map(function (l) { return l[0]; });
  var i = ids.indexOf(String(id));
  return i < 1 ? 0 : i + 1;
}

// Formato de texto: o que começa com = fica como texto, não vira fórmula.
function escrever(numeroLinha, r) {
  var valores = COLUNAS.map(function (c) { return r[c[0]] || ''; });
  aba('registros').getRange(numeroLinha, 1, 1, COLUNAS.length).setNumberFormat('@').setValues([valores]);
}

// ---------- login ----------
function buscarUsuario(login) {
  login = String(login || '').trim().toLowerCase();
  var achados = linhasDaAba('usuarios').filter(function (u) { return u.usuario.toLowerCase() === login; });
  return achados.length ? achados[0] : null;
}

function entrar(pedido) {
  var cache = CacheService.getScriptCache();
  var login = String(pedido.usuario || '').trim().toLowerCase();
  var chave = 'f:' + login;
  var tentativas = Number(cache.get(chave)) || 0;
  if (tentativas >= MAX_TENTATIVAS) falhar('Muitas tentativas. Aguarde ' + MINUTOS_BLOQUEIO + ' minutos.');
  var u = buscarUsuario(login);
  var perfilValido = u && ['admin', 'cadastrador', 'consulta'].indexOf(u.perfil.toLowerCase()) >= 0;
  if (!perfilValido || !u.senha || u.senha !== String(pedido.senha || '').trim()) {
    cache.put(chave, String(tentativas + 1), MINUTOS_BLOQUEIO * 60);
    falhar('Usuário ou senha inválidos.');
  }
  cache.remove(chave);
  var token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('s:' + token, login, HORAS_SESSAO * 3600);
  return { token: token, usuario: publico(u), listas: listas(), registros: lerRegistros() };
}

function publico(u) {
  return { usuario: u.usuario.toLowerCase(), nome: u.nome || u.usuario, perfil: u.perfil.toLowerCase() };
}

// O perfil é lido da planilha a cada pedido: mudar ou apagar um usuário vale na hora.
function autenticar(token) {
  var login = token ? CacheService.getScriptCache().get('s:' + token) : null;
  var u = login ? buscarUsuario(login) : null;
  if (!u) falhar('Sua sessão terminou. Entre novamente.', true);
  return publico(u);
}

// ---------- regras ----------
function validar(r, lista) {
  return lista.tipos.indexOf(r.tipo) >= 0 && lista.unidades.indexOf(r.unidade) >= 0 && r.titulo &&
         r.descricao && r.descricao.length <= MAX_DESCRICAO;
}

function limpo(r) {
  var c = {};
  COLUNAS.forEach(function (col) { c[col[0]] = String(r[col[0]] === undefined || r[col[0]] === null ? '' : r[col[0]]).trim(); });
  if (c.tipo !== COLEGIADO) c.ato = '';
  return c;
}

function salvar(u, dados) {
  if (u.perfil === 'consulta') falhar('Seu perfil é apenas de consulta.');
  var r = limpo(dados || {});
  if (!validar(r, listas())) falhar('Confira responsável, tipo, título e descrição (até 2.000 caracteres).');
  var agora = new Date().toISOString();
  var linha;
  if (r.id) {
    linha = linhaDoId(r.id);
    if (!linha) falhar('Este registro não existe mais. Atualize a página.');
    var atual = lerRegistros().filter(function (x) { return x.id === r.id; })[0];
    if (u.perfil !== 'admin' && atual.criadoPor !== u.usuario) falhar('Você só pode alterar os próprios registros.');
    r.criadoPor = atual.criadoPor;
    r.criadoEm = atual.criadoEm;
  } else {
    linha = aba('registros').getLastRow() + 1;
    r.id = Utilities.getUuid();
    r.criadoPor = u.usuario;
    r.criadoEm = agora;
  }
  r.atualizadoPor = u.usuario;
  r.atualizadoEm = agora;
  escrever(linha, r);
}

function excluir(u, id) {
  if (u.perfil === 'consulta') falhar('Seu perfil é apenas de consulta.');
  var linha = linhaDoId(id);
  if (!linha) falhar('Este registro não existe mais. Atualize a página.');
  var atual = lerRegistros().filter(function (x) { return x.id === id; })[0];
  if (u.perfil !== 'admin' && atual.criadoPor !== u.usuario) falhar('Você só pode excluir os próprios registros.');
  aba('registros').deleteRow(linha);
}

// Junta pelo id: registro novo entra; registro existente só muda se a planilha importada for mais recente.
function importar(u, linhas) {
  if (u.perfil !== 'admin') falhar('Só o perfil admin pode importar.');
  var lista = listas();
  var atuais = {};
  lerRegistros().forEach(function (r) { atuais[r.id] = r; });
  var placar = { novos: 0, atualizados: 0, iguais: 0, ignorados: 0 };
  (linhas || []).forEach(function (bruta) {
    var r = limpo(bruta);
    if (!validar(r, lista)) { placar.ignorados++; return; }
    var agora = new Date().toISOString();
    r.id = r.id || Utilities.getUuid();
    r.atualizadoEm = r.atualizadoEm || agora;
    r.criadoEm = r.criadoEm || r.atualizadoEm;
    r.criadoPor = r.criadoPor || u.usuario;
    r.atualizadoPor = r.atualizadoPor || u.usuario;
    var atual = atuais[r.id];
    if (!atual) {
      escrever(aba('registros').getLastRow() + 1, r);
      atuais[r.id] = r;
      placar.novos++;
    } else if (r.atualizadoEm > atual.atualizadoEm) {
      escrever(linhaDoId(r.id), r);
      atuais[r.id] = r;
      placar.atualizados++;
    } else {
      placar.iguais++;
    }
  });
  return placar;
}
