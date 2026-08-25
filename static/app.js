// Criador de Magias T20 — wizard passo a passo. Vanilla, sem build.
import { calcular, sugerirPm, circuloEfetivo } from "/custo.mjs";

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...filhos.filter((f) => f != null));
  return n;
};
const esc = (s) => (s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

let TABELA, TARIFAS, EXEMPLOS;
let magia = novaMagia();
let user = localStorage.getItem("cm_user") || "";
let minhas = [];
let passoAtual = 0;
let msgTimer;

const ROTULOS = {
  execucao: { padrao: "padrão", movimento: "movimento", livre: "livre", reacao: "reação", completa: "completa", longa: "ritual" },
  alcance: { pessoal: "pessoal", toque: "toque", curto: "curto (9m)", medio: "médio (30m)", longo: "longo (90m)", ilimitado: "ilimitado" },
  duracao: { instantanea: "instantânea", "1rodada": "1 rodada", sustentada: "sustentada", cena: "cena", "1dia": "1 dia", permanente: "permanente" },
  resistencia: { nenhuma: "nenhuma", desacredita: "desacredita", "reduz-metade": "reduz à metade", parcial: "parcial", anula: "anula" },
};
const EXPLICA = {
  execucao: {
    padrao: "uma ação padrão do seu turno — o normal",
    movimento: "gasta só a ação de movimento",
    livre: "quase de graça no turno",
    reacao: "conjura fora do seu turno, reagindo",
    completa: "consome o turno inteiro",
    longa: "1+ rodada conjurando (ritual)",
  },
  alcance: {
    pessoal: "só em você / a partir de você",
    toque: "precisa encostar no alvo",
    curto: "9 metros — o padrão das magias",
    medio: "30 metros",
    longo: "90 metros",
    ilimitado: "qualquer distância",
  },
  duracao: {
    instantanea: "acontece e acabou (dano, cura...)",
    "1rodada": "dura só 1 rodada",
    sustentada: "dura enquanto você gastar ação pra manter",
    cena: "dura a cena inteira — padrão de buffs",
    "1dia": "dura um dia",
    permanente: "para sempre (caro!)",
  },
  resistencia: {
    nenhuma: "sem teste — sempre funciona (caro)",
    desacredita: "o alvo pode desconfiar da ilusão",
    "reduz-metade": "passou no teste: metade do dano",
    parcial: "passou: sofre efeito menor",
    anula: "passou no teste: nada acontece (devolve ponto)",
  },
};
const TESTES = ["Fortitude", "Reflexos", "Vontade"];
const TIPOS_DANO = ["fogo", "frio", "eletricidade", "ácido", "luz", "trevas", "essência", "corte", "impacto", "perfuração", "psíquico"];

function novaMagia() {
  return {
    nome: "", tipo: "Arcana", escola: "Evocação", circulo: 1, descricao: "",
    eixos: { execucao: "padrao", alcance: "curto", duracao: "instantanea", resistencia: "nenhuma", teste: "Reflexos", alvo: { tipo: "alvos", qtd: 1 } },
    efeitos: {},
    aprimoramentos: [],
    criadaEm: new Date().toISOString(),
  };
}

// ============================================================ textos da magia
function textoDano(m) { const d = m.efeitos.dano; return d ? `${d.n}d${d.faces}${d.fixo ? "+" + d.fixo : ""} de ${d.tipo}` : "{dano?}"; }
function textoCura(m) { const c = m.efeitos.cura; return c ? `${c.n}d${c.faces}${c.fixo ? "+" + c.fixo : ""} PV` : "{cura?}"; }
function textoBonus(m) { return m.efeitos.bonus ? `+${m.efeitos.bonus} em ${m.efeitos.bonusEm || "…"}` : "{bônus?}"; }
function textoCond(m) { return m.efeitos.condicoes?.length ? m.efeitos.condicoes.join(" e ") : "{condição?}"; }
function textoAlvo(m) {
  const a = m.eixos.alvo;
  if (a.tipo === "pessoal") return "você";
  if (a.tipo === "area") return { p: "área pequena (cone de 6m / esfera de 3m)", m: "área média (cone de 9m / esfera de 6m)", g: "área grande (esfera de 9m+)" }[a.tamanho || "p"];
  return a.qtd === "escolhidas" ? "criaturas escolhidas" : `${a.qtd} criatura${a.qtd > 1 ? "s" : ""}`;
}
function textoResistencia(m) {
  const r = m.eixos.resistencia;
  return r === "nenhuma" ? "nenhuma" : `${m.eixos.teste} ${ROTULOS.resistencia[r]}`;
}
const PLACEHOLDERS = {
  dano: textoDano, cura: textoCura, bonus: textoBonus, condicao: textoCond,
  alvo: textoAlvo, alcance: (m) => ROTULOS.alcance[m.eixos.alcance].replace(/ \(.+\)/, ""),
  duracao: (m) => ROTULOS.duracao[m.eixos.duracao], teste: (m) => m.eixos.teste,
};
function substituir(texto, m, html) {
  return texto.replace(/\{(\w+)\}/g, (tudo, chave) => {
    const fn = PLACEHOLDERS[chave];
    if (!fn) return tudo;
    const v = fn(m);
    return html ? `<b>${esc(v)}</b>` : v;
  });
}

// ============================================================ ofensiva?
const ehOfensiva = (m) => !!m.efeitos.dano || !!m.efeitos.condicoes?.length;

// ============================================================ passos do wizard
const PASSOS = [
  { id: "basico", titulo: "A magia", pergunta: "Como ela se chama?", render: passoBasico },
  { id: "efeitos", titulo: "Efeitos", pergunta: "O que a magia faz?", render: passoEfeitos },
  { id: "config", titulo: "Detalhes", pergunta: "Configure cada efeito", render: passoConfig, visivel: (m) => Object.keys(m.efeitos).length > 0 },
  { id: "alvo", titulo: "Alvo", pergunta: "Quem ela atinge?", render: passoAlvo },
  { id: "tempo", titulo: "Tempo", pergunta: "Quando e por quanto tempo?", render: passoTempo },
  { id: "resistencia", titulo: "Resistência", pergunta: "O alvo pode resistir?", render: passoResistencia, visivel: ehOfensiva },
  { id: "descricao", titulo: "Descrição", pergunta: "Descreva a magia", render: passoDescricao },
  { id: "aprimoramentos", titulo: "Aprimoramentos", pergunta: "Como ela cresce gastando PM?", render: passoAprimoramentos },
  { id: "revisao", titulo: "Pronto!", pergunta: "Revise e salve", render: passoRevisao },
];
const passosVisiveis = () => PASSOS.filter((p) => !p.visivel || p.visivel(magia));

function cardOpcao({ marcado, titulo, custo, explica, onclick }) {
  return el("button", { type: "button", className: "opcao" + (marcado ? " on" : ""), onclick },
    el("span", { className: "op-titulo", textContent: titulo }),
    custo != null ? el("span", { className: "op-custo " + (custo > 0 ? "paga" : custo < 0 ? "devolve" : ""), textContent: custo > 0 ? `+${custo} pt` : custo < 0 ? `${custo} pt` : "0 pt" }) : null,
    explica ? el("span", { className: "op-explica", textContent: explica }) : null,
  );
}

function grupoEixo(eixo, aoMudar) {
  const box = el("div", { className: "opcoes" });
  for (const [chave, rotulo] of Object.entries(ROTULOS[eixo])) {
    if (!(chave in TABELA.eixos[eixo])) continue;
    box.append(cardOpcao({
      marcado: magia.eixos[eixo] === chave,
      titulo: rotulo, custo: TABELA.eixos[eixo][chave], explica: EXPLICA[eixo]?.[chave],
      onclick: () => { magia.eixos[eixo] = chave; aoMudar?.(); atualizar(); },
    }));
  }
  return box;
}

// ---------------------------------------------------------------- passo 1
function passoBasico(box) {
  box.append(
    el("label", { className: "campo" }, "Nome da magia",
      el("input", { id: "w-nome", maxLength: 40, value: magia.nome, placeholder: "Lança de Cinzas", oninput: (e) => { magia.nome = e.target.value; atualizar(false); } })),
    el("div", { className: "campo-linha" },
      el("label", { className: "campo" }, "Tipo",
        el("select", { value: magia.tipo, onchange: (e) => { magia.tipo = e.target.value; atualizar(); } },
          ...["Arcana", "Divina", "Universal"].map((t) => el("option", { textContent: t, selected: magia.tipo === t })))),
      el("label", { className: "campo" }, "Escola",
        el("select", { value: magia.escola, onchange: (e) => { magia.escola = e.target.value; atualizar(); } },
          ...["Abjuração", "Adivinhação", "Convocação", "Encantamento", "Evocação", "Ilusão", "Necromancia", "Transmutação"].map((t) => el("option", { textContent: t, selected: magia.escola === t })))),
    ),
  );
}

// ---------------------------------------------------------------- passo 2
const BLOCOS = [
  ["dano", "💥 Causa dano", "dados de dano num alvo ou área"],
  ["cura", "✚ Cura", "recupera pontos de vida"],
  ["bonus", "🛡 Dá um bônus", "+X em Defesa, ataque, perícia…"],
  ["condicoes", "🕸 Atrapalha", "impõe condições: lento, cego, caído…"],
  ["custom", "✨ Efeito especial", "qualquer outra coisa — voar, ilusão, comando…"],
];
function passoEfeitos(box) {
  box.append(el("p", { className: "explica", textContent: "Marque tudo que a magia faz (pode combinar):" }));
  const ops = el("div", { className: "opcoes grandes" });
  for (const [chave, titulo, explica] of BLOCOS) {
    const ligado = chave === "condicoes" ? !!magia.efeitos.condicoes : !!magia.efeitos[chave];
    ops.append(cardOpcao({
      marcado: ligado, titulo, explica,
      onclick: () => {
        if (ligado) delete magia.efeitos[chave];
        else magia.efeitos[chave] = { dano: { n: 2, faces: 6, fixo: 0, tipo: "fogo" }, cura: { n: 2, faces: 8, fixo: 2 }, bonus: 2, condicoes: [], custom: { texto: "", pontos: 0 } }[chave];
        if (chave === "bonus" && !ligado) magia.efeitos.bonusEm = magia.efeitos.bonusEm || "";
        renderPasso(); atualizar();
      },
    }));
  }
  box.append(ops);
}

// ---------------------------------------------------------------- passo 3
function seletor(nome, valor, opcoes, aoMudar) {
  return el("label", { className: "campo mini-campo" }, nome,
    el("select", { onchange: (e) => { aoMudar(e.target.value); atualizar(); } },
      ...opcoes.map((o) => el("option", { value: String(o), textContent: String(o), selected: String(o) === String(valor) }))));
}

function passoConfig(box) {
  const ef = magia.efeitos;
  if (ef.dano) {
    const custoDado = (f) => TABELA.efeitos.dano_por_dado[String(f)];
    box.append(el("div", { className: "sub-painel" },
      el("h3", {}, "💥 Dano"),
      el("div", { className: "campo-linha" },
        seletor("quantos dados", ef.dano.n, [1, 2, 3, 4], (v) => (ef.dano.n = +v)),
        seletor("qual dado", ef.dano.faces, [4, 6, 8, 10, 12], (v) => (ef.dano.faces = +v)),
        seletor("+ fixo", ef.dano.fixo, [0, 1, 2, 3, 4], (v) => (ef.dano.fixo = +v)),
        seletor("tipo", ef.dano.tipo, TIPOS_DANO, (v) => (ef.dano.tipo = v)),
      ),
      el("p", { className: "explica", textContent: `cada d${ef.dano.faces} custa ${custoDado(ef.dano.faces)} pts · cada +1 fixo custa ${TABELA.efeitos.dano_fixo_por_ponto} pt · referência oficial: 2d6 num alvo, 2d8+2 no toque` }),
    ));
  }
  if (ef.cura) {
    box.append(el("div", { className: "sub-painel" },
      el("h3", {}, "✚ Cura"),
      el("div", { className: "campo-linha" },
        seletor("quantos dados", ef.cura.n, [1, 2, 3, 4], (v) => (ef.cura.n = +v)),
        seletor("qual dado", ef.cura.faces, [4, 6, 8, 10, 12], (v) => (ef.cura.faces = +v)),
        seletor("+ fixo", ef.cura.fixo, [0, 1, 2, 3, 4], (v) => (ef.cura.fixo = +v)),
      ),
      el("p", { className: "explica", textContent: "referência oficial: Curar Ferimentos = 2d8+2 no toque" }),
    ));
  }
  if (ef.bonus != null) {
    const esc2 = TABELA.efeitos.bonus_escalonado;
    box.append(el("div", { className: "sub-painel" },
      el("h3", {}, "🛡 Bônus"),
      el("div", { className: "campo-linha" },
        seletor("valor", ef.bonus, [1, 2, 3, 4, 5], (v) => (ef.bonus = +v)),
        el("label", { className: "campo" }, "em quê?",
          el("input", { maxLength: 60, value: magia.efeitos.bonusEm || "", placeholder: "Defesa, ataques, Atletismo…", oninput: (e) => { magia.efeitos.bonusEm = e.target.value; atualizar(false); } })),
      ),
      el("p", { className: "explica", textContent: `custo escalonado (anti-munchkin): ${esc2.map((c, i) => `+${i + 1}=${c}pt`).join("  ")}` }),
    ));
  }
  if (ef.condicoes) {
    const chips = el("div", { className: "chips" });
    for (const [tier, lista] of Object.entries(TABELA.efeitos.condicoes_tier)) {
      for (const c of lista) {
        const b = el("button", {
          type: "button", className: "chip" + (ef.condicoes.includes(c) ? " on" : ""),
          innerHTML: `${c} <span class="tier">${TABELA.efeitos.condicao_custo_por_tier[tier]}pt</span>`,
          onclick: () => {
            const i = ef.condicoes.indexOf(c);
            i >= 0 ? ef.condicoes.splice(i, 1) : ef.condicoes.push(c);
            b.classList.toggle("on"); atualizar();
          },
        });
        chips.append(b);
      }
    }
    box.append(el("div", { className: "sub-painel" },
      el("h3", {}, "🕸 Condições"),
      el("p", { className: "explica", textContent: "só a mais cara conta cheia; extras custam +1 cada. Com resistência parcial/reduz, sai por metade." }),
      chips,
    ));
  }
  if (ef.custom) {
    box.append(el("div", { className: "sub-painel" },
      el("h3", {}, "✨ Efeito especial"),
      el("textarea", { rows: 2, maxLength: 1000, value: ef.custom.texto, placeholder: "o alvo obedece um comando de uma palavra…", oninput: (e) => { ef.custom.texto = e.target.value; atualizar(false); } }),
      el("label", { className: "campo mini-campo" }, "custo combinado com o mestre (pontos)",
        el("input", { type: "number", min: 0, max: 20, step: 0.5, value: ef.custom.pontos, oninput: (e) => { ef.custom.pontos = +e.target.value; atualizar(false); } })),
      el("p", { className: "explica" }, "sem ideia do preço? ",
        el("a", { href: "#galeria", textContent: "veja as referências oficiais", onclick: (e) => { e.preventDefault(); abrirAba("exemplos"); $("#galeria").scrollIntoView({ behavior: "smooth" }); } }),
        ` — efeitos como os dessas magias custam o valor mostrado (mediana ${TABELA.efeitos.utilitario_base} pts).`),
    ));
  }
}

// ---------------------------------------------------------------- passo 4
function passoAlvo(box) {
  const a = magia.eixos.alvo;
  const ops = el("div", { className: "opcoes" });
  const escolhe = (novo) => () => { magia.eixos.alvo = novo; if (novo.tipo === "pessoal") magia.eixos.alcance = "pessoal"; renderPasso(); atualizar(); };
  ops.append(
    cardOpcao({ marcado: a.tipo === "pessoal", titulo: "você mesmo", custo: TABELA.eixos.alvo.pessoal, explica: "buff pessoal — alcance vira pessoal", onclick: escolhe({ tipo: "pessoal" }) }),
    cardOpcao({ marcado: a.tipo === "alvos", titulo: "criaturas / objetos", custo: 0, explica: "1 ou mais alvos que você aponta", onclick: escolhe({ tipo: "alvos", qtd: a.qtd || 1 }) }),
    cardOpcao({ marcado: a.tipo === "area", titulo: "uma área", custo: TABELA.eixos.alvo.area_p, explica: "cone, esfera, linha — pega todo mundo dentro", onclick: escolhe({ tipo: "area", tamanho: a.tamanho || "p" }) }),
  );
  box.append(ops);

  if (a.tipo === "alvos") {
    const ops2 = el("div", { className: "opcoes" });
    for (const [q, rot, custo] of [[1, "1 alvo", 0], [2, "2 alvos", TABELA.eixos.alvo.alvo_extra], [3, "3 alvos", 2 * TABELA.eixos.alvo.alvo_extra], ["escolhidas", "escolhidos à vontade", TABELA.eixos.alvo.escolhidas]]) {
      ops2.append(cardOpcao({ marcado: String(a.qtd) === String(q), titulo: rot, custo, onclick: () => { a.qtd = q === "escolhidas" ? q : +q; renderPasso(); atualizar(); } }));
    }
    box.append(el("h3", { className: "sub-perg", textContent: "Quantos alvos?" }), ops2);
  }
  if (a.tipo === "area") {
    const ops2 = el("div", { className: "opcoes" });
    for (const [t, rot, ex] of [["p", "pequena", "cone 6m · linha 9m · esfera 3m"], ["m", "média", "cone 9m · esfera 6m"], ["g", "grande", "esfera 9m+ · quadrado 18m"]]) {
      ops2.append(cardOpcao({ marcado: (a.tamanho || "p") === t, titulo: rot, custo: TABELA.eixos.alvo["area_" + t], explica: ex, onclick: () => { a.tamanho = t; renderPasso(); atualizar(); } }));
    }
    box.append(el("h3", { className: "sub-perg", textContent: "Que tamanho?" }), ops2);
  }
  if (a.tipo !== "pessoal") {
    box.append(el("h3", { className: "sub-perg", textContent: "A que distância?" }), grupoEixo("alcance"));
  }
}

// ---------------------------------------------------------------- passo 5
function passoTempo(box) {
  box.append(
    el("h3", { className: "sub-perg", textContent: "Execução — o que ela custa do seu turno?" }), grupoEixo("execucao"),
    el("h3", { className: "sub-perg", textContent: "Duração — quanto tempo o efeito fica?" }), grupoEixo("duracao"),
  );
}

// ---------------------------------------------------------------- passo 6
function passoResistencia(box) {
  box.append(el("p", { className: "explica", textContent: "Sua magia é ofensiva — o alvo tem direito a um teste?" }), grupoEixo("resistencia", renderPasso));
  if (magia.eixos.resistencia !== "nenhuma") {
    const ops = el("div", { className: "opcoes" });
    for (const t of TESTES) {
      ops.append(cardOpcao({
        marcado: magia.eixos.teste === t, titulo: t,
        explica: { Fortitude: "resistir com o corpo (veneno, doença)", Reflexos: "desviar (rajadas, áreas)", Vontade: "resistir com a mente (medo, encanto)" }[t],
        onclick: () => { magia.eixos.teste = t; renderPasso(); atualizar(); },
      }));
    }
    box.append(el("h3", { className: "sub-perg", textContent: "Qual teste?" }), ops);
  }
}

// ---------------------------------------------------------------- passo 7: descrição
function passoDescricao(box) {
  const chavesUteis = ["alvo", "alcance", "duracao",
    ...(magia.efeitos.dano ? ["dano"] : []), ...(magia.efeitos.cura ? ["cura"] : []),
    ...(magia.efeitos.bonus ? ["bonus"] : []), ...(magia.efeitos.condicoes?.length ? ["condicao"] : []),
    ...(ehOfensiva(magia) && magia.eixos.resistencia !== "nenhuma" ? ["teste"] : [])];
  const ta = el("textarea", {
    rows: 5, maxLength: 2000, value: magia.descricao,
    placeholder: "Ex.: Você lança uma bola de fogo que causa {dano} em {alvo}. Quem falhar no teste de {teste} fica {condicao}.",
    oninput: (e) => { magia.descricao = e.target.value; atualizar(false); },
  });
  const chips = el("div", { className: "chips" });
  for (const c of chavesUteis) {
    chips.append(el("button", {
      type: "button", className: "chip",
      textContent: `{${c}} = ${substituir(`{${c}}`, magia)}`,
      onclick: () => {
        const i = ta.selectionStart ?? ta.value.length;
        ta.value = ta.value.slice(0, i) + `{${c}}` + ta.value.slice(ta.selectionEnd ?? i);
        magia.descricao = ta.value; ta.focus(); atualizar(false);
      },
    }));
  }
  box.append(
    el("p", { className: "explica", textContent: "Escreva livre. Os códigos {assim} viram os valores reais na carta — se você mudar o dano depois, o texto acompanha:" }),
    chips, ta,
  );
}

// ---------------------------------------------------------------- passo 8: aprimoramentos
function sugestoesApr(m) {
  const s = [];
  const add = (chave, titulo, texto) => {
    const sug = sugerirPm(chave, TARIFAS, 1);
    s.push({ chave, titulo, texto, pm: Math.max(1, Math.round(sug?.pm ?? 2)), n: sug?.generico ? 0 : sug?.n ?? 0 });
  };
  const d = m.efeitos.dano;
  if (d) add(`dano+:1d${d.faces}`, `+1d${d.faces} de dano`, `aumenta o dano em +1d${d.faces}.`);
  if (m.efeitos.cura) add("cura+:1d8", "+1 dado de cura", `aumenta a cura em +1d${m.efeitos.cura.faces}.`);
  const a = m.eixos.alvo;
  if (a.tipo === "alvos") add("alvos+:1", "+1 alvo", "aumenta o número de alvos em +1.");
  if (a.tipo === "area") add("area->", "área maior", "aumenta a área (um passo de tamanho).");
  if (a.tipo === "alvos" && (d || m.efeitos.condicoes?.length)) add("area->", "vira área", "muda o alvo para uma área pequena.");
  if (m.eixos.alcance === "toque") add("alcance->:curto", "alcance → curto", "muda o alcance para curto.");
  if (m.eixos.alcance === "curto") add("alcance->:medio", "alcance → médio", "muda o alcance para médio.");
  if (m.eixos.alcance === "pessoal" && a.tipo === "pessoal") add("alcance->:toque", "também em aliados", "muda o alcance para toque (pode lançar em outros).");
  if (m.efeitos.bonus) add("bonus+:1", `bônus +${m.efeitos.bonus + 1}`, "aumenta o bônus em +1.");
  if (m.efeitos.condicoes?.length) add("efeito-novo", "condição mais pesada", "muda a condição para uma um tier acima.");
  if (m.eixos.duracao === "cena" || m.eixos.duracao === "1dia") add("duracao->:permanente", "duração → permanente", "muda a duração para permanente.");
  if (ehOfensiva(m) && m.eixos.resistencia !== "nenhuma") add("resistencia->:reflexos", "troca o teste", "muda a resistência para outro teste.");
  if (m.eixos.execucao === "padrao" && d) add("efeito-novo", "junto com um ataque", "muda a execução para parte de um ataque corpo a corpo (descarrega a magia no golpe).");
  add("efeito-novo", "efeito novo (invente)", "");
  s.push({ chave: "truque", titulo: "truque (versão de graça)", texto: "versão enfraquecida do efeito, sem custo de PM.", pm: 0, n: 14, truque: true });
  // não repetir sugestão já adicionada com o mesmo texto
  return s.filter((x) => !m.aprimoramentos.some((ap) => ap.texto === x.texto && x.texto));
}

function passoAprimoramentos(box) {
  box.append(el("p", { className: "explica", textContent: "Aprimoramentos não gastam pontos da magia — quem conjura paga PM a mais. Sugestões baseadas NESTA magia, com o preço que o jogo oficial costuma cobrar:" }));

  const sugs = el("div", { className: "sugestoes" });
  for (const s of sugestoesApr(magia)) {
    sugs.append(el("button", {
      type: "button", className: "sugestao",
      onclick: () => {
        magia.aprimoramentos.push({ chave: s.chave, texto: s.texto, pm: s.pm, truque: !!s.truque });
        renderPasso(); atualizar();
      },
    },
      el("b", {}, s.truque ? "Truque" : `+${s.pm} PM`), " ", s.titulo,
      s.n ? el("span", { className: "op-explica", textContent: ` (${s.n}× nas oficiais)` }) : null,
    ));
  }
  box.append(sugs);

  if (magia.aprimoramentos.length) {
    const lista = el("div", { className: "lista-apr" });
    magia.aprimoramentos.forEach((ap, i) => {
      const sug = sugerirPm(ap.chave || "efeito-novo", TARIFAS, 1);
      const fora = sug && !sug.generico && !ap.truque && Math.abs((ap.pm || 0) - sug.pm) > 1;
      const pmTotal = 1 + (ap.truque ? 0 : ap.pm);
      const circ = circuloEfetivo(pmTotal);
      lista.append(el("div", { className: "apr-item" },
        ap.truque ? el("b", { className: "pm-fixo" }, "Truque") :
          el("input", { className: "pm", type: "number", min: 0, max: 15, value: ap.pm, onchange: (e) => { ap.pm = +e.target.value; renderPasso(); atualizar(); } }),
        ap.truque ? null : el("span", {}, "PM"),
        el("textarea", { rows: 1, maxLength: 500, value: ap.texto, placeholder: "o que o aprimoramento faz…", oninput: (e) => { ap.texto = e.target.value; atualizar(false); } }),
        el("span", { className: "sug" + (fora ? " fora" : "") },
          (fora ? `oficiais cobram ~${sug.pm} PM · ` : "") + (circ > 1 && !ap.truque ? `requer ${circ}º círculo` : "")),
        el("button", { className: "bt mini", textContent: "×", onclick: () => { magia.aprimoramentos.splice(i, 1); renderPasso(); atualizar(); } }),
      ));
    });
    box.append(el("h3", { className: "sub-perg", textContent: "Os desta magia:" }), lista);
  }
}

// ---------------------------------------------------------------- passo 9
function passoRevisao(box) {
  const r = calcular(magia, TABELA);
  box.append(
    el("div", { className: "carta-revisao", innerHTML: cartaHtml(magia, r) }),
    el("div", { className: "acoes" },
      el("button", { className: "bt destaque", textContent: "salvar", onclick: salvarServidor }),
      el("button", { className: "bt", textContent: "copiar texto", onclick: () => { navigator.clipboard.writeText(textoPlano(magia, r)); aviso("texto copiado"); } }),
      el("button", { className: "bt", textContent: "publicar (gera link)", onclick: publicar }),
      el("button", { className: "bt", textContent: "nova magia", onclick: () => { magia = novaMagia(); passoAtual = 0; renderPasso(); atualizar(); } }),
    ),
    !r.valido ? el("p", { className: "explica erro-txt", textContent: "A magia estourou o orçamento — volte e ajuste (ou combine o extra com o mestre)." }) : null,
  );
}

// ============================================================ carta
function cartaHtml(m, r) {
  const ef = [];
  if (m.efeitos.dano) ef.push(`<b>${textoDano(m)}</b>`);
  if (m.efeitos.cura) ef.push(`cura <b>${textoCura(m)}</b>`);
  if (m.efeitos.bonus) ef.push(`<b>${esc(textoBonus(m))}</b>`);
  if (m.efeitos.condicoes?.length) ef.push(`condição: <b>${textoCond(m)}</b>`);
  if (m.efeitos.custom?.texto && !m.descricao) ef.push(esc(m.efeitos.custom.texto));
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
    ${m.descricao ? `<div class="desc">${substituir(esc(m.descricao), m, true)}</div>` : ""}
    ${ef.length && !m.descricao ? `<div class="efeitos-num">${ef.join("; ")}.</div>` : ""}
    ${aprs ? `<div class="apr">${aprs}</div>` : ""}
    <div class="assina">${r.total}/${r.orcamento} pontos${r.valido ? "" : " — ESTOUROU"}${m.autor ? " · por " + esc(m.autor) : ""}</div>`;
}

function textoPlano(m, r) {
  const linhas = [
    `${(m.nome || "Sem Nome").toUpperCase()} (${m.escola} ${m.tipo} 1)`,
    `Execução: ${ROTULOS.execucao[m.eixos.execucao]}; Alcance: ${ROTULOS.alcance[m.eixos.alcance].replace(/ \(.+\)/, "")}; Alvo: ${textoAlvo(m)}; Duração: ${ROTULOS.duracao[m.eixos.duracao]}; Resistência: ${textoResistencia(m)}`,
  ];
  if (m.descricao) linhas.push(substituir(m.descricao, m));
  else {
    const e2 = [];
    if (m.efeitos.dano) e2.push(textoDano(m));
    if (m.efeitos.cura) e2.push("cura " + textoCura(m));
    if (m.efeitos.bonus) e2.push(textoBonus(m));
    if (m.efeitos.condicoes?.length) e2.push("condição: " + textoCond(m));
    if (m.efeitos.custom?.texto) e2.push(m.efeitos.custom.texto);
    if (e2.length) linhas.push(e2.join("; ") + ".");
  }
  for (const a of m.aprimoramentos.filter((a) => a.texto)) linhas.push(`${a.truque ? "Truque" : "+" + a.pm + " PM"}: ${a.texto}`);
  linhas.push(`[${r.total}/${r.orcamento} pontos — magias.raynathus.com.br]`);
  return linhas.join("\n");
}

// ============================================================ wizard render
function renderProgresso() {
  const nav = $("#progresso");
  nav.replaceChildren();
  const vis = passosVisiveis();
  vis.forEach((p, i) => {
    nav.append(el("button", {
      className: "prog" + (i === passoAtual ? " atual" : i < passoAtual ? " feito" : ""),
      textContent: p.titulo,
      onclick: () => { passoAtual = i; renderPasso(); },
    }));
  });
}

function renderPasso() {
  const vis = passosVisiveis();
  passoAtual = Math.min(passoAtual, vis.length - 1);
  const p = vis[passoAtual];
  const box = $("#passo");
  box.replaceChildren(el("h2", { className: "pergunta", textContent: p.pergunta }));
  p.render(box);
  $("#bt-voltar").disabled = passoAtual === 0;
  $("#bt-avancar").hidden = passoAtual === vis.length - 1;
  $("#lateral").hidden = p.id === "revisao"; // a revisão já mostra a carta grande
  renderProgresso();
  localStorage.setItem("cm_rascunho", JSON.stringify(magia));
}

function atualizar(rerender = true) {
  const r = calcular(magia, TABELA);
  const pct = Math.min(100, (Math.max(0, r.total) / r.orcamento) * 100);
  $("#medidor-fill").style.width = pct + "%";
  $("#medidor-txt").textContent = `${r.total} / ${r.orcamento} pontos`;
  $(".medidor").classList.toggle("estourou", !r.valido);
  $("#avisos").replaceChildren(...r.avisos.map((a) => el("div", { textContent: a })));
  $("#partes").replaceChildren(...Object.entries(r.partes).filter(([, v]) => v !== 0)
    .map(([k, v]) => el("li", { textContent: `${k}: ${v > 0 ? "+" + v : v}` })));
  $("#carta").innerHTML = cartaHtml(magia, r);
  localStorage.setItem("cm_rascunho", JSON.stringify(magia));
  if (rerender) renderProgresso();
  return r;
}

// ============================================================ login + sync + galeria
function aviso(t, erro) {
  const m = $("#msg");
  m.textContent = t;
  m.className = erro ? "erro" : "";
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => (m.textContent = ""), 5000);
}

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
  if (!user) return aviso("entre com seu nome (lá em cima) pra salvar", true);
  const r = atualizar(false);
  const i = minhas.findIndex((x) => x.criadaEm === magia.criadaEm);
  if (i >= 0) minhas[i] = magia; else minhas.push(magia);
  const j = await (await fetch(`/api/user/${encodeURIComponent(user)}`, { method: "PUT", body: JSON.stringify({ magias: minhas }) })).json();
  j.ok ? aviso(`salvo (${r.total}/${r.orcamento} pts)`) : aviso(j.erro || "erro ao salvar", true);
  abrirAba(abaAtiva);
}

async function publicar() {
  if (!user) return aviso("entre com seu nome primeiro", true);
  const r = calcular(magia, TABELA);
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
      add({ onclick: () => { magia = m; passoAtual = passosVisiveis().length - 1; renderPasso(); atualizar(); scrollTo({ top: 0, behavior: "smooth" }); } },
        el("h3", { textContent: m.nome || "Sem Nome" }),
        el("span", { className: "custo", textContent: `${r.total}pt` }),
        el("div", { className: "meta", textContent: `${m.escola} · ${m.tipo}` }),
        el("div", { className: "acoes-card" },
          el("button", { className: "bt mini", textContent: "apagar", onclick: async (ev) => { ev.stopPropagation(); minhas = minhas.filter((x) => x !== m); if (user) await fetch(`/api/user/${encodeURIComponent(user)}`, { method: "PUT", body: JSON.stringify({ magias: minhas }) }); abrirAba("minhas"); } })));
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
    g.append(el("div", { className: "vazio", textContent: "As 101 magias oficiais de 1º círculo reconstruídas. Clique pra ler o texto oficial e comparar; nas de efeito especial dá pra usar o preço como referência." }));
    const todas = [
      ...EXEMPLOS.utilitarias.map((ex) => ({ ...ex, badge: `efeito ≈ ${ex.preco_efeito}pt` })),
      ...EXEMPLOS.numericas.map((ex) => ({ ...ex, badge: `total ${ex.total}pt` })),
    ].sort((a, b) => a.nome.localeCompare(b.nome));
    for (const ex of todas) add({ onclick: (ev) => expandirReferencia(ev.currentTarget, ex) },
      el("h3", { textContent: ex.nome }),
      el("span", { className: "custo", textContent: ex.badge }),
      el("div", { className: "meta", textContent: `${ex.escola} · ${ex.grupo}` }));
  }
}

async function expandirReferencia(card, ex) {
  const aberto = card.querySelector(".texto-oficial");
  if (aberto) return aberto.remove();
  document.querySelectorAll(".texto-oficial").forEach((n) => n.remove());
  const box = el("div", { className: "texto-oficial", onclick: (e) => e.stopPropagation() }, "carregando…");
  card.append(box);
  try {
    const t = await (await fetch(`/api/texto/${ex.slug}`)).json();
    if (t.erro) { box.textContent = "texto não disponível neste servidor"; return; }
    box.replaceChildren(
      el("div", { className: "to-stats", innerHTML: Object.entries(t.stats).map(([k, v]) => `<b>${k}:</b> ${esc(v)}`).join("; ") }),
      el("p", { className: "to-desc", textContent: t.descricao }),
      ...t.aprimoramentos.map((a) => el("div", { className: "to-apr", innerHTML: `<b>${esc(a.custo)}:</b> ${esc(a.texto)}` })),
      el("div", { className: "to-rodape" },
        el("span", { textContent: t.publicacao }),
        ex.preco_efeito != null ? el("button", {
          className: "bt mini", textContent: `usar como referência (${ex.preco_efeito}pt)`,
          onclick: (e) => { e.stopPropagation(); usarReferencia(ex); },
        }) : null),
    );
  } catch { box.textContent = "erro ao carregar"; }
}

function usarReferencia(ex) {
  magia.efeitos.custom = magia.efeitos.custom || { texto: "", pontos: 0 };
  magia.efeitos.custom.pontos = ex.preco_efeito;
  if (!magia.efeitos.custom.texto) magia.efeitos.custom.texto = `(efeito no estilo de ${ex.nome})`;
  passoAtual = passosVisiveis().findIndex((p) => p.id === "config");
  renderPasso(); atualizar();
  scrollTo({ top: 0, behavior: "smooth" });
}

async function verPublicada(id) {
  const m = await (await fetch(`/api/magia/${id}`)).json();
  if (m.erro) return;
  magia = { ...novaMagia(), ...m };
  passoAtual = passosVisiveis().length - 1;
  renderPasso(); atualizar();
}

// ============================================================ boot
async function boot() {
  [TABELA, TARIFAS, EXEMPLOS] = await Promise.all(
    ["/data/tabela-custos.json", "/data/tarifas-pm.json", "/data/exemplos.json"].map((u) => fetch(u).then((r) => r.json()))
  );

  const rascunho = localStorage.getItem("cm_rascunho");
  if (rascunho) try { magia = { ...novaMagia(), ...JSON.parse(rascunho) }; } catch {}

  $("#bt-voltar").onclick = () => { passoAtual = Math.max(0, passoAtual - 1); renderPasso(); };
  $("#bt-avancar").onclick = () => { passoAtual = Math.min(passosVisiveis().length - 1, passoAtual + 1); renderPasso(); };
  $("#bt-entrar").onclick = () => { const n = $("#nome-user").value.trim(); if (n) { user = n; localStorage.setItem("cm_user", n); entrou(); } };
  $("#bt-sair").onclick = () => { user = ""; localStorage.removeItem("cm_user"); location.reload(); };
  document.querySelectorAll(".aba").forEach((b) => (b.onclick = () => abrirAba(b.dataset.aba)));

  if (user) entrou();
  renderPasso();
  atualizar();

  const mView = location.pathname.match(/^\/m\/(\w+)/);
  if (mView) verPublicada(mView[1]);
  abrirAba("minhas");
}

boot();
