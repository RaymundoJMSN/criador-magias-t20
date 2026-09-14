// Mesa: cartas de magia flutuantes sobre QUALQUER página, tipo janelas na área
// de trabalho. Singleton por página; as cartas abertas ficam no localStorage e
// reaparecem quando a pessoa muda de página (grimório ⇄ criador).
import { cartaHtml, cartaOficialHtml } from "/carta.mjs";

const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...filhos.filter((f) => f != null));
  return n;
};

const LS = "cm_mesa";
export const TIPO_ARRASTO = "text/x-magia"; // dataTransfer: "o:<slug>" ou "p:<id>"
let mesa;

export function mesaGlobal() {
  if (mesa) return mesa;
  const raiz = el("div", { id: "mesa" });
  const barra = el("div", { className: "mesa-barra", hidden: true },
    el("span", { className: "mesa-conta" }),
    el("button", { className: "bt mini", textContent: "✕ limpar mesa", onclick: () => { for (const k of [...abertas.keys()]) fechar(k); } }));
  document.body.append(raiz, barra);
  let z = 10;
  const abertas = new Map();

  const salvar = () => {
    try { localStorage.setItem(LS, JSON.stringify([...abertas].map(([chave, c]) => ({ chave, x: c.offsetLeft, y: c.offsetTop })))); } catch {}
    barra.hidden = !abertas.size;
    barra.querySelector(".mesa-conta").textContent = `${abertas.size} na mesa`;
  };
  const fechar = (chave) => { abertas.get(chave)?.remove(); abertas.delete(chave); salvar(); };
  const clamp = (v, max) => Math.max(0, Math.min(v, max));

  async function html(chave) {
    const [tipo, id] = [chave[0], chave.slice(2)];
    if (tipo === "p") {
      const m = await (await fetch(`/api/magia/${id.replace(/[^a-f0-9]/g, "")}`)).json();
      if (m.erro) throw new Error("despublicada");
      return cartaHtml(m, { total: m.pontos?.gasto ?? "?", orcamento: m.pontos?.orcamento ?? 10, valido: true })
        + `<div class="to-rodape"><a href="/m/${id}">🔗 link desta magia</a></div>`;
    }
    const t = await (await fetch(`/api/texto/${id.replace(/[^\w-]/g, "")}`)).json();
    if (t.erro) throw new Error("sem texto");
    return cartaOficialHtml(t);
  }

  async function abrir(chave, pos) {
    if (abertas.has(chave)) {
      const c = abertas.get(chave);
      c.style.zIndex = ++z;
      c.classList.remove("q-pulso"); void c.offsetWidth; c.classList.add("q-pulso");
      return c;
    }
    const carta = el("article", { className: "carta quadro-carta" });
    carta.innerHTML = "<h2>…</h2>";
    carta.append(el("button", { className: "q-fechar", textContent: "✕", title: "fechar (Esc)", onclick: () => fechar(chave) }));
    const n = abertas.size;
    const w = Math.min(430, innerWidth * .92);
    carta.style.left = clamp(pos?.x ?? 40 + (n % 5) * 70, innerWidth - w) + "px";
    carta.style.top = clamp(pos?.y ?? 70 + (n % 4) * 56, innerHeight - 120) + "px";
    carta.style.zIndex = ++z;

    // arrastar pelo título (fora do miolo, botões e links)
    carta.addEventListener("pointerdown", (e) => {
      carta.style.zIndex = ++z;
      if (e.target.closest(".miolo, button, a")) return;
      e.preventDefault();
      const r = carta.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      carta.setPointerCapture(e.pointerId);
      carta.classList.add("q-arrastando");
      const mover = (ev) => {
        carta.style.left = clamp(ev.clientX - dx, innerWidth - r.width) + "px";
        carta.style.top = clamp(ev.clientY - dy, innerHeight - 60) + "px";
      };
      const soltar = () => {
        carta.classList.remove("q-arrastando");
        carta.removeEventListener("pointermove", mover);
        carta.removeEventListener("pointerup", soltar);
        salvar();
      };
      carta.addEventListener("pointermove", mover);
      carta.addEventListener("pointerup", soltar);
    });

    raiz.append(carta);
    abertas.set(chave, carta);
    salvar();
    try {
      const h = await html(chave);
      const fecharBt = carta.querySelector(".q-fechar");
      carta.innerHTML = h;
      carta.append(fecharBt);
    } catch (e) {
      carta.querySelector("h2").textContent = e.message === "despublicada" ? "magia despublicada" : "texto não disponível";
    }
    return carta;
  }

  // soltar uma magia arrastada da lista em qualquer lugar da página
  document.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes(TIPO_ARRASTO)) e.preventDefault(); });
  document.addEventListener("drop", (e) => {
    const chave = e.dataTransfer.getData(TIPO_ARRASTO);
    if (!chave) return;
    e.preventDefault();
    abrir(chave, { x: e.clientX - 60, y: e.clientY - 20 });
  });
  // Esc fecha a carta de cima
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !abertas.size || e.target.closest("input, textarea, [contenteditable]")) return;
    const topo = [...abertas].sort((a, b) => +b[1].style.zIndex - +a[1].style.zIndex)[0];
    fechar(topo[0]);
  });

  try { for (const { chave, x, y } of JSON.parse(localStorage.getItem(LS) || "[]")) abrir(chave, { x, y }); } catch {}

  return (mesa = { abrir, fechar, abertas });
}
