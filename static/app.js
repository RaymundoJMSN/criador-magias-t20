// Criador de Magias T20 — UI. Vanilla, sem build.
import { calcular, sugerirPm, circuloEfetivo } from "/custo.mjs";

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...filhos);
  return n;
};

let TABELA, TARIFAS, EXEMPLOS;
let magia = novaMagia();
let user = localStorage.getItem("cm_user") || "";
let minhas = [];
let salvarTimer;

const ROTULOS = {
  execucao: { padrao: "padrão", movimento: "movimento", livre: "livre", reacao: "reação", completa: "completa", longa: "ritual (1+ rodada)" },
  alcance: { pessoal: "pessoal", toque: "toque", curto: "curto (9m)", medio: "médio (30m)", longo: "longo (90m)", ilimitado: "ilimitado" },
  duracao: { instantanea: "instantânea", "1rodada": "1 rodada", sustentada: "sustentada", cena: "cena", "1dia": "1 dia", permanente: "permanente" },
  resistencia: { nenhuma: "nenhuma", desacredita: "desacredita", "reduz-metade": "reduz à metade", parcial: "parcial", anula: "anula", especial: "especial" },
};
const TESTES = ["Fortitude", "Reflexos", "Vontade"];

const MODELOS_APR = [
  ["dano+:1d6", "+1d6 de dano", "aumenta o dano em +1d6."],
  ["dano+:1d8", "+1d8 de dano", "aumenta o dano em +1d8."],
  ["alvos+:1", "+1 alvo", "aumenta o número de alvos em +1."],
  ["alcance->:curto", "alcance → curto", "muda o alcance para curto."],
  ["alcance->:medio", "alcance → médio", "muda o alcance para médio."],
  ["area->", "vira área / aumenta área", "muda o alvo para uma área (ou aumenta a área)."],
  ["bonus+:1", "+1 no bônus", "aumenta o bônus em +1."],
  ["duracao->:permanente", "duração → permanente", "muda a duração para permanente."],
  ["resistencia->:reflexos", "resistência → outro teste", "muda a resistência para outro teste."],
  ["efeito-novo", "efeito novo (descreva)", ""],
  ["truque", "truque (versão fraca, 0 PM)", ""],
];

