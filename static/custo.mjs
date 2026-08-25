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

export const ehOfensiva = (m) => !!m.efeitos?.dano || !!m.efeitos?.condicoes?.length ||
  !!m.efeitos?.penalidade || !!m.efeitos?.resistenciaForcada;

// magia: ver README/spec. Retorna {total, partes, devolvido, orcamento, avisos, valido}.
export function calcular(magia, tabela) {
  const t = tabela, e = t.eixos, ef = t.efeitos;
  const eixos = magia.eixos || {};
  const efeitos = magia.efeitos || {};
  const travas = t.travas?.[String(magia.circulo || 1)] || {};
  const partes = {};
  const avisos = [];
  let bloqueada = false; // trava dura: inválida mesmo dentro do orçamento

  const alvo = eixos.alvo || { tipo: "alvos", qtd: 1 };

  partes.execucao = e.execucao[eixos.execucao] ?? 0;
  // alcance pessoal só faz sentido em você mesmo / área a partir de você
  let alcance = eixos.alcance;
  if (alcance === "pessoal" && alvo.tipo === "alvos") {
    alcance = "toque";
    avisos.push("Alcance pessoal com alvo externo não existe — cobrado como toque.");
  }
  partes.alcance = e.alcance[alcance] ?? 0;
  partes.duracao = e.duracao[eixos.duracao] ?? 0;

  if (alvo.tipo === "pessoal") partes.alvo = e.alvo.pessoal;
  else if (alvo.tipo === "area") partes.alvo = e.alvo["area_" + (alvo.tamanho || "p")];
  else if (alvo.qtd === "escolhidas") partes.alvo = e.alvo.escolhidas;
  else partes.alvo = e.alvo["1alvo"] + (Math.max(1, alvo.qtd || 1) - 1) * e.alvo.alvo_extra;
  if (alvo.tipo === "alvos" && alvo.restrito) partes.alvo += e.alvo.restrito ?? -1;

  const condicoes = efeitos.condicoes || [];
  const ofensiva = ehOfensiva(magia);
  const res = eixos.resistencia || "nenhuma";
  partes.resistencia = ofensiva ? (e.resistencia[res] ?? 0) : 0;
  if (!ofensiva && res !== "nenhuma") {
    avisos.push("Resistência só se aplica a magia ofensiva (com dano, condição ou penalidade).");
  }

  if (efeitos.dano) {
    partes.dano = custoDados(efeitos.dano, ef.dano_por_dado, ef.dano_fixo_por_ponto);
    // dano com duração = repetível toda rodada (estilo Açoite Flamejante)
    if (["sustentada", "cena", "1dia", "permanente"].includes(eixos.duracao)) {
      partes.dano *= ef.dano_repetivel_mult ?? 1.5;
      avisos.push(`Dano com duração ${eixos.duracao} repete a cada rodada — custo do dano ×${ef.dano_repetivel_mult ?? 1.5}.`);
    }
  }
  if (efeitos.cura) partes.cura = custoDados(efeitos.cura, ef.cura_por_dado, ef.cura_fixa_por_ponto);
  if (efeitos.dano && efeitos.cura) {
    avisos.push("Dano E cura na mesma magia: os dois somam. Se são modos alternativos (como Infligir Ferimentos), o mestre pode cobrar só o maior.");
  }

  const custoBonus = (valor, escopo) => {
    const esc = ef.bonus_escalonado;
    const v = Math.min(Math.abs(valor), esc.length);
    const mult = ef.bonus_escopo_mult?.[escopo || "especifico"] ?? 1;
    return esc[v - 1] * mult;
  };
  if (efeitos.bonus) {
    partes.bonus = custoBonus(efeitos.bonus, efeitos.bonusEscopo);
    if (Math.abs(efeitos.bonus) > ef.bonus_escalonado.length) avisos.push(`Bônus acima de +${ef.bonus_escalonado.length}: precifique como efeito custom.`);
  }
  if (efeitos.penalidade) {
    partes.penalidade = custoBonus(efeitos.penalidade, efeitos.penalidadeEscopo);
  }

  if (condicoes.length) {
    const tiers = condicoes.map((c) => tierCondicao(c, ef.condicoes_tier)).sort((a, b) => b - a);
    const custoTier = (tier) => ef.condicao_custo_por_tier[String(tier)];
    // a mais cara paga cheio; extras pagam metade do próprio tier
    let custo = custoTier(tiers[0]) + tiers.slice(1).reduce((s, tr) => s + custoTier(tr) / 2, 0);
    // condição junto com dano é rider ("atordoado se falhar"): metade
    if (efeitos.dano) custo *= ef.condicao_rider_dano_mult ?? 0.5;
    partes.condicao = custo;

    // travas do círculo (do corpus oficial)
    if (travas.tier4_exige && tiers[0] >= 4) {
      const ok = alvo.tipo === "alvos" && !(Number(alvo.qtd) > travas.tier4_exige.alvos_max) &&
        alvo.qtd !== "escolhidas" && res === travas.tier4_exige.resistencia;
      if (!ok) {
        bloqueada = true;
        avisos.push(`Condição incapacitante no ${magia.circulo || 1}º círculo só como o Sono oficial: 1 alvo e resistência ${travas.tier4_exige.resistencia}.`);
      }
    }
    if (travas.tier_max_area && tiers[0] > travas.tier_max_area && (alvo.tipo === "area" || alvo.qtd === "escolhidas")) {
      bloqueada = true;
      avisos.push(`Condição forte (tier ${tiers[0]}) em área/escolhidas não existe no ${magia.circulo || 1}º círculo — nenhuma oficial faz isso.`);
    }
  }

  // permanente numérico não existe no 1º círculo
  if (travas.permanente_so_custom && eixos.duracao === "permanente" &&
      (efeitos.dano || efeitos.cura || efeitos.bonus || efeitos.penalidade || condicoes.length)) {
    bloqueada = true;
    avisos.push("Duração permanente no 1º círculo só para efeito especial (com aprovação do mestre) — nunca para dano/cura/bônus/condição.");
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
    total, partes, orcamento, avisos, bloqueada,
    devolvido: Math.max(devolvidoBruto, -t.max_devolvido),
    valido: total <= orcamento && !bloqueada,
  };
}

