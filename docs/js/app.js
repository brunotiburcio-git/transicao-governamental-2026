// Coleta de informações da Transição Governamental 2026.
// A página conversa com o servidor do Google (apps_script/Codigo.gs), que guarda os dados numa planilha
// e confere login e perfil a cada pedido. Aqui, os perfis só decidem quais botões aparecem.
(function () {
  "use strict";

  var AJUDA = {
    "Proposta de governo": "Resumo da proposta de governo sob responsabilidade do órgão.",
    "Balanço de programa": "Detalhamento quantitativo e desafios do programa para o próximo governo.",
    "Ponto de Alerta": "Descrição sucinta do porquê este é um ponto sensível.",
    "Colegiado": "Descrição sucinta, incluindo objetivo e competência resumida do colegiado."
  };
  var COLEGIADO = "Colegiado";
  var NOVO = "__novo__";
  var MAX_DESCRICAO = 2000;
  var AGUARDANDO = "Aguardando preenchimento", SALVO = "Salvo", ENVIADO = "Enviado para validação",
      VALIDADO = "Validado", DEVOLVIDO = "Devolvido para revisão";
  var CLASSE_STATUS = {};
  CLASSE_STATUS[AGUARDANDO] = "s-aguardando";
  CLASSE_STATUS[SALVO] = "s-salvo";
  CLASSE_STATUS[ENVIADO] = "s-enviado";
  CLASSE_STATUS[VALIDADO] = "s-validado";
  CLASSE_STATUS[DEVOLVIDO] = "s-devolvido";
  var SESSAO = "tg2026:sessao";
  var COLUNAS = [
    ["id", "id"], ["Responsável", "unidade"], ["Tipo", "tipo"], ["Título", "titulo"], ["Status", "status"],
    ["Descrição", "descricao"], ["Ato de criação", "ato"], ["Observação", "observacao"],
    ["Criado por", "criadoPor"], ["Criado em", "criadoEm"],
    ["Atualizado por", "atualizadoPor"], ["Atualizado em", "atualizadoEm"]
  ];

  var listas = { tipos: [], unidades: [], titulos: [], status: [] };  // abas opc_* da planilha
  var registros = [];
  var token = "";
  var conta = null;    // {usuario, nome, perfil}
  var filtroTipo = "";
  var filtroUnidade = "";
  var filtroStatus = "";
  var editandoId = null;
  var detalheId = null;

  function $(id) { return document.getElementById(id); }

  function el(tag, props, filhos) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { n[k] = props[k]; });
    (filhos || []).forEach(function (f) { n.append(f); });
    return n;
  }

  function avisar(texto) { $("mensagem").textContent = texto; }

  function normal(s) {
    return String(s).toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  }

  function dataHora(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function opcoes(campo, primeira, valores) {
    campo.replaceChildren(el("option", { value: "", textContent: primeira }), ...valores.map(function (v) {
      return el("option", { value: v, textContent: v });
    }));
  }

  function podeCadastrar() { return conta.perfil === "admin" || conta.perfil === "cadastrador"; }
  function podeAlterar(r) {
    if (conta.perfil === "admin") return true;
    return conta.perfil === "cadastrador" && r.criadoPor === conta.usuario && (r.status === SALVO || r.status === DEVOLVIDO);
  }
  function podeEnviar(r) { return podeAlterar(r) && (r.status === SALVO || r.status === DEVOLVIDO); }
  function ehAnalista() { return conta.perfil === "admin" || conta.perfil === "validador"; }
  function podeValidar(r) { return ehAnalista() && r.status === ENVIADO; }
  function podeDevolver(r) { return ehAnalista() && (r.status === ENVIADO || r.status === VALIDADO); }

  // ---------- comunicação com o servidor ----------
  async function api(acao, dados) {
    if (!window.API_URL) throw new Error("O sistema ainda não foi configurado (js/config.js).");
    var resposta;
    try {
      // texto simples: o Google não aceita a consulta prévia que outros formatos exigiriam
      var r = await fetch(window.API_URL, { method: "POST", body: JSON.stringify(Object.assign({ acao: acao, token: token }, dados)) });
      resposta = await r.json();
    } catch (e) {
      throw new Error("Sem resposta do servidor. Verifique a conexão e tente de novo.");
    }
    if (!resposta.ok) {
      if (resposta.sessao) voltarAoLogin();
      throw new Error(resposta.erro);
    }
    return resposta;
  }

  function voltarAoLogin() {
    try { sessionStorage.removeItem(SESSAO); } catch (e) { /* nada a limpar */ }
    token = "";
    conta = null;
    if ($("janela").open) $("janela").close();
    if ($("detalhe").open) $("detalhe").close();
    $("sistema").hidden = true;
    mostrarArea("itens");
    $("entrada").hidden = false;
    $("login-erro").textContent = "Sua sessão terminou. Entre novamente.";
  }

  // Trava os botões enquanto o pedido vai ao servidor.
  async function ocupado(botoes, funcao) {
    botoes.forEach(function (b) { b.disabled = true; });
    try {
      return await funcao();
    } finally {
      botoes.forEach(function (b) { b.disabled = false; });
    }
  }

  // ---------- entrada ----------
  function iniciar(r) {
    token = r.token || token;
    conta = r.usuario;
    listas = r.listas;
    registros = r.registros;
    try { sessionStorage.setItem(SESSAO, token); } catch (e) { /* o F5 pedirá novo login */ }
    $("novo").hidden = !podeCadastrar();
    $("exportar-xlsx").hidden = $("exportar-csv").hidden = conta.perfil === "consulta";
    $("importar").hidden = conta.perfil !== "admin";
    opcoes($("filtro-unidade"), "Todas", listas.unidades);
    opcoes($("campo-unidade"), "Selecione...", listas.unidades);
    opcoes($("campo-tipo"), "Selecione...", listas.tipos);
    desenharMaterial();
    $("usuario-nome").textContent = conta.nome + " (" + conta.perfil + ")";
    $("login-erro").textContent = "";
    $("entrada").hidden = true;
    $("sistema").hidden = false;
    desenhar();
  }

  async function sair() {
    try { await api("sair"); } catch (e) { /* a sessão termina sozinha */ }
    try { sessionStorage.removeItem(SESSAO); } catch (e) { /* nada a limpar */ }
    location.reload();
  }

  async function atualizar() {
    try {
      var r = await ocupado([$("atualizar")], function () { return api("listar"); });
      registros = r.registros;
      avisar("Lista atualizada.");
      desenhar();
    } catch (e) {
      if (conta) avisar(e.message);
    }
  }

  // ---------- lista ----------
  // títulos previstos em opc_titulo para o tipo e, quando informada, a unidade
  function titulosPrevistos(tipo, unidade) {
    return listas.titulos.filter(function (t) { return t.tipo === tipo && (!unidade || t.unidade === unidade); });
  }

  function titulosUsados(tipo, unidade) {
    return new Set(registros.filter(function (r) {
      return r.tipo === tipo && (!unidade || r.unidade === unidade);
    }).map(function (r) { return r.titulo; }));
  }

  function desenharFiltros() {
    var daUnidade = registros.filter(function (r) { return !filtroUnidade || r.unidade === filtroUnidade; });
    var campo = $("filtro-tipo");
    campo.replaceChildren(el("option", { value: "", textContent: "Todos (" + daUnidade.length + ")" }), ...listas.tipos.map(function (tipo) {
      var previstos = titulosPrevistos(tipo, filtroUnidade);
      var feitos = previstos.filter(function (p) { return titulosUsados(tipo, p.unidade).has(p.titulo); }).length;
      return el("option", { value: tipo, textContent: tipo + " (" + feitos + " de " + previstos.length + ")" });
    }));
    campo.value = filtroTipo;
  }

  function textoAto(ato) {
    if (!/^https?:\/\/\S+$/i.test(ato)) return ato;
    return el("a", { href: ato, target: "_blank", rel: "noopener noreferrer", textContent: ato });
  }

  function etiqueta(status) {
    var info = listas.status.find(function (s) { return s.nome === status; });
    return el("span", { className: "status " + (CLASSE_STATUS[status] || ""), textContent: status, title: info ? info.descricao : "" });
  }

  // Todos os itens: os registros e os títulos previstos que ainda não foram preenchidos.
  function todosItens() {
    var feitos = new Set(registros.map(function (r) { return r.unidade + "|" + r.tipo + "|" + r.titulo; }));
    var pendentes = listas.titulos.filter(function (t) {
      return !feitos.has(t.unidade + "|" + t.tipo + "|" + t.titulo);
    }).map(function (t) {
      return { pendente: true, unidade: t.unidade, tipo: t.tipo, titulo: t.titulo, status: AGUARDANDO, descricao: "", ato: "", observacao: "" };
    });
    var ordenados = registros.slice().sort(function (a, b) { return String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)); });
    return ordenados.concat(pendentes);
  }

  function linha(r) {
    var descricao = [el("div", { className: "resumo", textContent: r.descricao })];
    if (r.ato) descricao.push(el("div", { className: "ato" }, ["Ato de criação: ", textoAto(r.ato)]));
    if (r.observacao) descricao.push(el("div", { className: "ato", textContent: "Observação: " + r.observacao }));
    var abrirItem = function () { if (r.pendente) { if (podeCadastrar()) abrirFormulario(null, r); } else abrirDetalhe(r.id); };
    var abrir = el("button", { type: "button", className: "abrir-detalhe", textContent: r.titulo });
    abrir.addEventListener("click", abrirItem);

    var acao = null;
    if (r.pendente && podeCadastrar()) acao = "Preencher";
    else if (!r.pendente && podeValidar(r)) acao = "Analisar";
    else if (!r.pendente && podeAlterar(r)) acao = "Editar";
    var botoes = [];
    if (acao) {
      var b = el("button", { type: "button", className: "discreto", textContent: acao });
      b.setAttribute("aria-label", acao + " " + r.titulo);
      b.addEventListener("click", function () {
        if (acao === "Editar") abrirFormulario(r.id); else abrirItem();
      });
      botoes = [b];
    }
    var tr = el("tr", { className: r.pendente ? "pendente" : "" }, [
      el("td", { className: "unidade", textContent: r.unidade || "" }),
      el("td", { className: "tipo", textContent: r.tipo }),
      el("td", { className: "titulo" }, [
        abrir,
        el("span", { className: "tipo-pequeno" }, [r.tipo, el("br"), etiqueta(r.status)])
      ]),
      el("td", { className: "coluna-status" }, [etiqueta(r.status)]),
      el("td", { className: "descricao" }, descricao),
      el("td", { className: "atualizado" }, r.pendente ? [] : [dataHora(r.atualizadoEm), el("br"), r.atualizadoPor || ""]),
      el("td", { className: "botoes-linha" }, botoes)
    ]);
    tr.addEventListener("click", function (ev) {
      if (!ev.target.closest("button, a")) abrirItem();
    });
    return tr;
  }

  // Mostra o registro inteiro: a tabela corta a descrição, e no celular esconde algumas colunas.
  function abrirDetalhe(id) {
    var r = registros.find(function (x) { return x.id === id; });
    if (!r) return;
    detalheId = id;
    var campos = [["Status", etiqueta(r.status)], ["Responsável", r.unidade], ["Tipo", r.tipo], ["Descrição", r.descricao]];
    if (r.ato) campos.push(["Ato de criação", textoAto(r.ato)]);
    if (r.observacao) campos.push(["Observação da validação", r.observacao]);
    campos.push(["Criado", dataHora(r.criadoEm) + " por " + r.criadoPor]);
    campos.push(["Atualizado", dataHora(r.atualizadoEm) + " por " + r.atualizadoPor]);
    var filhos = [];
    campos.forEach(function (c) {
      filhos.push(el("dt", { textContent: c[0] }), el("dd", {}, [c[1] || ""]));
    });
    $("detalhe-titulo").textContent = r.titulo;
    $("detalhe-campos").replaceChildren(...filhos);
    $("detalhe-erro").textContent = "";
    $("detalhe-observacao").value = "";
    $("bloco-analise").hidden = !podeDevolver(r);
    $("detalhe-editar").hidden = $("detalhe-excluir").hidden = !podeAlterar(r);
    $("detalhe-enviar").hidden = !podeEnviar(r);
    $("detalhe-validar").hidden = !podeValidar(r);
    $("detalhe-devolver").hidden = !podeDevolver(r);
    $("detalhe").showModal();
  }

  async function mudarStatus(acao, botao) {
    var observacao = $("detalhe-observacao").value.trim();
    if (acao === "devolver" && !observacao) {
      $("detalhe-erro").textContent = "Explique o motivo da devolução.";
      return;
    }
    $("detalhe-erro").textContent = "Gravando...";
    try {
      var r = await ocupado([botao], function () { return api(acao, { id: detalheId, observacao: observacao }); });
      registros = r.registros;
      $("detalhe").close();
      avisar(acao === "enviar" ? "Enviado para validação." : acao === "validar" ? "Registro validado." : "Devolvido para revisão.");
      desenhar();
    } catch (e) {
      if (conta) $("detalhe-erro").textContent = e.message;
    }
  }

  // ---------- material de apoio ----------
  function mostrarArea(area) {
    $("area-itens").hidden = area !== "itens";
    $("area-material").hidden = area !== "material";
    $("aba-itens").setAttribute("aria-pressed", String(area === "itens"));
    $("aba-material").setAttribute("aria-pressed", String(area === "material"));
  }

  function tamanho(bytes) {
    if (bytes >= 1048576) return (bytes / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB";
    return Math.max(1, Math.round(bytes / 1024)).toLocaleString("pt-BR") + " KB";
  }

  function desenharMaterial() {
    var arquivos = window.MATERIAL || [];
    $("linhas-material").replaceChildren(...arquivos.map(function (a) {
      var href = "material_apoio/" + encodeURIComponent(a.nome);
      return el("tr", {}, [
        el("td", {}, [el("a", { className: "material-nome", href: href, target: "_blank", rel: "noopener", textContent: a.nome })]),
        el("td", { textContent: tamanho(a.tamanho) }),
        el("td", { textContent: new Date(a.data + "T12:00:00").toLocaleDateString("pt-BR") }),
        el("td", { className: "baixar" }, [el("a", { href: href, download: a.nome, textContent: "Baixar" })])
      ]);
    }));
    $("tabela-material").hidden = !arquivos.length;
    $("vazio-material").hidden = !!arquivos.length;
  }

  function desenharStatus(base) {
    var campo = $("filtro-status");
    campo.replaceChildren(el("option", { value: "", textContent: "Todos (" + base.length + ")" }), ...listas.status.map(function (s) {
      var n = base.filter(function (i) { return i.status === s.nome; }).length;
      return el("option", { value: s.nome, textContent: s.nome + " (" + n + ")" });
    }));
    campo.value = filtroStatus;
  }

  function desenhar() {
    var busca = normal($("busca").value);
    var base = todosItens().filter(function (r) {
      return (!filtroTipo || r.tipo === filtroTipo) && (!filtroUnidade || r.unidade === filtroUnidade) &&
             (!busca || normal(r.titulo + " " + r.descricao + " " + r.ato).includes(busca));
    });
    var visiveis = base.filter(function (r) { return !filtroStatus || r.status === filtroStatus; });

    desenharFiltros();
    desenharStatus(base);
    $("linhas").replaceChildren(...visiveis.map(linha));
    $("tabela").hidden = !visiveis.length;
    $("vazio").hidden = !!visiveis.length;
    $("vazio").textContent = "Nenhum item com esse filtro.";
  }

  // ---------- formulário ----------
  // A lista de títulos depende da unidade e do tipo, conforme a aba opc_titulo.
  function preencherTitulos(selecionado) {
    var unidade = $("campo-unidade").value, tipo = $("campo-tipo").value, campo = $("campo-titulo");
    if (!unidade || !tipo) {
      opcoes(campo, "Selecione a unidade e o tipo", []);
      atualizarNovoTitulo();
      return;
    }
    var usados = titulosUsados(tipo, unidade);
    var previstos = titulosPrevistos(tipo, unidade).map(function (t) { return t.titulo; });
    var novos = Array.from(usados).filter(function (t) { return previstos.indexOf(t) < 0; }).sort();
    var opcao = function (t) { return el("option", { value: t, textContent: (usados.has(t) ? "✓ " : "") + t }); };
    var filhos = [el("option", { value: "", textContent: "Selecione..." })].concat(previstos.map(opcao));
    if (novos.length) filhos.push(el("optgroup", { label: "Títulos incluídos pelos usuários" }, novos.map(opcao)));
    filhos.push(el("option", { value: NOVO, textContent: "+ Incluir novo título..." }));
    campo.replaceChildren(...filhos);
    campo.value = selecionado || "";
    atualizarNovoTitulo();
  }

  function atualizarContador() {
    var n = $("campo-descricao").value.length;
    $("descricao-contador").textContent = n.toLocaleString("pt-BR") + " de " + MAX_DESCRICAO.toLocaleString("pt-BR") + " caracteres";
  }

  function atualizarNovoTitulo() {
    $("bloco-novo-titulo").hidden = $("campo-titulo").value !== NOVO;
  }

  function atualizarTipo() {
    var tipo = $("campo-tipo").value;
    $("tipo-ajuda").textContent = AJUDA[tipo] || "";
    $("bloco-ato").hidden = tipo !== COLEGIADO;
  }

  // Sem id, abre um registro novo; "pendente" já traz unidade, tipo e título do item escolhido na tabela.
  function abrirFormulario(id, pendente) {
    var r = id ? registros.find(function (x) { return x.id === id; }) : null;
    var base = r || pendente;
    editandoId = r ? r.id : null;
    $("form-erro").textContent = "";
    $("janela-titulo").textContent = r ? "Editar registro" : "Novo registro";
    $("campo-unidade").value = base ? (base.unidade || "") : filtroUnidade;
    $("campo-tipo").value = base ? base.tipo : filtroTipo;
    preencherTitulos(base ? base.titulo : "");
    $("campo-novo-titulo").value = "";
    $("campo-descricao").value = r ? r.descricao : "";
    $("campo-ato").value = r ? r.ato : "";
    atualizarContador();
    atualizarTipo();
    $("janela").showModal();
  }

  function tituloEscolhido(tipo, unidade) {
    var v = $("campo-titulo").value;
    if (v !== NOVO) return v;
    var novo = $("campo-novo-titulo").value.trim();
    // título igual a um já existente (sem contar maiúsculas e acentos) usa a grafia que já está na lista
    var existentes = titulosPrevistos(tipo, unidade).map(function (t) { return t.titulo; })
      .concat(Array.from(titulosUsados(tipo, unidade)));
    return existentes.find(function (t) { return normal(t) === normal(novo); }) || novo;
  }

  async function salvar(enviar) {
    var tipo = $("campo-tipo").value;
    var unidade = $("campo-unidade").value;
    var titulo = tituloEscolhido(tipo, unidade);
    var descricao = $("campo-descricao").value.trim();
    if (!unidade || !tipo || !titulo || !descricao) {
      $("form-erro").textContent = "Preencha responsável, tipo, título e descrição.";
      return;
    }
    if (descricao.length > MAX_DESCRICAO) {
      $("form-erro").textContent = "A descrição deve ter no máximo 2.000 caracteres.";
      return;
    }
    var registro = {
      id: editandoId || "", unidade: unidade, tipo: tipo, titulo: titulo, descricao: descricao,
      ato: tipo === COLEGIADO ? $("campo-ato").value.trim() : ""
    };
    $("form-erro").textContent = "Salvando...";
    try {
      var r = await ocupado([$("salvar"), $("salvar-enviar"), $("cancelar")], function () {
        return api("salvar", { registro: registro, enviar: enviar });
      });
      registros = r.registros;
      $("janela").close();
      avisar(enviar ? "Salvo e enviado para validação." : "Registro salvo.");
      desenhar();
    } catch (e) {
      $("form-erro").textContent = e.message;
    }
  }

  async function remover(id, botao) {
    var r = registros.find(function (x) { return x.id === id; });
    if (!r || !confirm('Excluir o registro "' + r.titulo + '"?')) return;
    try {
      avisar("Excluindo...");
      var resposta = await ocupado([botao], function () { return api("excluir", { id: id }); });
      registros = resposta.registros;
      if ($("detalhe").open) $("detalhe").close();
      avisar("Registro excluído.");
      desenhar();
    } catch (e) {
      if (conta) avisar(e.message);
    }
  }

  // ---------- exportação e importação ----------
  function nomeArquivo(ext) {
    return "transicao-2026-registros-" + new Date().toISOString().slice(0, 10) + "." + ext;
  }

  function exportarXlsx() {
    var linhas = registros.map(function (r) {
      var o = {};
      COLUNAS.forEach(function (c) { o[c[0]] = r[c[1]] || ""; });
      return o;
    });
    var ws = XLSX.utils.json_to_sheet(linhas, { header: COLUNAS.map(function (c) { return c[0]; }) });
    ws["!cols"] = [{ wch: 38 }, { wch: 14 }, { wch: 22 }, { wch: 45 }, { wch: 70 }, { wch: 30 }, { wch: 22 }, { wch: 24 }, { wch: 22 }, { wch: 24 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "registros");
    XLSX.writeFile(wb, nomeArquivo("xlsx"));
  }

  function celulaCsv(v) {
    var s = String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;  // o Excel não trata o texto como fórmula
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function exportarCsv() {
    var linhas = [COLUNAS.map(function (c) { return celulaCsv(c[0]); }).join(";")];
    registros.forEach(function (r) {
      linhas.push(COLUNAS.map(function (c) { return celulaCsv(r[c[1]] || ""); }).join(";"));
    });
    var blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = el("a", { href: URL.createObjectURL(blob), download: nomeArquivo("csv") });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Lê as planilhas aqui e manda as linhas ao servidor, que confere e junta pelo id.
  async function importar(arquivos) {
    var linhas = [];
    var falhas = [];
    for (var i = 0; i < arquivos.length; i++) {
      try {
        var wb = XLSX.read(await arquivos[i].arrayBuffer(), { type: "array" });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var cabecalho = XLSX.utils.sheet_to_json(ws, { header: 1 })[0] || [];
        if (cabecalho.indexOf("Tipo") < 0) throw new Error("planilha sem a coluna Tipo");
        XLSX.utils.sheet_to_json(ws, { defval: "" }).forEach(function (l) {
          var r = {};
          COLUNAS.forEach(function (c) { r[c[1]] = String(l[c[0]] === undefined ? "" : l[c[0]]); });
          linhas.push(r);
        });
      } catch (e) {
        falhas.push(arquivos[i].name);
      }
    }
    var fim = falhas.length ? " Não foi possível ler: " + falhas.join(", ") + "." : "";
    if (!linhas.length) { avisar("Nenhuma linha para importar." + fim); return; }
    try {
      avisar("Importando...");
      var r = await ocupado([$("importar")], function () { return api("importar", { linhas: linhas }); });
      var p = r.placar;
      registros = r.registros;
      avisar(p.novos + " novo(s), " + p.atualizados + " atualizado(s), " + p.iguais + " sem alteração, " + p.ignorados + " ignorado(s)." + fim);
      desenhar();
    } catch (e) {
      if (conta) avisar(e.message);
    }
  }

  // ---------- início ----------
  function ligarEventos() {
    $("form-entrada").addEventListener("submit", async function (ev) {
      ev.preventDefault();
      $("login-erro").textContent = "Entrando...";
      try {
        var r = await ocupado([$("login-entrar")], function () {
          return api("entrar", { usuario: $("login-usuario").value, senha: $("login-senha").value });
        });
        iniciar(r);
      } catch (e) {
        $("login-erro").textContent = e.message;
      }
    });

    $("sair").addEventListener("click", sair);
    $("novo").addEventListener("click", function () { abrirFormulario(null); });
    $("atualizar").addEventListener("click", atualizar);
    $("cancelar").addEventListener("click", function () { $("janela").close(); });
    $("detalhe-fechar").addEventListener("click", function () { $("detalhe").close(); });
    $("detalhe-editar").addEventListener("click", function () {
      $("detalhe").close();
      abrirFormulario(detalheId);
    });
    $("detalhe-excluir").addEventListener("click", function () { remover(detalheId, this); });
    $("form-registro").addEventListener("submit", function (ev) { ev.preventDefault(); salvar(false); });
    $("salvar-enviar").addEventListener("click", function () { salvar(true); });
    $("detalhe-enviar").addEventListener("click", function () { mudarStatus("enviar", this); });
    $("detalhe-validar").addEventListener("click", function () { mudarStatus("validar", this); });
    $("detalhe-devolver").addEventListener("click", function () { mudarStatus("devolver", this); });
    $("aba-itens").addEventListener("click", function () { mostrarArea("itens"); });
    $("aba-material").addEventListener("click", function () { mostrarArea("material"); });
    $("campo-unidade").addEventListener("change", function () { preencherTitulos(""); });
    $("campo-tipo").addEventListener("change", function () {
      preencherTitulos("");
      atualizarTipo();
    });
    $("filtro-unidade").addEventListener("change", function () { filtroUnidade = this.value; desenhar(); });
    $("filtro-tipo").addEventListener("change", function () { filtroTipo = this.value; desenhar(); });
    $("filtro-status").addEventListener("change", function () { filtroStatus = this.value; desenhar(); });
    $("campo-descricao").addEventListener("input", atualizarContador);
    $("campo-titulo").addEventListener("change", function () {
      atualizarNovoTitulo();
      if ($("campo-titulo").value === NOVO) $("campo-novo-titulo").focus();
    });
    $("busca").addEventListener("input", desenhar);
    $("exportar-xlsx").addEventListener("click", exportarXlsx);
    $("exportar-csv").addEventListener("click", exportarCsv);
    $("importar").addEventListener("click", function () { $("arquivo").click(); });
    $("arquivo").addEventListener("change", async function () {
      await importar(Array.from(this.files));
      this.value = "";
    });
  }

  async function comecar() {
    ligarEventos();
    var salvo = null;
    try { salvo = sessionStorage.getItem(SESSAO); } catch (e) { /* sem sessão */ }
    if (salvo) {
      token = salvo;
      try {
        iniciar(await api("listar"));
        return;
      } catch (e) {
        token = "";
      }
    }
    $("login-erro").textContent = "";
    $("entrada").hidden = false;
  }

  comecar();
})();