function novaMagia() {
  return {
    nome: "", tipo: "Arcana", escola: "Evocação", circulo: 1, descricao: "",
    eixos: { execucao: "padrao", alcance: "curto", duracao: "instantanea", resistencia: "nenhuma", teste: "Reflexos", alvo: { tipo: "alvos", qtd: 1 } },
    efeitos: {},
    aprimoramentos: [],
    criadaEm: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- bootstrap
async function boot() {
  [TABELA, TARIFAS, EXEMPLOS] = await Promise.all(
    ["/data/tabela-custos.json", "/data/tarifas-pm.json", "/data/exemplos.json"].map((u) => fetch(u).then((r) => r.json()))
  );
  montarSelects();
  montarCondicoes();
  montarModelosApr();
  ligarEventos();

  const rascunho = localStorage.getItem("cm_rascunho");
  if (rascunho) try { magia = { ...novaMagia(), ...JSON.parse(rascunho) }; } catch {}
  preencherForm();

  if (user) entrou();
  render();

  const mView = location.pathname.match(/^\/m\/(\w+)/);
  if (mView) verPublicada(mView[1]);
  abrirAba("minhas");
}

function montarSelects() {
  for (const [eixo, rot] of Object.entries(ROTULOS)) {
    const sel = $(`#e-${eixo}`);
    const precos = TABELA.eixos[eixo];
    for (const [chave, nome] of Object.entries(rot)) {
      if (!(chave in precos)) continue;
      if (eixo === "resistencia" && chave === "especial") continue;
      const p = precos[chave];
      sel.append(el("option", { value: chave, textContent: `${nome}  (${p > 0 ? "+" + p : p})` }));
    }
    sel.value = magia.eixos[eixo] ?? Object.keys(rot)[0];
  }
  // teste de resistência (Fort/Ref/Von) vive dentro do rótulo da carta
  const selRes = $("#e-resistencia");
  selRes.insertAdjacentElement("afterend", el("select", { id: "e-teste" },
    ...TESTES.map((t) => el("option", { textContent: t }))));
}

function montarCondicoes() {
  const box = $("#cond-campos");
  for (const [tier, lista] of Object.entries(TABELA.efeitos.condicoes_tier)) {
    for (const c of lista) {
      box.append(el("button", {
        type: "button", className: "chip",
        innerHTML: `${c} <span class="tier">t${tier}·${TABELA.efeitos.condicao_custo_por_tier[tier]}pt</span>`,
        onclick: (ev) => { ev.currentTarget.classList.toggle("on"); lerForm(); },
      }));
      box.lastChild.dataset.cond = c;
    }
  }
}

function montarModelosApr() {
  const sel = $("#apr-modelo");
  for (const [chave, nome] of MODELOS_APR) sel.append(el("option", { value: chave, textContent: nome }));
}

// ---------------------------------------------------------------- form <-> estado
function lerForm() {
  magia.nome = $("#m-nome").value.trim();
  magia.tipo = $("#m-tipo").value;
  magia.escola = $("#m-escola").value;
  magia.descricao = $("#m-desc").value;
  for (const eixo of ["execucao", "alcance", "duracao", "resistencia"]) magia.eixos[eixo] = $(`#e-${eixo}`).value;
  magia.eixos.teste = $("#e-teste").value;

  const tipoAlvo = $("#e-alvo-tipo").value;
  $("#wrap-qtd").hidden = tipoAlvo !== "alvos";
  $("#wrap-area").hidden = tipoAlvo !== "area";
  if (tipoAlvo === "pessoal") magia.eixos.alvo = { tipo: "pessoal" };
  else if (tipoAlvo === "area") magia.eixos.alvo = { tipo: "area", tamanho: $("#e-area").value };
  else {
    const q = $("#e-alvo-qtd").value;
    magia.eixos.alvo = { tipo: "alvos", qtd: q === "escolhidas" ? "escolhidas" : Number(q) };
  }

  magia.efeitos = {};
  $("#dano-campos").hidden = !$("#f-dano").checked;
  if ($("#f-dano").checked) magia.efeitos.dano = { n: +$("#dano-n").value, faces: +$("#dano-faces").value, fixo: +$("#dano-fixo").value, tipo: $("#dano-tipo").value };
  $("#cura-campos").hidden = !$("#f-cura").checked;
  if ($("#f-cura").checked) magia.efeitos.cura = { n: +$("#cura-n").value, faces: +$("#cura-faces").value, fixo: +$("#cura-fixo").value };
  $("#bonus-campos").hidden = !$("#f-bonus").checked;
  if ($("#f-bonus").checked) { magia.efeitos.bonus = +$("#bonus-val").value; magia.efeitos.bonusEm = $("#bonus-em").value; }
  $("#cond-campos").hidden = !$("#f-cond").checked;
  if ($("#f-cond").checked) {
    magia.efeitos.condicoes = [...document.querySelectorAll(".chip.on")].map((c) => c.dataset.cond);
    if (!magia.efeitos.condicoes.length) delete magia.efeitos.condicoes;
  }
  $("#custom-campos").hidden = !$("#f-custom").checked;
  if ($("#f-custom").checked) magia.efeitos.custom = { texto: $("#custom-texto").value, pontos: +$("#custom-pontos").value };

  localStorage.setItem("cm_rascunho", JSON.stringify(magia));
  render();
}

function preencherForm() {
  $("#m-nome").value = magia.nome;
  $("#m-tipo").value = magia.tipo;
  $("#m-escola").value = magia.escola;
  $("#m-desc").value = magia.descricao || "";
  for (const eixo of ["execucao", "alcance", "duracao", "resistencia"]) $(`#e-${eixo}`).value = magia.eixos[eixo];
  $("#e-teste").value = magia.eixos.teste || "Reflexos";
  const a = magia.eixos.alvo;
  $("#e-alvo-tipo").value = a.tipo;
  if (a.tipo === "alvos") $("#e-alvo-qtd").value = String(a.qtd);
  if (a.tipo === "area") $("#e-area").value = a.tamanho || "p";
  $("#f-dano").checked = !!magia.efeitos.dano;
  if (magia.efeitos.dano) { $("#dano-n").value = magia.efeitos.dano.n; $("#dano-faces").value = magia.efeitos.dano.faces; $("#dano-fixo").value = magia.efeitos.dano.fixo || 0; $("#dano-tipo").value = magia.efeitos.dano.tipo || "fogo"; }
  $("#f-cura").checked = !!magia.efeitos.cura;
  if (magia.efeitos.cura) { $("#cura-n").value = magia.efeitos.cura.n; $("#cura-faces").value = magia.efeitos.cura.faces; $("#cura-fixo").value = magia.efeitos.cura.fixo || 0; }
  $("#f-bonus").checked = !!magia.efeitos.bonus;
  if (magia.efeitos.bonus) { $("#bonus-val").value = magia.efeitos.bonus; $("#bonus-em").value = magia.efeitos.bonusEm || ""; }
  $("#f-cond").checked = !!magia.efeitos.condicoes?.length;
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", !!magia.efeitos.condicoes?.includes(c.dataset.cond)));
  $("#f-custom").checked = !!magia.efeitos.custom;
  if (magia.efeitos.custom) { $("#custom-texto").value = magia.efeitos.custom.texto || ""; $("#custom-pontos").value = magia.efeitos.custom.pontos || 0; }
  renderAprimoramentos();
  lerForm();
}

// ---------------------------------------------------------------- aprimoramentos
function renderAprimoramentos() {
  const box = $("#lista-apr");
  box.replaceChildren();
  magia.aprimoramentos.forEach((ap, i) => {
    const sug = sugerirPm(ap.chave || "efeito-novo", TARIFAS, 1);
    const fora = sug && !sug.generico && Math.abs((ap.pm || 0) - sug.pm) > 1;
    const item = el("div", { className: "apr-item" },
      el("input", { className: "pm", type: "number", min: 0, max: 15, value: ap.pm ?? sug?.pm ?? 1, onchange: (e) => { ap.pm = +e.target.value; lerForm(); renderAprimoramentos(); } }),
      el("span", {}, "PM"),
      el("textarea", { rows: 1, maxLength: 500, value: ap.texto, placeholder: "efeito do aprimoramento…", oninput: (e) => { ap.texto = e.target.value; localStorage.setItem("cm_rascunho", JSON.stringify(magia)); } }),
      el("span", { className: "sug" + (fora ? " fora" : "") },
        sug ? (sug.generico ? `efeito novo: oficiais cobram ~${sug.pm} PM` : `oficiais: ~${sug.pm} PM (${sug.n}×)`) : ""),
      el("button", { className: "bt mini", textContent: "×", onclick: () => { magia.aprimoramentos.splice(i, 1); renderAprimoramentos(); lerForm(); } }),
    );
    box.append(item);
  });
}

function addAprimoramento() {
  const chave = $("#apr-modelo").value;
  const modelo = MODELOS_APR.find(([c]) => c === chave);
  const sug = sugerirPm(chave, TARIFAS, 1);
  magia.aprimoramentos.push({
    chave, texto: modelo[2],
    pm: chave === "truque" ? 0 : (sug?.pm ?? 1),
    truque: chave === "truque",
  });
  renderAprimoramentos();
  lerForm();
}

// ---------------------------------------------------------------- render
function render() {
  const r = calcular(magia, TABELA);
  const pct = Math.min(100, (Math.max(0, r.total) / r.orcamento) * 100);
  $("#medidor-fill").style.width = pct + "%";
  $("#medidor-txt").textContent = `${r.total} / ${r.orcamento} pontos`;
  $(".medidor").classList.toggle("estourou", !r.valido);
  $("#avisos").replaceChildren(...r.avisos.map((a) => el("div", { textContent: a })));
  $("#partes").replaceChildren(...Object.entries(r.partes).filter(([, v]) => v !== 0)
    .map(([k, v]) => el("li", { textContent: `${k}: ${v > 0 ? "+" + v : v}` })));
  $("#carta").innerHTML = cartaHtml(magia, r);
  return r;
}

function textoAlvo(m) {
  const a = m.eixos.alvo;
  if (a.tipo === "pessoal") return "você";
  if (a.tipo === "area") return { p: "área pequena (cone 6m/esfera 3m)", m: "área média (cone 9m/esfera 6m)", g: "área grande (esfera 9m+)" }[a.tamanho || "p"];
  return a.qtd === "escolhidas" ? "criaturas escolhidas" : `${a.qtd} criatura${a.qtd > 1 ? "s" : ""}`;
}

function textoResistencia(m) {
  const r = m.eixos.resistencia;
  if (r === "nenhuma") return "nenhuma";
  return `${m.eixos.teste} ${ROTULOS.resistencia[r]}`;
}

function esc(s) { return (s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])); }

