// Grimório: pesquisa e filtros sobre as oficiais + publicadas da mesa.
// Componente reutilizável: página / (grimório), gaveta lateral do criador.
// Clicar ou arrastar uma magia põe a carta na mesa (quadro.js), em qualquer página.
import { mesaGlobal, TIPO_ARRASTO } from "/quadro.js";

const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...filhos.filter((f) => f != null));
  return n;
};

const CIRCULOS = [1, 2, 3, 4, 5];
const TIPOS = ["Arcana", "Divina", "Universal"];
const ESCOLAS = ["Abjuração", "Adivinhação", "Convocação", "Encantamento", "Evocação", "Ilusão", "Necromancia", "Transmutação"];
const FONTES = [["oficiais", "📕 oficiais"], ["mesa", "🔗 da mesa"]];
export const chaveDe = (m) => m.fonte === "mesa" ? "p:" + m.id : "o:" + m.slug;

const ORDENS = [["circulo", "por círculo"], ["nome", "por nome"], ["escola", "por escola"]];
// filtros ⇄ URL (?q=fogo&c=1,2&t=Arcana&e=Evocação&f=mesa&ord=nome) — só na página do grimório
const URL_CHAVES = { circulo: "c", tipo: "t", escola: "e", fonte: "f" };

export function montarGrimorio(raiz, { qInicial = "", abrir = null, naUrl = false } = {}) {
  const mesa = mesaGlobal();
  // filtros multi-seleção (vazio = todos); Arcana e Divina são exclusivas entre si
  const filtro = { circulo: new Set(), tipo: new Set(), escola: new Set(), fonte: new Set(), q: qInicial, ord: "circulo" };
  if (naUrl) {
    const ps = new URLSearchParams(location.search);
    for (const [k, u] of Object.entries(URL_CHAVES))
      for (const v of (ps.get(u) || "").split(",").filter(Boolean)) filtro[k].add(k === "circulo" ? +v : v);
    if (ORDENS.some(([o]) => o === ps.get("ord"))) filtro.ord = ps.get("ord");
  }
  function gravarUrl() {
    if (!naUrl) return;
    const ps = new URLSearchParams();
    if (filtro.q.trim()) ps.set("q", filtro.q.trim());
    for (const [k, u] of Object.entries(URL_CHAVES)) if (filtro[k].size) ps.set(u, [...filtro[k]].join(","));
    if (filtro.ord !== "circulo") ps.set("ord", filtro.ord);
    history.replaceState(null, "", location.pathname + (ps.size ? "?" + ps : ""));
  }
  let TUDO = { oficiais: [], publicadas: [] };
  let buscaTimer;

  const busca = el("input", {
    type: "search", className: "g-busca", value: qInicial, autocomplete: "off",
    placeholder: "pesquisar por nome ou texto… (fogo, medo, cura)",
    oninput: (e) => { filtro.q = e.target.value; clearTimeout(buscaTimer); buscaTimer = setTimeout(buscar, 300); },
  });
  const boxFiltros = el("div", { className: "g-filtros" });
  const conta = el("div", { className: "explica" });
  const ordem = el("select", { className: "g-ordem", title: "ordenar", onchange: (e) => { filtro.ord = e.target.value; render(); } },
    ...ORDENS.map(([v, t]) => el("option", { value: v, textContent: t, selected: v === filtro.ord })));
  const lista = el("div", { className: "grimorio-lista" });
  raiz.append(busca, boxFiltros, el("div", { className: "g-conta-linha" }, conta, ordem), lista);

  const EXCLUSIVOS = { Arcana: "Divina", Divina: "Arcana" }; // não se misturam
  function chips(itens, chave, rotulo = (x) => String(x)) {
    const box = el("div", { className: "chips" });
    const botoes = new Map();
    for (const item of itens) {
      const valor = Array.isArray(item) ? item[0] : item;
      const b = el("button", {
        type: "button", className: "chip",
        textContent: Array.isArray(item) ? item[1] : rotulo(item),
        onclick: () => {
          const sel = filtro[chave];
          if (sel.has(valor)) sel.delete(valor);
          else {
            const oposto = chave === "tipo" && EXCLUSIVOS[valor];
            if (oposto && sel.has(oposto)) { sel.delete(oposto); botoes.get(oposto).classList.remove("on"); }
            sel.add(valor);
          }
          b.classList.toggle("on", sel.has(valor));
          render();
        },
      });
      botoes.set(valor, b);
      b.classList.toggle("on", filtro[chave].has(valor));
      box.append(b);
    }
    boxFiltros.append(box);
  }
  chips(CIRCULOS, "circulo", (c) => `${c}º`);
  chips(TIPOS, "tipo");
  chips(ESCOLAS, "escola");
  chips(FONTES, "fonte");

  async function buscar() {
    const q = filtro.q.trim();
    gravarUrl();
    try {
      TUDO = await (await fetch("/api/grimorio" + (q ? `?q=${encodeURIComponent(q)}` : ""))).json();
    } catch { TUDO = { oficiais: [], publicadas: [] }; }
    render();
  }

  const passa = (m, fonte) =>
    (!filtro.circulo.size || filtro.circulo.has(m.circulo)) &&
    (!filtro.tipo.size || filtro.tipo.has(m.grupo)) &&
    (!filtro.escola.size || filtro.escola.has(m.escola)) &&
    (!filtro.fonte.size || filtro.fonte.has(fonte));

  function render() {
    lista.replaceChildren();
    const itens = [
      ...TUDO.publicadas.filter((m) => passa(m, "mesa")).map((m) => ({ ...m, fonte: "mesa" })),
      ...TUDO.oficiais.filter((m) => passa(m, "oficiais")).map((m) => ({ ...m, fonte: "oficiais" })),
    ];
    const ord = filtro.ord;
    itens.sort((a, b) => ord === "circulo" ? a.circulo - b.circulo || a.nome.localeCompare(b.nome)
      : ord === "escola" ? a.escola.localeCompare(b.escola) || a.circulo - b.circulo || a.nome.localeCompare(b.nome)
      : a.nome.localeCompare(b.nome));
    gravarUrl();

    conta.textContent = `${itens.length} magia${itens.length === 1 ? "" : "s"}`
      + (TUDO.publicadas.length ? ` · ${itens.filter((m) => m.fonte === "mesa").length} da mesa` : "")
      + " · clique ou arraste pra pôr na mesa";

    if (!itens.length) return lista.append(el("div", { className: "vazio", textContent: "nenhuma magia com esses filtros." }));
    let grupo = null;
    for (const m of itens) {
      // cabeçalho por grupo (círculo ou escola), só quando faz sentido pra ordem escolhida
      const g = ord === "circulo" ? `${m.circulo}º círculo` : ord === "escola" ? m.escola : null;
      if (g !== null && g !== grupo) { grupo = g; lista.append(el("h2", { className: "g-grupo", textContent: g })); }
      const chave = chaveDe(m);
      lista.append(el("div", {
        className: "card" + (m.fonte === "mesa" ? " card-mesa" : ""),
        draggable: true, title: "clique ou arraste pra pôr na mesa",
        onclick: () => mesa.abrir(chave),
        ondragstart: (e) => { e.dataTransfer.setData(TIPO_ARRASTO, chave); e.dataTransfer.effectAllowed = "copy"; },
      },
        el("span", { className: "circ", textContent: `${m.circulo}º` }),
        el("h3", { textContent: m.nome }),
        el("div", { className: "meta", textContent: `${m.escola} · ${m.grupo}` + (m.autor ? ` · por ${m.autor}` : "") }),
      ));
    }
  }

  buscar().then(() => {
    if (abrir) {
      const m = [...TUDO.publicadas.map((x) => ({ ...x, fonte: "mesa" })), ...TUDO.oficiais.map((x) => ({ ...x, fonte: "oficiais" }))]
        .find((x) => x.nome === abrir);
      if (m) mesa.abrir(chaveDe(m));
    }
  });
  return { buscar, busca };
}

// bootstrap automático da página / (container #g-pagina); /m/<id> abre a publicada na mesa
const pagina = document.querySelector("#g-pagina");
if (pagina) {
  const params = new URLSearchParams(location.search);
  const g = montarGrimorio(pagina, { qInicial: params.get("q") || "", abrir: params.get("abrir"), naUrl: true });
  const idM = location.pathname.match(/^\/m\/([a-f0-9]+)/)?.[1];
  if (idM) mesaGlobal().abrir("p:" + idM);
  const slugO = location.pathname.match(/^\/o\/([\w-]+)/)?.[1];
  if (slugO) mesaGlobal().abrir("o:" + slugO);
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !e.target.closest("input, textarea, [contenteditable]")) { e.preventDefault(); g.busca.focus(); g.busca.select(); }
  });
}
