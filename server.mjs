// Criador de Magias T20 — server Node puro (sem dependências).
// node server.mjs [--check] | PORT=8070
import http from "node:http";
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, copyFileSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { calcular } from "./static/custo.mjs";
import { cartaHtml, esc } from "./static/carta.mjs";

const RAIZ = dirname(fileURLToPath(import.meta.url));
const DADOS = join(RAIZ, "dados");
const ARQ = join(DADOS, "estado.json");
const TABELA = JSON.parse(readFileSync(join(RAIZ, "data", "tabela-custos.json")));
const PORT = Number(process.env.PORT || 8070);

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const MAX_MAGIAS = 200, MAX_BODY = 512 * 1024, MAX_NOME = 40;

function carregar() {
  try { return JSON.parse(readFileSync(ARQ, "utf-8")); }
  catch { return { usuarios: {}, publicadas: {} }; }
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
      minhas: estado.usuarios[user] || [],
      publicadas: Object.entries(estado.publicadas).map(([id, m]) => ({ ...m, id })),
    });
  }

  if (p.startsWith("/api/user/") && req.method === "PUT") {
    const nome = decodeURIComponent(p.slice("/api/user/".length));
    if (!nomeOk(nome)) return json(res, 400, { erro: "nome inválido" });
    let b;
    try { b = await corpo(req); } catch { return json(res, 400, { erro: "corpo inválido" }); }
    const magias = Array.isArray(b.magias) ? b.magias.slice(0, MAX_MAGIAS) : null;
    if (!magias) return json(res, 400, { erro: "esperado {magias:[...]}" });
    for (const m of magias) {
      const e = validarMagia(m);
      if (e) return json(res, 400, { erro: `${m?.nome || "?"}: ${e}` });
    }
    estado.usuarios[nome] = magias;
    // magia publicada É a mesma magia: editar a sua atualiza a publicada, apagar despublica
    const idsAgora = new Set(magias.map((m) => m.id).filter(Boolean));
    for (const [id, pub] of Object.entries(estado.publicadas)) {
      if (pub.autor !== nome) continue;
      if (!idsAgora.has(id)) delete estado.publicadas[id];
    }
    for (const m of magias) {
      const pub = m.id && estado.publicadas[m.id];
      if (pub && pub.autor === nome) estado.publicadas[m.id] = { ...m, autor: nome, publicadaEm: pub.publicadaEm };
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
    if (jaTem && jaTem.autor !== autor) return json(res, 403, { erro: "essa magia é de outra pessoa" });
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
    if (m.autor !== b.autor) return json(res, 403, { erro: "só o autor despublica" });
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
    if (!tratar.textos) {
      try { tratar.textos = JSON.parse(readFileSync(join(DADOS, "textos.json"), "utf-8")); }
      catch { tratar.textos = {}; }
    }
    const t = tratar.textos[p.slice("/api/texto/".length).replace(/[^\w-]/g, "")];
    return t ? json(res, 200, t) : json(res, 404, { erro: "sem texto no servidor" });
  }

  // grimório: lista leve de todas as magias (oficiais + publicadas), com busca opcional no texto
  if (p === "/api/grimorio" && req.method === "GET") {
    if (!tratar.textos) {
      try { tratar.textos = JSON.parse(readFileSync(join(DADOS, "textos.json"), "utf-8")); }
      catch { tratar.textos = {}; }
    }
    const q = (url.searchParams.get("q") || "").toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "");
    const norm = (x) => (x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const bate = (t) => !q || norm(t.nome).includes(q) || norm(t.descricao).includes(q) ||
      (t.aprimoramentos || []).some((a) => norm(a.texto || a).includes(q));
    const oficiais = Object.entries(tratar.textos)
      .filter(([, t]) => bate(t))
      .map(([slug, t]) => ({ slug, nome: t.nome, escola: t.escola, grupo: t.grupo, circulo: t.circulo }));
    const publicadas = Object.entries(estado.publicadas)
      .filter(([, m]) => bate({ nome: m.nome, descricao: m.descricao, aprimoramentos: (m.aprimoramentos || []).map((a) => a.texto) }))
      .map(([id, m]) => ({ id, nome: m.nome, escola: m.escola, grupo: m.tipo, circulo: m.circulo || 1, autor: m.autor, pontos: m.pontos }));
    return json(res, 200, { oficiais, publicadas });
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

  if (p.startsWith("/m/")) {
    const m = estado.publicadas[p.slice(3).replace(/[^a-f0-9]/g, "")];
    const corpoHtml = m
      ? `<article class="carta">${cartaHtml(m, { total: m.pontos?.gasto ?? "?", orcamento: m.pontos?.orcamento ?? 10, valido: true })}</article>`
      : `<p class="nao-achei">Essa magia não existe mais — pode ter sido despublicada.</p>`;
    const pagina = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${m ? esc(m.nome) : "Magia não encontrada"} — Criador de Magias T20</title>
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🕯️</text></svg>">
<style>body{padding:20px}
.view-grid{max-width:1150px;margin:0 auto;display:grid;grid-template-columns:1.1fr .9fr;gap:22px;align-items:start}
@media (max-width:900px){.view-grid{grid-template-columns:1fr}}
.col-magia{display:flex;flex-direction:column;align-items:center}
.carta{max-width:640px;width:100%}.nao-achei{color:#a8977c;font-style:italic}
.rodape-view{margin-top:22px;font-size:.85rem;color:#a8977c;text-align:center}.rodape-view a{color:#c9a227}
.painel-grimorio h2{font-family:Cinzel,serif;color:#c9a227;font-size:1.05rem;margin:0 0 8px;letter-spacing:.05em}</style>
</head><body><div class="brasa" aria-hidden="true"></div>
<div class="view-grid">
  <div class="col-magia">${corpoHtml}
    <div class="rodape-view"><a href="/">✦ crie a sua magia</a> · <a href="/grimorio">📖 grimório completo</a></div>
  </div>
  <aside class="painel painel-grimorio">
    <h2>📖 Pesquisar outras magias</h2>
    <div id="g-view"></div>
  </aside>
</div>
<script type="module">
  import { montarGrimorio } from "/grimorio.js";
  montarGrimorio(document.querySelector("#g-view"), { compacto: true });
</script>
</body></html>`;
    res.writeHead(m ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    return res.end(pagina);
  }
  if (p === "/") return estatico(res, join(RAIZ, "static", "index.html"));
  if (p.startsWith("/data/")) return estatico(res, join(RAIZ, "data", p.slice(6).replace(/[^\w.-]/g, "")));
  return estatico(res, join(RAIZ, "static", p.slice(1).replace(/[^\w./-]/g, "").replace(/\.\./g, "")));
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
      const idx = await fetch(`${base}/m/${pub.id}`);
      const pagina = await idx.text();
      if (idx.status !== 200 || !pagina.includes("Teste")) return falha("/m/ não rendeu a magia");
      // republicar com o mesmo id NÃO duplica
      const pub2 = await (await fetch(`${base}/api/publicar`, { method: "POST", body: JSON.stringify({ autor: "ray", magia: { ...magia, id: pub.id } }) })).json();
      if (pub2.id !== pub.id) return falha("republicar mudou o id");
      const roubo = await fetch(`${base}/api/publicar`, { method: "POST", body: JSON.stringify({ autor: "ladrao", magia: { ...magia, id: pub.id } }) });
      if (roubo.status !== 403) return falha("deixou outro autor sobrescrever");
      console.log("server.mjs --check OK");
      server.close();
    } catch (e) { falha(e.message); }
  });
} else {
  server.listen(PORT, () => console.log(`Criador de Magias T20 em http://localhost:${PORT}`));
}