function cartaHtml(m, r) {
  const ef = [];
  if (m.efeitos.dano) ef.push(`<b>${m.efeitos.dano.n}d${m.efeitos.dano.faces}${m.efeitos.dano.fixo ? "+" + m.efeitos.dano.fixo : ""}</b> de dano de ${m.efeitos.dano.tipo}`);
  if (m.efeitos.cura) ef.push(`cura <b>${m.efeitos.cura.n}d${m.efeitos.cura.faces}${m.efeitos.cura.fixo ? "+" + m.efeitos.cura.fixo : ""}</b> PV`);
  if (m.efeitos.bonus) ef.push(`<b>+${m.efeitos.bonus}</b> em ${esc(m.efeitos.bonusEm) || "…"}`);
  if (m.efeitos.condicoes?.length) ef.push(`condição: <b>${m.efeitos.condicoes.join(", ")}</b>`);
  if (m.efeitos.custom?.texto) ef.push(esc(m.efeitos.custom.texto));
  const aprs = m.aprimoramentos.filter((a) => a.texto).map((a) =>
    `<div><b>${a.truque ? "Truque" : "+" + a.pm + " PM"}:</b> ${esc(a.texto)}${!a.truque && circuloEfetivo(1 + a.pm) > 1 ? ` <i>(requer ${circuloEfetivo(1 + a.pm)}º círculo)</i>` : ""}</div>`).join("");
  return `
    <h2>${esc(m.nome) || "Sem Nome"}</h2>
    <div class="tipo-linha">${m.escola} · ${m.tipo} · 1º círculo</div>
    <div class="stats">
      <b>Execução:</b> ${ROTULOS.execucao[m.eixos.execucao]}; <b>Alcance:</b> ${ROTULOS.alcance[m.eixos.alcance].replace(/ \(.+\)/, "")};
      <b>Alvo:</b> ${textoAlvo(m)}; <b>Duração:</b> ${ROTULOS.duracao[m.eixos.duracao]};
      <b>Resistência:</b> ${textoResistencia(m)}
    </div>
    ${m.descricao ? `<div class="desc">${esc(m.descricao)}</div>` : ""}
    ${ef.length ? `<div class="efeitos-num">${ef.join("; ")}.</div>` : ""}
    ${aprs ? `<div class="apr">${aprs}</div>` : ""}
    <div class="assina">${r.total}/${r.orcamento} pontos${r.valido ? "" : " — ESTOUROU"} ${m.autor ? " · por " + esc(m.autor) : ""}</div>`;
}

