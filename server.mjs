// Criador de Magias T20 — server Node puro (sem dependências).
// node server.mjs [--check] | PORT=8070
import http from "node:http";
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, copyFileSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { calcular } from "./static/custo.mjs";
import { esc, htmlParaTexto, ROTULOS } from "./static/carta.mjs";
import { tipoDePocao, tipoDePocaoDosEixos } from "./static/pocao.mjs";
import { eixosDe } from "./static/eixos.mjs";

// a magia da mesa vira a mesma linha técnica das oficiais, pra cair no mesmo parser
function eixosDaMesa(e = {}) {
  const r = e.resistencia;
  return eixosDe(ROTULOS.execucao[e.execucao], ROTULOS.alcance[e.alcance],
    !r || r === "nenhuma" ? "nenhuma" : `${e.teste || ""} ${ROTULOS.resistencia[r] || ""}`);
}

const RAIZ = dirname(fileURLToPath(import.meta.url));
const DADOS = join(RAIZ, "dados");
const ARQ = join(DADOS, "estado.json");
const TABELA = JSON.parse(readFileSync(join(RAIZ, "data", "tabela-custos.json")));
const PORT = Number(process.env.PORT || 8070);

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const MAX_MAGIAS = 200, MAX_BODY = 512 * 1024, MAX_NOME = 40;

function carregar() {
  let d;
  try { d = JSON.parse(readFileSync(ARQ, "utf-8")); }
  catch { d = { usuarios: {}, publicadas: {} }; }
  // migração: "Amanda" e "amanda" eram contas separadas -> mesclar por nome normalizado
  const u = {};
  for (const [k, magias] of Object.entries(d.usuarios || {})) {
    const nk = (k || "").trim().normalize("NFC").toLowerCase();
    u[nk] = u[nk] || [];
    for (const m of magias) if (!m.id || !u[nk].some((x) => x.id === m.id)) u[nk].push(m);
  }
  d.usuarios = u;
  return d;
}

const CHECK = process.argv.includes("--check");
let estado = CHECK ? { usuarios: {}, publicadas: {} } : carregar();

function salvar() {
  if (CHECK) return; // self-test não toca disco
  mkdirSync(DADOS, { recursive: true });
  const hoje = new Date().toISOString().slice(0, 10);
  const bk = join(DADOS, `backup-${hoje}.json`);
  if (existsSync(ARQ) && !existsSync(bk)) {
    copyFileSync(ARQ, bk);
    const bks = readdirSync(DADOS).filter((f) => f.startsWith("backup-")).sort();
    for (const velho of bks.slice(0, -7)) unlinkSync(join(DADOS, velho));
  }
  const tmp = ARQ + ".tmp";
  writeFileSync(tmp, JSON.stringify(estado));
  renameSync(tmp, ARQ); // escrita atômica
}

