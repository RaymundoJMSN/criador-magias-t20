// Renderização da carta de magia — compartilhada entre o app (browser) e o
// server (página /m/<id>). Sem DOM: sanitização por regex.
import { circuloEfetivo } from "./custo.mjs";

export const ROTULOS = {
  execucao: { padrao: "padrão", movimento: "movimento", livre: "livre", reacao: "reação", completa: "completa", longa: "ritual" },
  alcance: { pessoal: "pessoal", toque: "toque", curto: "curto (9m)", medio: "médio (30m)", longo: "longo (90m)", ilimitado: "ilimitado" },
  duracao: { instantanea: "instantânea", "1rodada": "1 rodada", sustentada: "sustentada", cena: "cena", "1dia": "1 dia", permanente: "permanente" },
  resistencia: { nenhuma: "nenhuma", desacredita: "desacredita", "reduz-metade": "reduz à metade", parcial: "parcial", anula: "anula" },
};
export const RESTRITO_SINGULAR = { humanoides: "humanoide", animais: "animal", objetos: "objeto" };
export const FORMAS = { p: { cone: 6, linha: 9, esfera: 3, cilindro: 3, nuvem: 3, quadrado: 3 },
                        m: { cone: 9, linha: 30, esfera: 6, cilindro: 9, nuvem: 6, quadrado: 9 } };

export const esc = (s) => (s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

// só b/strong/i/em/u/br/div/p, sem atributos
export function sanitizarHtml(html) {
  return (html || "")
    .replace(/<(?!\/?(b|strong|i|em|u|br|div|p)\b)[^>]*>/gi, "")
    .replace(/<(\/?)(b|strong|i|em|u|br|div|p)\b[^>]*>/gi, "<$1$2>");
}

export function htmlParaTexto(html) {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(div|p)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n").trim();
}

export function textoDano(m) { const d = m.efeitos.dano; return d ? `${d.n}d${d.faces}${d.fixo ? "+" + d.fixo : ""} de ${d.tipo}` : "{dano?}"; }
export function textoCura(m) { const c = m.efeitos.cura; return c ? `${c.n}d${c.faces}${c.fixo ? "+" + c.fixo : ""} PV` : "{cura?}"; }
export function textoBonus(m) { return m.efeitos.bonus ? `+${m.efeitos.bonus} em ${m.efeitos.bonusEm || "…"}` : "{bônus?}"; }
export function textoCond(m) { return m.efeitos.condicoes?.length ? m.efeitos.condicoes.join(" e ") : "{condição?}"; }
export function textoPenalidade(m) { return m.efeitos.penalidade ? `−${m.efeitos.penalidade} em ${m.efeitos.penalidadeEm || "…"}` : "{penalidade?}"; }

export function textoArea(a) {
  const forma = a.forma || "esfera";
  const metros = a.metros || FORMAS[a.tamanho || "p"]?.[forma] || 6;
  return forma === "esfera" || forma === "nuvem" || forma === "cilindro"
    ? `${forma} com ${metros}m de raio` : `${forma} de ${metros}m`;
}

export function textoAlvo(m) {
  const a = m.eixos.alvo;
  if (a.tipo === "pessoal") return "você";
  if (a.tipo === "area") return textoArea(a);
  const tipo = a.restrito ? (RESTRITO_SINGULAR[a.restrito] || a.restrito) : "criatura";
  const plural = a.restrito ? (a.restrito in RESTRITO_SINGULAR ? a.restrito : a.restrito + "s") : "criaturas";
  if (a.qtd === "escolhidas") return `${plural} escolhidas`;
  return `${a.qtd} ${a.qtd > 1 ? plural : tipo}`;
}

export function textoResistencia(m) {
  const r = m.eixos.resistencia;
  return r === "nenhuma" ? "nenhuma" : `${m.eixos.teste} ${ROTULOS.resistencia[r]}`;
}

export const PLACEHOLDERS = {
  dano: textoDano, cura: textoCura, bonus: textoBonus, condicao: textoCond,
  alvo: textoAlvo, alcance: (m) => ROTULOS.alcance[m.eixos.alcance].replace(/ \(.+\)/, ""),
  duracao: (m) => ROTULOS.duracao[m.eixos.duracao], teste: (m) => m.eixos.teste,
  penalidade: textoPenalidade,
  efeitoespecial: (m) => m.efeitos.custom?.texto ? htmlParaTexto(m.efeitos.custom.texto) : "{efeito especial?}",
};

export function substituir(textoHtml, m, negrito) {
  return textoHtml.replace(/\{(\w+)\}/g, (tudo, chave) => {
    const fn = PLACEHOLDERS[chave];
    if (!fn) return tudo;
    const v = esc(fn(m));
    // efeitoespecial é um trecho de texto corrido, não um valor técnico: fica branco normal
    return negrito && chave !== "efeitoespecial" ? `<b>${v}</b>` : v;
  });
}

export function cartaHtml(m, r) {
  m = { efeitos: {}, aprimoramentos: [], ...m };
  const ef = [];
  if (m.efeitos.dano) ef.push(`<b>${textoDano(m)}</b>`);
  if (m.efeitos.cura) ef.push(`cura <b>${textoCura(m)}</b>`);
  if (m.efeitos.bonus) ef.push(`<b>${esc(textoBonus(m))}</b>`);
  if (m.efeitos.penalidade) ef.push(`<b>${esc(textoPenalidade(m))}</b>`);
  if (m.efeitos.condicoes?.length) ef.push(`condição: <b>${textoCond(m)}</b>`);
  const custom = m.efeitos.custom?.texto ? substituir(sanitizarHtml(m.efeitos.custom.texto), m, true) : "";
  const desc = m.descricao ? substituir(sanitizarHtml(m.descricao), m, true) : "";
  const aprs = m.aprimoramentos.filter((a) => a.texto).map((a) =>
    `<div><b>${a.truque ? "Truque" : "+" + a.pm + " PM"}:</b> ${esc(a.texto)}${a.requerCirculo ? ` <i>(requer ${a.requerCirculo}º círculo)</i>` : ""}</div>`).join("");
  return `
    <h2>${esc(m.nome) || "Sem Nome"}</h2>
    <div class="tipo-linha">${esc(m.escola)} (${esc(m.tipo)}) — ${m.circulo || 1}º círculo</div>
    <div class="miolo">
    <div class="stats">
      <b>Execução:</b> ${ROTULOS.execucao[m.eixos.execucao]}; <b>Alcance:</b> ${ROTULOS.alcance[m.eixos.alcance].replace(/ \(.+\)/, "")};
      <b>Alvo:</b> ${textoAlvo(m)}; <b>Duração:</b> ${ROTULOS.duracao[m.eixos.duracao]};
      <b>Resistência:</b> ${textoResistencia(m)}
    </div>
    ${desc ? `<div class="desc">${desc}</div>` : ""}
    ${!desc && custom ? `<div class="desc">${custom}</div>` : ""}
    ${ef.length && !desc ? `<div class="efeitos-num">${ef.join("; ")}.</div>` : ""}
    ${aprs ? `<div class="apr">${aprs}</div>` : ""}
    <div class="assina">${r.total}/${r.orcamento} pontos${r.valido ? "" : r.precisaAval ? " — aval do mestre" : " — ESTOUROU"}${m.autor ? " · por " + esc(m.autor) : ""}</div>
    </div>`;
}