function textoPlano(m, r) {
  const linhas = [
    `${(m.nome || "Sem Nome").toUpperCase()} (${m.escola} ${m.tipo} 1)`,
    `Execução: ${ROTULOS.execucao[m.eixos.execucao]}; Alcance: ${ROTULOS.alcance[m.eixos.alcance].replace(/ \(.+\)/, "")}; Alvo: ${textoAlvo(m)}; Duração: ${ROTULOS.duracao[m.eixos.duracao]}; Resistência: ${textoResistencia(m)}`,
  ];
  if (m.descricao) linhas.push(m.descricao);
  const c = $("#carta").querySelector(".efeitos-num");
  if (c) linhas.push(c.textContent);
  for (const a of m.aprimoramentos.filter((a) => a.texto)) linhas.push(`${a.truque ? "Truque" : "+" + a.pm + " PM"}: ${a.texto}`);
  linhas.push(`[${r.total}/${r.orcamento} pontos — criador-magias-t20]`);
  return linhas.join("\n");
}

// ---------------------------------------------------------------- login + sync
function entrou() {
  $("#nome-user").hidden = $("#bt-entrar").hidden = true;
  $("#quem").hidden = false;
  $("#quem-nome").textContent = user;
  sincronizar();
}

async function sincronizar() {
  try {
    const st = await (await fetch(`/api/state?user=${encodeURIComponent(user)}`)).json();
    minhas = st.minhas;
    window.__publicadas = st.publicadas;
    abrirAba(abaAtiva);
  } catch {}
}

async function salvarServidor() {
  if (!user) { aviso("entre com seu nome pra salvar no servidor", true); return; }
  const r = render();
  const i = minhas.findIndex((x) => x.criadaEm === magia.criadaEm);
  if (i >= 0) minhas[i] = magia; else minhas.push(magia);
  const resp = await fetch(`/api/user/${encodeURIComponent(user)}`, { method: "PUT", body: JSON.stringify({ magias: minhas }) });
  const j = await resp.json();
  if (j.ok) aviso(`salvo (${r.total}/${r.orcamento} pts)`);
  else aviso(j.erro || "erro ao salvar", true);
  abrirAba(abaAtiva);
}

function aviso(t, erro) {
  const m = $("#msg");
  m.textContent = t;
  m.className = erro ? "erro" : "";
  clearTimeout(salvarTimer);
  salvarTimer = setTimeout(() => (m.textContent = ""), 4000);
}