function nomeOk(n) {
  return typeof n === "string" && n.length >= 1 && n.length <= MAX_NOME && !/[\\/<>"]/.test(n);
}

// identidade: uma conta só, independente de maiúsculas ("Amanda" = "amanda" = "AMANDA")
const normNome = (n) => (n || "").trim().normalize("NFC").toLowerCase();
const mesmoDono = (a, b) => normNome(a) === normNome(b);

function validarMagia(m) {
  if (typeof m !== "object" || !m) return "magia inválida";
  if (!nomeOk(m.nome || "x")) return "nome inválido";
  if (JSON.stringify(m).length > 20_000) return "magia grande demais";
  if (![1, 2, 3, 4, 5].includes(m.circulo || 1)) return "círculo deve ser 1 a 5";
  try { m.pontos = { gasto: calcular(m, TABELA).total, orcamento: TABELA.orcamento[String(m.circulo || 1)] }; }
  catch { return "estrutura de eixos/efeitos inválida"; }
  return null;
}

function json(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(b);
}

function corpo(req) {
  return new Promise((ok, err) => {
    let b = "";
    req.on("data", (c) => { b += c; if (b.length > MAX_BODY) { err(new Error("grande")); req.destroy(); } });
    req.on("end", () => { try { ok(b ? JSON.parse(b) : {}); } catch { err(new Error("json")); } });
  });
}

function estatico(res, caminho) {
  try {
    const c = readFileSync(caminho);
    res.writeHead(200, { "content-type": MIME[extname(caminho)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(c);
  } catch { res.writeHead(404); res.end("404"); }
}

async function tratar(req, res) {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;

  if (p === "/api/state" && req.method === "GET") {
    const user = url.searchParams.get("user") || "";
    return json(res, 200, {
      minhas: estado.usuarios[normNome(user)] || [],
      publicadas: Object.entries(estado.publicadas).map(([id, m]) => ({ ...m, id })),
    });
  }

  if (p.startsWith("/api/user/") && req.method === "PUT") {
    const nome = decodeURIComponent(p.slice("/api/user/".length));
    if (!nomeOk(nome)) return json(res, 400, { erro: "nome inválido" });
    const chave = normNome(nome);
    let b;
    try { b = await corpo(req); } catch { return json(res, 400, { erro: "corpo inválido" }); }
    const magias = Array.isArray(b.magias) ? b.magias.slice(0, MAX_MAGIAS) : null;
    if (!magias) return json(res, 400, { erro: "esperado {magias:[...]}" });
    for (const m of magias) {
      const e = validarMagia(m);
      if (e) return json(res, 400, { erro: `${m?.nome || "?"}: ${e}` });
    }
    estado.usuarios[chave] = magias;
    // magia publicada É a mesma magia: editar a sua atualiza a publicada, apagar despublica
    const idsAgora = new Set(magias.map((m) => m.id).filter(Boolean));
    for (const [id, pub] of Object.entries(estado.publicadas)) {
      if (!mesmoDono(pub.autor, nome)) continue;
      if (!idsAgora.has(id)) delete estado.publicadas[id];
    }
    for (const m of magias) {
      const pub = m.id && estado.publicadas[m.id];
      if (pub && mesmoDono(pub.autor, nome)) estado.publicadas[m.id] = { ...m, autor: pub.autor, publicadaEm: pub.publicadaEm };
    }
    salvar();
    return json(res, 200, { ok: true, n: magias.length });
  }

  if (p === "/api/publicar" && req.method === "POST") {
    let b;
    try { b = await corpo(req); } catch { return json(res, 400, { erro: "corpo inválido" }); }
    const { autor, magia } = b;
    if (!nomeOk(autor)) return json(res, 400, { erro: "autor inválido" });
    const e = validarMagia(magia);
    if (e) return json(res, 400, { erro: e });
    const limiteAval = magia.pontos.orcamento + Math.max(1, Math.round(magia.pontos.orcamento * (TABELA.aval_mestre_pct ?? 0.15)));
    if (magia.pontos.gasto > limiteAval) return json(res, 400, { erro: "estourou além da margem do mestre — só rascunho" });
    const id = typeof magia.id === "string" && /^[a-f0-9]{6,16}$/.test(magia.id) ? magia.id : randomBytes(4).toString("hex");
    const jaTem = estado.publicadas[id];
    if (jaTem && !mesmoDono(jaTem.autor, autor)) return json(res, 403, { erro: "essa magia é de outra pessoa" });
    // mesmo id = mesma magia: republicar atualiza, nunca duplica
    estado.publicadas[id] = { ...magia, id, autor, publicadaEm: jaTem?.publicadaEm || new Date().toISOString() };
    salvar();
    return json(res, 200, { ok: true, id });
  }

  if (p === "/api/despublicar" && req.method === "POST") {
    let b;
    try { b = await corpo(req); } catch { return json(res, 400, { erro: "corpo inválido" }); }
    const m = estado.publicadas[b.id];
    if (!m) return json(res, 404, { erro: "não existe" });
    if (!mesmoDono(m.autor, b.autor)) return json(res, 403, { erro: "só o autor despublica" });
    delete estado.publicadas[b.id];
    salvar();
    return json(res, 200, { ok: true });
  }

  if (p.startsWith("/api/magia/") && req.method === "GET") {
    const m = estado.publicadas[p.slice("/api/magia/".length)];
    return m ? json(res, 200, m) : json(res, 404, { erro: "não existe" });
  }

  // textos oficiais (dados/textos.json fica FORA do repo; sem ele a rota devolve 404)
  if (p.startsWith("/api/texto/") && req.method === "GET") {
    const t = carregarTextos()[p.slice("/api/texto/".length).replace(/[^\w-]/g, "")];
    return t ? json(res, 200, t) : json(res, 404, { erro: "sem texto no servidor" });
  }

  // grimório: lista leve de todas as magias (oficiais + publicadas), com busca opcional.
  // Busca = toda palavra da consulta precisa bater (AND); cada palavra aceita sinônimos (OR)
  // e procura em nome, descrição, aprimoramentos e stats ("alcance longo", "vontade anula").
  if (p === "/api/grimorio" && req.method === "GET") {
    const textos = carregarTextos();
    const termos = termosBusca(url.searchParams.get("q"));
    const bate = (blob) => termos.every((alts) => alts.some((t) => blob.includes(t)));
    const oficiais = Object.entries(textos)
      .filter(([, t]) => bate(blobDe(t)))
      .map(([slug, t]) => ({ slug, nome: t.nome, escola: t.escola, grupo: t.grupo, circulo: t.circulo, pocao: tipoDePocao(t.stats?.["Alvo/Área"]),
        ...eixosDe(t.stats?.["Execução"], t.stats?.["Alcance"], t.stats?.["Resistência"]) }));
    const publicadas = Object.entries(estado.publicadas)
      .filter(([, m]) => bate(norm([m.nome, htmlParaTexto(m.descricao), m.escola, m.tipo, (m.aprimoramentos || []).map((a) => a.texto).join(" "), JSON.stringify(m.eixos || {})].join(" "))))
      .map(([id, m]) => ({ id, nome: m.nome, escola: m.escola, grupo: m.tipo, circulo: m.circulo || 1, autor: m.autor, pontos: m.pontos, pocao: tipoDePocaoDosEixos(m.eixos?.alvo),
        ...eixosDaMesa(m.eixos) }));
    return json(res, 200, { oficiais, publicadas });
  }

  // poderes oficiais: mesma busca do grimório, sobre dados/poderes.json (também fora do repo)
  if (p === "/api/poderes" && req.method === "GET") {
    const termos = termosBusca(url.searchParams.get("q"));
    const poderes = Object.entries(carregarPoderes())
      .filter(([, t]) => termos.every((alts) => alts.some((x) => blobDe(t).includes(x))))
      .map(([slug, t]) => ({ slug, nome: t.nome, categoria: t.categoria, sub: t.sub, livro: t.livro, custo: t.custo }));
    return json(res, 200, { poderes });
  }

  if (p.startsWith("/api/poder/") && req.method === "GET") {
    const t = carregarPoderes()[p.slice("/api/poder/".length).replace(/[^\w-]/g, "")];
    return t ? json(res, 200, t) : json(res, 404, { erro: "sem texto no servidor" });
  }

  if (p === "/grimorio") return estatico(res, join(RAIZ, "static", "grimorio.html"));

  // sugestões de aprimoramentos REAIS (busca sobre os 748 oficiais em dados/aprimoramentos.json)
  if (p === "/api/sugestoes-apr" && req.method === "POST") {
    if (!tratar.aprs) {
      try { tratar.aprs = JSON.parse(readFileSync(join(DADOS, "aprimoramentos.json"), "utf-8")); }
      catch { tratar.aprs = []; }
    }
    let f;
    try { f = await corpo(req); } catch { return json(res, 400, { erro: "corpo inválido" }); }
    return json(res, 200, { sugestoes: sugerirAprimoramentos(f, tratar.aprs) });
  }

  // /m/<id>, /o/<slug> e /d/<slug> (poder): mesmo grimório, com a carta já aberta na mesa
  // (o id vai pelo pathname); <title> e Open Graph trocados pra o link ficar bonito no WhatsApp/Discord
  if (p.startsWith("/m/") || p.startsWith("/o/") || p.startsWith("/d/")) {
    const m = p.startsWith("/m/") ? estado.publicadas[p.slice(3).replace(/[^a-f0-9]/g, "")]
      : p.startsWith("/d/") ? carregarPoderes()[p.slice(3).replace(/[^\w-]/g, "")]
      : carregarTextos()[p.slice(3).replace(/[^\w-]/g, "")];
    let html = readFileSync(join(RAIZ, "static", "grimorio.html"), "utf-8");
    if (m) {
      const linha = m.linha || `${m.escola} (${m.tipo}) — ${m.circulo || 1}º círculo`;
      const desc = (linha + ". " + htmlParaTexto(m.descricao || "")).replace(/\s+/g, " ").slice(0, 180);
      html = html.replace(/<title>.*<\/title>/, `<title>${esc(m.nome)} — Grimório T20</title>`)
        .replace('<meta name="description"', `<meta property="og:title" content="${esc(m.nome)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:site_name" content="Grimório T20"><meta name="description"`);
    }
    res.writeHead(m ? 200 : 404, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
    return res.end(html);
  }
  if (p === "/criar") return estatico(res, join(RAIZ, "static", "index.html"));
  if (p === "/") return estatico(res, join(RAIZ, "static", "grimorio.html"));
  if (p.startsWith("/data/")) return estatico(res, join(RAIZ, "data", p.slice(6).replace(/[^\w.-]/g, "")));
  return estatico(res, join(RAIZ, "static", p.slice(1).replace(/[^\w./-]/g, "").replace(/\.\./g, "")));
}

// ---- textos oficiais + busca do grimório ----
function carregarTextos() {
  if (!carregarTextos.cache) {
    try { carregarTextos.cache = JSON.parse(readFileSync(join(DADOS, "textos.json"), "utf-8")); }
    catch { carregarTextos.cache = {}; }
  }
  return carregarTextos.cache;
}
// poderes oficiais (dados/poderes.json, gerado por tools/minerar-poderes.mjs)
function carregarPoderes() {
  if (!carregarPoderes.cache) {
    try { carregarPoderes.cache = JSON.parse(readFileSync(join(DADOS, "poderes.json"), "utf-8")); }
    catch { carregarPoderes.cache = {}; }
  }
  return carregarPoderes.cache;
}
const norm = (x) => (x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// blob pesquisável por magia OU poder oficial, calculado uma vez (campo que falta entra vazio)
const blobs = new WeakMap();
function blobDe(t) {
  if (!blobs.has(t)) blobs.set(t, norm([t.nome, t.linha, t.escola, t.grupo, t.descricao,
    t.categoria, t.sub, t.livro, t.prereq,
    Object.entries(t.stats || {}).map(([k, v]) => `${k} ${v}`).join(" "),
    (t.aprimoramentos || []).map((a) => a.texto || a).join(" ")].join(" ")));
  return blobs.get(t);
}
// sinônimos: cada palavra da consulta vira um grupo de alternativas (qualquer uma serve)
const SINONIMOS = [
  ["fogo", "chama", "queima", "incendi", "ignea", "igneo"],
  ["frio", "gelo", "congel", "gelid"],
  ["eletricidade", "raio", "eletric", "relampago", "choque"],
  ["acido", "corro"],
  ["cura", "curar", "recupera pv", "recupera pontos de vida", "regenera"],
  ["medo", "amedrontado", "apavorado", "assust", "aterroriz"],
  ["veneno", "envenenado", "toxic"],
  ["ilusao", "ilusor", "imagem", "invisi"],
  ["voar", "voo", "levit", "deslocamento de voo"],
  ["luz", "ilumin", "brilh", "ofuscado", "cego"],
  ["escuridao", "trevas", "sombra"],
  ["morto", "morto-vivo", "mortos-vivos", "necro", "zumbi", "esqueleto"],
  ["invocar", "convoca", "conjura", "criatura convocada"],
  ["teleport", "teletransport", "deslocar", "viaj"],
  ["bonus", "+1", "+2", "+5", "recebe +"],
  ["dormir", "sono", "inconsciente", "adormec"],
  ["paralis", "imovel", "preso", "enredado", "agarrado"],
  ["escudo", "protecao", "proteg", "defesa", "abjur"],
  ["voz", "som", "sonico", "silenc", "surdo"],
  ["mental", "mente", "vontade", "encant", "fascinado", "enfeiticado"],
];
function termosBusca(q) {
  return norm(q).split(/\s+/).filter(Boolean).map((w) => {
    const grupo = SINONIMOS.find((g) => g.some((sin) => w.startsWith(sin) || sin.startsWith(w) && w.length >= 4));
    return grupo ? [...new Set([w, ...grupo])] : [w];
  });
}

// ---- ranking de aprimoramentos oficiais contra a magia do usuário ----
const semAcento = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tokens = (s) => new Set(semAcento(s).split(/[^a-z0-9d]+/).filter((t) => t.length > 3));

function pontuarApr(f, a) {
  const m = a.magia;
  let s = 0;
  const tem = (t) => a.deltas.includes(t);
  if (f.dano && tem("dano+")) { s += 3; if (m.dano_dados?.includes("d" + f.dano.faces)) s += 2; }
  if (f.cura && tem("cura+")) s += 4;
  if (f.alvoTipo === "alvos" && tem("alvos+")) s += 2;
  if (f.alvoTipo === "area" && tem("area->")) s += 2;
  if (f.alvoTipo === "alvos" && (f.dano || f.condicoes?.length) && tem("area->")) s += 1;
  if (f.alvoRestrito && /muda o alvo para/.test(semAcento(a.texto))) s += 3;
  if (tem("alcance->") && m.alcance === f.alcance) s += 3;
  if (tem("duracao->") && (f.duracao === "cena" || f.duracao === "1dia")) s += 1;
  if (tem("resistencia->") && f.resistencia && f.resistencia !== "nenhuma") s += 2;
  if (f.condicoes?.length && m.condicoes?.some((c) => f.condicoes.includes(c))) s += 3;
  if (f.escola === m.escola) s += 1;
  if (m.circulo === (f.circulo || 1)) s += 2;
  const tu = tokens(f.texto || "");
  const ta = tokens(a.texto + " " + m.nome);
  let overlap = 0;
  for (const t of tu) if (ta.has(t)) overlap += 0.5;
  s += Math.min(overlap, 3);
  return s;
}

function sugerirAprimoramentos(f, aprs) {
  const vistos = new Map(); // dedupe por texto normalizado
  for (const a of aprs) {
    if (a.pm == null && !a.truque) continue;
    if (a.restrito) continue; // "apenas devotos de X" não serve de sugestão geral
    const s = pontuarApr(f, a);
    if (s <= 2) continue;
    const chave = semAcento(a.texto).slice(0, 80);
    const v = vistos.get(chave);
    if (v) { v.n++; if (s > v.score) { v.score = s; v.pm = a.pm; v.fonte = a.magia.nome; } }
    else vistos.set(chave, { score: s, n: 1, pm: a.pm, truque: a.truque, texto: a.texto, fonte: a.magia.nome, circuloFonte: a.magia.circulo });
  }
  const lista = [...vistos.values()].sort((x, y) => y.score - x.score);
  const truques = lista.filter((x) => x.truque).slice(0, 2);
  const normais = lista.filter((x) => !x.truque).slice(0, 10);
  return [...normais, ...truques].map(({ score, ...resto }) => resto);
}

const server = http.createServer((req, res) => {
  tratar(req, res).catch((e) => { console.error(e); json(res, 500, { erro: "interno" }); });
});

if (CHECK) {
  server.listen(0, async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const falha = (msg) => { console.error("FALHOU:", msg); server.close(); process.exitCode = 1; };
    try {
      const magia = {
        nome: "Teste", circulo: 1,
        eixos: { execucao: "padrao", alcance: "curto", duracao: "instantanea", resistencia: "reduz-metade", alvo: { tipo: "alvos", qtd: 1 } },
        efeitos: { dano: { n: 2, faces: 6 } },
      };
      const put = await fetch(`${base}/api/user/ray`, { method: "PUT", body: JSON.stringify({ magias: [magia] }) });
      if (put.status !== 200) return falha("PUT " + put.status);
      const st = await (await fetch(`${base}/api/state?user=ray`)).json();
      if (st.minhas.length !== 1 || st.minhas[0].pontos.gasto !== 7) return falha("state: " + JSON.stringify(st.minhas[0]?.pontos));
      const pub = await (await fetch(`${base}/api/publicar`, { method: "POST", body: JSON.stringify({ autor: "ray", magia }) })).json();
      if (!pub.ok || !pub.id) return falha("publicar: " + JSON.stringify(pub));
      const m = await (await fetch(`${base}/api/magia/${pub.id}`)).json();
      if (m.nome !== "Teste") return falha("magia publicada errada");
      const ruim = await fetch(`${base}/api/user/ray`, { method: "PUT", body: JSON.stringify({ magias: [{ nome: "x", circulo: 7 }] }) });
      if (ruim.status !== 400) return falha("devia recusar círculo 7");
      // 3º círculo aceito (lista mantém a publicada pra não despublicar)
      const c3 = await fetch(`${base}/api/user/ray`, { method: "PUT", body: JSON.stringify({ magias: [{ ...magia, id: pub.id }, { ...magia, id: "abcd1234", nome: "Teste3", circulo: 3 }] }) });
      if (c3.status !== 200) return falha("devia aceitar 3º círculo: " + (await c3.json()).erro);
      // a lista do grimório diz se a magia vira item de uso único (alvo 1 criatura = poção)
      const gri = await (await fetch(`${base}/api/grimorio`)).json();
      const publicada = gri.publicadas.find((x) => x.id === pub.id);
      if (publicada?.pocao !== "poção") return falha("grimório não marcou a poção: " + publicada?.pocao);

      // poderes: contrato das rotas (sem dados/poderes.json a lista vem vazia, e tudo bem)
      const pod = await (await fetch(`${base}/api/poderes?q=furia`)).json();
      if (!Array.isArray(pod.poderes)) return falha("/api/poderes não devolveu lista");
      if (pod.poderes.length) {
        const um = pod.poderes[0];
        const det = await (await fetch(`${base}/api/poder/${um.slug}`)).json();
        if (det.nome !== um.nome || !det.descricao) return falha("/api/poder/<slug> incompleto");
        if ((await fetch(`${base}/d/${um.slug}`)).status !== 200) return falha("/d/<slug> fora");
        const nada = await (await fetch(`${base}/api/poderes?q=zzzznaoexiste`)).json();
        if (nada.poderes.length) return falha("busca de poder devia filtrar");
      }
      const idx = await fetch(`${base}/m/${pub.id}`);
      const pagina = await idx.text();
      if (idx.status !== 200 || !pagina.includes("g-pagina")) return falha("/m/ não serviu o grimório");
      if ((await fetch(`${base}/`)).status !== 200 || (await fetch(`${base}/criar`)).status !== 200) return falha("/ ou /criar fora");
      // republicar com o mesmo id NÃO duplica
      const pub2 = await (await fetch(`${base}/api/publicar`, { method: "POST", body: JSON.stringify({ autor: "ray", magia: { ...magia, id: pub.id } }) })).json();
      if (pub2.id !== pub.id) return falha("republicar mudou o id");
      const roubo = await fetch(`${base}/api/publicar`, { method: "POST", body: JSON.stringify({ autor: "ladrao", magia: { ...magia, id: pub.id } }) });
      if (roubo.status !== 403) return falha("deixou outro autor sobrescrever");
      // identidade case-insensitive: RAY é o mesmo dono que ray
      const mesmoCase = await fetch(`${base}/api/publicar`, { method: "POST", body: JSON.stringify({ autor: "RAY", magia: { ...magia, id: pub.id } }) });
      if (mesmoCase.status !== 200) return falha("RAY devia ser o mesmo dono que ray");
      const stCase = await (await fetch(`${base}/api/state?user=RaY`)).json();
      if (!stCase.minhas.length) return falha("state RaY devia ver as magias de ray");
      const desp = await fetch(`${base}/api/despublicar`, { method: "POST", body: JSON.stringify({ autor: "Ray", id: pub.id }) });
      if (desp.status !== 200) return falha("Ray devia despublicar a de ray");
      const despAlheio = await fetch(`${base}/api/publicar`, { method: "POST", body: JSON.stringify({ autor: "ray", magia: { ...magia, id: pub.id } }) });
      if (despAlheio.status !== 200) return falha("republicar após despublicar falhou");
      const roubo2 = await fetch(`${base}/api/despublicar`, { method: "POST", body: JSON.stringify({ autor: "Ladrao", id: pub.id }) });
      if (roubo2.status !== 403) return falha("Ladrao não podia despublicar a de ray");
      console.log("server.mjs --check OK");
      server.close();
    } catch (e) { falha(e.message); }
  });
} else {
  server.listen(PORT, () => console.log(`Criador de Magias T20 em http://localhost:${PORT}`));
}
