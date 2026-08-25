// Motor de custo do Criador de Magias T20.
// Importado pelo browser (app.js) e pelo server (validação do PUT).
// Única fonte de preços: data/tabela-custos.json (passada em calcular()).

export const ORDEM_CIRCULO = [[1, 1], [3, 2], [6, 3], [10, 4], [15, 5]];

export function circuloEfetivo(pmTotal) {
  let c = 1;
  for (const [pm, circ] of ORDEM_CIRCULO) if (pmTotal >= pm) c = circ;
  return c;
}

function custoDados(d, porDado, fixoPorPonto) {
  if (!d || !d.n) return 0;
  return d.n * (porDado[String(d.faces)] ?? porDado["6"]) + (d.fixo || 0) * fixoPorPonto;
}

function tierCondicao(nome, tiers) {
  for (const [tier, lista] of Object.entries(tiers)) {
    if (lista.includes(nome)) return Number(tier);
  }
  return 2; // condição desconhecida: tier médio
}

// magia: ver README/spec. Retorna {total, partes, devolvido, orcamento, avisos, valido}.
export function calcular(magia, tabela) {
  const t = tabela, e = t.eixos, ef = t.efeitos;
  const eixos = magia.eixos || {};
  const efeitos = magia.efeitos || {};
  const partes = {};
  const avisos = [];

  partes.execucao = e.execucao[eixos.execucao] ?? 0;
  partes.alcance = e.alcance[eixos.alcance] ?? 0;
  partes.duracao = e.duracao[eixos.duracao] ?? 0;

  const alvo = eixos.alvo || { tipo: "alvos", qtd: 1 };
  if (alvo.tipo === "pessoal") partes.alvo = e.alvo.pessoal;
  else if (alvo.tipo === "area") partes.alvo = e.alvo["area_" + (alvo.tamanho || "p")];
  else if (alvo.qtd === "escolhidas") partes.alvo = e.alvo.escolhidas;
  else partes.alvo = e.alvo["1alvo"] + (Math.max(1, alvo.qtd || 1) - 1) * e.alvo.alvo_extra;

  const condicoes = efeitos.condicoes || [];
  const ofensiva = !!efeitos.dano || condicoes.length > 0 || !!efeitos.resistenciaForcada;
  const res = eixos.resistencia || "nenhuma";
  partes.resistencia = ofensiva ? (e.resistencia[res] ?? 0) : 0;
  if (!ofensiva && res !== "nenhuma") {
    avisos.push("Resistência só se aplica a magia ofensiva (com dano/condição).");
  }

  if (efeitos.dano) partes.dano = custoDados(efeitos.dano, ef.dano_por_dado, ef.dano_fixo_por_ponto);
  if (efeitos.cura) partes.cura = custoDados(efeitos.cura, ef.cura_por_dado, ef.cura_fixa_por_ponto);
  if (efeitos.dano && efeitos.cura) {
    avisos.push("Dano E cura na mesma magia: os dois somam. Se são modos alternativos (como Infligir Ferimentos), o mestre pode cobrar só o maior.");
  }

  if (efeitos.bonus) {
    const esc = ef.bonus_escalonado;
    const v = Math.min(Math.abs(efeitos.bonus), esc.length);
    partes.bonus = esc[v - 1];
    if (Math.abs(efeitos.bonus) > esc.length) avisos.push(`Bônus acima de +${esc.length}: precifique como efeito custom.`);
  }

  if (condicoes.length) {
    const tiers = condicoes.map((c) => tierCondicao(c, ef.condicoes_tier));
    let custo = ef.condicao_custo_por_tier[String(Math.max(...tiers))];
    if (res === "parcial" || res === "reduz-metade") custo *= ef.condicao_so_na_falha_mult;
    partes.condicao = custo + (condicoes.length - 1);
  }

  if (efeitos.custom && (efeitos.custom.texto || efeitos.custom.pontos)) {
    partes.custom = Number(efeitos.custom.pontos) || 0;
    if (!efeitos.custom.texto) avisos.push("Efeito custom sem descrição.");
    if (partes.custom <= 0) avisos.push("Efeito custom sem preço: consulte a galeria de exemplos e combine com o mestre.");
  }

  // cap de devolução (anti-empilhar desvantagem)
  const devolvidoBruto = Object.values(partes).filter((v) => v < 0).reduce((a, b) => a + b, 0);
  let ajusteCap = 0;
  if (-devolvidoBruto > t.max_devolvido) {
    ajusteCap = -devolvidoBruto - t.max_devolvido;
    avisos.push(`Desvantagens devolvem no máximo ${t.max_devolvido} pontos (cortado ${ajusteCap}).`);
  }

  const total = Object.values(partes).reduce((a, b) => a + b, 0) + ajusteCap;
  const orcamento = t.orcamento[String(magia.circulo || 1)];

  // aprimoramentos: não gastam pontos; valida trilho de círculo
  const pmBase = { 1: 1, 2: 3, 3: 6, 4: 10, 5: 15 }[magia.circulo || 1];
  for (const ap of magia.aprimoramentos || []) {
    const pmTotal = pmBase + (Number(ap.pm) || 0);
    const circ = circuloEfetivo(pmTotal);
    if (circ > (magia.circulo || 1) && !ap.requerCirculo) {
      avisos.push(`Aprimoramento "+${ap.pm} PM" leva a magia ao poder de ${circ}º círculo — considere a trava "requer ${circ}º círculo".`);
    }
  }

  return {
    total, partes, orcamento, avisos,
    devolvido: Math.max(devolvidoBruto, -t.max_devolvido),
    valido: total <= orcamento,
  };
}

// Sugestão de custo PM para um delta de aprimoramento, vinda das tarifas mineradas.
export function sugerirPm(chaveDelta, tarifas, circulo = 1) {
  const t = tarifas.tarifas[chaveDelta];
  if (t) return { pm: t.por_circulo?.[String(circulo)] ?? t.pm_mediana, n: t.n };
  const en = tarifas.efeito_novo_por_circulo[String(circulo)];
  return en ? { pm: en.pm_mediana, n: en.n, generico: true } : null;
}