// ---------------------------------------------------------------- galeria
let abaAtiva = "minhas";
function abrirAba(aba) {
  abaAtiva = aba;
  document.querySelectorAll(".aba").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === aba));
  const g = $("#galeria");
  g.replaceChildren();
  const add = (props, ...kids) => g.append(el("div", { className: "card", ...props }, ...kids));

  if (aba === "minhas") {
    if (!minhas.length) return g.append(el("div", { className: "vazio", textContent: user ? "nenhuma magia salva ainda" : "entre com seu nome pra ver suas magias" }));
    for (const m of minhas) {
      const r = calcular(m, TABELA);
      add({ onclick: () => { magia = m; preencherForm(); scrollTo({ top: 0, behavior: "smooth" }); } },
        el("h3", { textContent: m.nome || "Sem Nome" }),
        el("span", { className: "custo", textContent: `${r.total}pt` }),
        el("div", { className: "meta", textContent: `${m.escola} · ${m.tipo}` }),
        el("div", { className: "acoes-card" },
          el("button", { className: "bt mini", textContent: "apagar", onclick: (ev) => { ev.stopPropagation(); minhas = minhas.filter((x) => x !== m); salvarLista(); } })));
    }
  } else if (aba === "publicadas") {
    const pubs = window.__publicadas || [];
    if (!pubs.length) return g.append(el("div", { className: "vazio", textContent: "ninguém publicou nada ainda" }));
    for (const m of pubs) {
      add({ onclick: () => { location.href = `/m/${m.id}`; } },
        el("h3", { textContent: m.nome }),
        el("span", { className: "custo", textContent: `${m.pontos?.gasto}pt` }),
        el("div", { className: "meta", textContent: `${m.escola} · por ${m.autor}` }));
    }
  } else {
    for (const ex of EXEMPLOS.utilitarias) {
      add({ onclick: () => usarReferencia(ex) },
        el("h3", { textContent: ex.nome }),
        el("span", { className: "custo", textContent: `efeito ≈ ${ex.preco_efeito}pt` }),
        el("div", { className: "meta", textContent: `${ex.escola} · ${ex.grupo} · efeito custom de referência` }));
    }
  }
}

function usarReferencia(ex) {
  $("#f-custom").checked = true;
  $("#custom-campos").hidden = false;
  $("#custom-pontos").value = ex.preco_efeito;
  $("#custom-texto").value = `(efeito no estilo de ${ex.nome} — descreva a sua versão)`;
  lerForm();
  scrollTo({ top: 0, behavior: "smooth" });
}

async function salvarLista() {
  if (!user) return;
  await fetch(`/api/user/${encodeURIComponent(user)}`, { method: "PUT", body: JSON.stringify({ magias: minhas }) });
  abrirAba("minhas");
}

async function publicar() {
  if (!user) return aviso("entre com seu nome primeiro", true);
  const r = render();
  if (!r.valido) return aviso("estourou o orçamento — ajuste antes de publicar", true);
  if (!magia.nome) return aviso("dê um nome à magia", true);
  const j = await (await fetch("/api/publicar", { method: "POST", body: JSON.stringify({ autor: user, magia }) })).json();
  if (j.ok) {
    const url = `${location.origin}/m/${j.id}`;
    navigator.clipboard?.writeText(url);
    aviso(`publicada! link copiado: ${url}`);
    sincronizar();
  } else aviso(j.erro, true);
}

async function verPublicada(id) {
  const m = await (await fetch(`/api/magia/${id}`)).json();
  if (m.erro) return;
  magia = { ...novaMagia(), ...m };
  preencherForm();
}

// ---------------------------------------------------------------- eventos
function ligarEventos() {
  $("#builder").addEventListener("input", lerForm);
  $("#builder").addEventListener("change", lerForm);
  $("#bt-add-apr").onclick = addAprimoramento;
  $("#bt-salvar").onclick = salvarServidor;
  $("#bt-publicar").onclick = publicar;
  $("#bt-novo").onclick = () => { magia = novaMagia(); preencherForm(); };
  $("#bt-copiar").onclick = () => { navigator.clipboard.writeText(textoPlano(magia, calcular(magia, TABELA))); aviso("texto copiado"); };
  $("#bt-galeria").onclick = (e) => { e.preventDefault(); abrirAba("exemplos"); $("#galeria").scrollIntoView({ behavior: "smooth" }); };
  $("#bt-entrar").onclick = () => { const n = $("#nome-user").value.trim(); if (n) { user = n; localStorage.setItem("cm_user", n); entrou(); } };
  $("#bt-sair").onclick = () => { user = ""; localStorage.removeItem("cm_user"); location.reload(); };
  document.querySelectorAll(".aba").forEach((b) => (b.onclick = () => abrirAba(b.dataset.aba)));
}

boot();