// Sugestão de custo PM para um delta de aprimoramento, vinda das tarifas mineradas.
export function sugerirPm(chaveDelta, tarifas, circulo = 1) {
  const t = tarifas.tarifas[chaveDelta];
  if (t) return { pm: t.por_circulo?.[String(circulo)] ?? t.pm_mediana, n: t.n };
  const en = tarifas.efeito_novo_por_circulo[String(circulo)];
  return en ? { pm: en.pm_mediana, n: en.n, generico: true } : null;
}

// Detecta o delta de um texto de aprimoramento e devolve a tarifa oficial correspondente
// (pra alertar quando o PM escrito foge da régua). Retorna null se não reconhecer.
export function tarifaDoTexto(texto, magia, tarifas) {
  const n = (texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!n) return null;
  const faces = magia?.efeitos?.dano?.faces || 6;
  const tenta = [];
  if (/aumenta o dano/.test(n)) tenta.push(`dano+:1d${faces}`, "dano+:1d6");
  if (/aumenta a cura/.test(n)) tenta.push("cura+:1d8");
  if (/(aumenta o numero de alvos|afeta todos)/.test(n)) tenta.push("alvos+:1");
  const alc = n.match(/muda o alcance para (\w+)/);
  if (alc) tenta.push(`alcance->:${alc[1]}`);
  if (/muda a duracao para permanente/.test(n)) tenta.push("duracao->:permanente");
  if (/muda a resistencia/.test(n)) tenta.push("resistencia->:reflexos");
  if (/(muda a area|aumenta a area|muda o alvo para (uma )?(esfera|cone|linha))/.test(n)) tenta.push("area->");
  for (const chave of tenta) {
    const s = sugerirPm(chave, tarifas, 1);
    if (s && !s.generico) return { ...s, chave };
  }
  return null;
}
