// Quadro interativo de magias: cartas arrastáveis, várias ao mesmo tempo.
// Usado na página /m/<id> (ambiente de comparação visual).
import { cartaHtml, cartaOficialHtml } from "/carta.mjs";

const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...filhos.filter((f) => f != null));
  return n;
};

export function montarQuadro(raiz) {
  let z = 10;
  const abertas = new Map();

  function add(chave, html) {
    if (abertas.has(chave)) {
      const c = abertas.get(chave);
      c.style.zIndex = ++z;
      c.classList.remove("q-pulso"); void c.offsetWidth; c.classList.add("q-pulso");
      return;
    }
    const carta = el("article", { className: "carta quadro-carta" });
    carta.innerHTML = html;
    carta.append(el("button", {
      className: "q-fechar", textContent: "✕", title: "fechar",
      onclick: () => { carta.remove(); abertas.delete(chave); },
    }));
    const n = abertas.size;
    carta.style.left = 24 + (n % 5) * 70 + "px";
    carta.style.top = 24 + (n % 4) * 56 + "px";
    carta.style.zIndex = ++z;

    // arrastar segurando o título/topo (fora do miolo, botões e links)
    carta.addEventListener("pointerdown", (e) => {
      carta.style.zIndex = ++z;
      if (e.target.closest(".miolo, button, a")) return;
      e.preventDefault();
      const r = carta.getBoundingClientRect();
      const rp = raiz.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      carta.setPointerCapture(e.pointerId);
      carta.classList.add("q-arrastando");
      const mover = (ev) => {
        carta.style.left = Math.max(0, ev.clientX - rp.left - dx + raiz.scrollLeft) + "px";
        carta.style.top = Math.max(0, ev.clientY - rp.top - dy + raiz.scrollTop) + "px";
      };
      const soltar = () => {
        carta.classList.remove("q-arrastando");
        carta.removeEventListener("pointermove", mover);
        carta.removeEventListener("pointerup", soltar);
      };
      carta.addEventListener("pointermove", mover);
      carta.addEventListener("pointerup", soltar);
    });

    raiz.append(carta);
    abertas.set(chave, carta);
  }

  return {
    async abrirOficial(slug) {
      try {
        const t = await (await fetch(`/api/texto/${slug}`)).json();
        if (!t.erro) add("o:" + slug, cartaOficialHtml(t));
      } catch {}
    },
    async abrirPublicada(id) {
      try {
        const m = await (await fetch(`/api/magia/${id}`)).json();
        if (!m.erro) add("p:" + id, cartaHtml(m, { total: m.pontos?.gasto ?? "?", orcamento: m.pontos?.orcamento ?? 10, valido: true }));
      } catch {}
    },
  };
}
