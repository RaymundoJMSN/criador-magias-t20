// Grimório: pesquisa e filtros sobre as oficiais + publicadas da mesa.
// Componente reutilizável: página /grimorio, gaveta lateral do criador e painel do /m/.
import { cartaHtml, cartaOficialHtml } from "/carta.mjs";

const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...filhos.filter((f) => f != null));
  return n;
};

const CIRCULOS = [1, 2, 3, 4, 5];
const TIPOS = ["Arcana", "Divina", "Universal"];
const ESCOLAS = ["Abjuração", "Adivinhação", "Convocação", "Encantamento", "Evocação", "Ilusão", "Necromancia", "Transmutação"];
const FONTES = [["oficiais", "📕 oficiais"], ["mesa", "🔗 da mesa"]];

export function montarGrimorio(raiz, { compacto = false, qInicial = "", abrir = null, aoEscolher = null } = {}) {
  const filtro = { circulo: null, tipo: null, escola: null, fonte: null, q: qInicial };
  let TUDO = { oficiais: [], publicadas: [] };
  let buscaTimer;

  const busca = el("input", {
    type: "search", className: "g-busca", value: qInicial, autocomplete: "off",
    placeholder: "pesquisar por nome ou texto… (fogo, medo, cura)",
    oninput: (e) => { filtro.q = e.target.value; clearTimeout(buscaTimer); buscaTimer = setTimeout(buscar, 300); },
  });
  const boxFiltros = el("div", { className: "g-filtros" });
  const conta = el("div", { className: "explica" });
  const lista = el("div", { className: "grimorio-lista" });
  raiz.append(busca, boxFiltros, conta, lista);

  function chips(itens, chave, rotulo = (x) => String(x)) {
    const box = el("div", { className: "chips" });
    for (const item of itens) {
      const valor = Array.isArray(item) ? item[0] : item;
      box.append(el("button", {
        type: "button", className: "chip",
        textContent: Array.isArray(item) ? item[1] : rotulo(item),
        onclick: (e) => {
          filtro[chave] = filtro[chave] === valor ? null : valor;
          box.querySelectorAll(".chip").forEach((c) => c.classList.remove("on"));
          if (filtro[chave] !== null) e.currentTarget.classList.add("on");
          render();
        },
      }));
    }
    boxFiltros.append(box);
  }
  chips(CIRCULOS, "circulo", (c) => `${c}º`);
  chips(TIPOS, "tipo");
  if (!compacto) chips(ESCOLAS, "escola");
  chips(FONTES, "fonte");

  async function buscar() {
    const q = filtro.q.trim();
    try {
      TUDO = await (await fetch("/api/grimorio" + (q ? `?q=${encodeURIComponent(q)}` : ""))).json();
    } catch { TUDO = { oficiais: [], publicadas: [] }; }
    render();
  }

  const passa = (m, fonte) =>
    (!filtro.circulo || m.circulo === filtro.circulo) &&
    (!filtro.tipo || m.grupo === filtro.tipo) &&
    (!filtro.escola || m.escola === filtro.escola) &&
    (!filtro.fonte || filtro.fonte === fonte);

  function render() {
    lista.replaceChildren();
    const itens = [
      ...TUDO.publicadas.filter((m) => passa(m, "mesa")).map((m) => ({ ...m, fonte: "mesa" })),
      ...TUDO.oficiais.filter((m) => passa(m, "oficiais")).map((m) => ({ ...m, fonte: "oficiais" })),
    ].sort((a, b) => a.circulo - b.circulo || a.nome.localeCompare(b.nome));

    conta.textContent = `${itens.length} magia${itens.length === 1 ? "" : "s"}`
      + (TUDO.publicadas.length ? ` · ${itens.filter((m) => m.fonte === "mesa").length} da mesa` : "");

    if (!itens.length) return lista.append(el("div", { className: "vazio", textContent: "nenhuma magia com esses filtros." }));
    for (const m of itens) {
      lista.append(el("div", {
        className: "card" + (m.fonte === "mesa" ? " card-mesa" : ""),
        onclick: (ev) => aoEscolher ? aoEscolher(m) : expandir(ev.currentTarget, m),
      },
        el("h3", { textContent: m.nome }),
        el("div", { className: "meta", textContent: `${m.circulo}º · ${m.escola} · ${m.grupo}` + (m.autor ? ` · por ${m.autor}` : "") }),
      ));
    }
  }

  async function expandir(card, m) {
    const aberto = card.querySelector(".texto-oficial, .carta");
    if (aberto) return aberto.remove();
    lista.querySelectorAll(".texto-oficial, .carta").forEach((n) => n.remove());
    const box = el("div", { className: "texto-oficial", onclick: (e) => e.stopPropagation() }, "carregando…");
    card.append(box);
    try {
      if (m.fonte === "mesa") {
        const dados = await (await fetch(`/api/magia/${m.id}`)).json();
        if (dados.erro) { box.textContent = "essa magia foi despublicada."; return; }
        const carta = el("article", { className: "carta carta-mini", onclick: (e) => e.stopPropagation() });
        carta.innerHTML = cartaHtml(dados, { total: dados.pontos?.gasto ?? "?", orcamento: dados.pontos?.orcamento ?? 10, valido: true });
        carta.append(el("div", { className: "to-rodape" },
          el("a", { href: `/m/${m.id}`, textContent: "🔗 abrir página da magia" })));
        box.replaceWith(carta);
      } else {
        const t = await (await fetch(`/api/texto/${m.slug}`)).json();
        if (t.erro) { box.textContent = "texto não disponível neste servidor."; return; }
        const carta = el("article", { className: "carta carta-mini", onclick: (e) => e.stopPropagation() });
        carta.innerHTML = cartaOficialHtml(t);
        box.replaceWith(carta);
      }
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch { box.textContent = "erro ao carregar."; }
  }

  buscar().then(() => {
    if (abrir) {
      const alvo = [...lista.querySelectorAll(".card")]
        .find((c) => c.querySelector("h3").textContent === abrir);
      alvo?.click();
      alvo?.scrollIntoView({ block: "center" });
    }
  });
}

// bootstrap automático da página /grimorio (container #g-pagina)
const pagina = document.querySelector("#g-pagina");
if (pagina) {
  const params = new URLSearchParams(location.search);
  montarGrimorio(pagina, { qInicial: params.get("q") || "", abrir: params.get("abrir") });
}
