// Self-test do motor de custo: node test-custo.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert";
import { calcular, circuloEfetivo, sugerirPm } from "./static/custo.mjs";

const tabela = JSON.parse(readFileSync(new URL("./data/tabela-custos.json", import.meta.url)));
const tarifas = JSON.parse(readFileSync(new URL("./data/tarifas-pm.json", import.meta.url)));

// Toque Chocante reconstruída: 2d8+2, toque, instantânea, reduz-metade -> 10
let r = calcular({
  circulo: 1,
  eixos: { execucao: "padrao", alcance: "toque", duracao: "instantanea",
           resistencia: "reduz-metade", alvo: { tipo: "alvos", qtd: 1 } },
  efeitos: { dano: { n: 2, faces: 8, fixo: 2 } },
}, tabela);
assert.equal(r.total, 10, `Toque Chocante: ${r.total}`);
assert.ok(r.valido);

// buff pessoal: +2 em Defesa, cena -> 5 - 2 - 1 + 1 = 3, resistência ignorada
r = calcular({
  circulo: 1,
  eixos: { execucao: "padrao", alcance: "pessoal", duracao: "cena",
           resistencia: "anula", alvo: { tipo: "pessoal" } },
  efeitos: { bonus: 2 },
}, tabela);
assert.equal(r.partes.resistencia, 0);
assert.ok(r.avisos.length >= 1, "devia avisar resistência inútil");
assert.equal(r.total, 3, `buff: ${r.total}`);

// cap de devolução: completa(-2) + pessoal alcance(-2) + pessoal alvo(-1) + 1rodada(-1) = -6 -> corta pra -4
r = calcular({
  circulo: 1,
  eixos: { execucao: "completa", alcance: "pessoal", duracao: "1rodada",
           alvo: { tipo: "pessoal" } },
  efeitos: { custom: { texto: "x", pontos: 14 } },
}, tabela);
assert.equal(r.total, 10, `cap devolução: ${r.total}`);
assert.ok(r.avisos.some((a) => a.includes("máximo")));

// condição com resistência parcial custa metade
r = calcular({
  circulo: 1,
  eixos: { execucao: "padrao", alcance: "curto", duracao: "instantanea",
           resistencia: "parcial", alvo: { tipo: "alvos", qtd: 1 } },
  efeitos: { dano: { n: 2, faces: 6 }, condicoes: ["atordoado"] },
}, tabela);
assert.equal(r.partes.condicao, 4, `condição parcial: ${r.partes.condicao}`);
assert.equal(r.total, 10);

// estouro de orçamento invalida
r = calcular({
  circulo: 1,
  eixos: { execucao: "padrao", alcance: "longo", duracao: "cena",
           resistencia: "nenhuma", alvo: { tipo: "area", tamanho: "g" } },
  efeitos: { dano: { n: 3, faces: 8 } },
}, tabela);
assert.ok(!r.valido && r.total > 10);

// trilho de círculo: 1º + aprimoramento +2 PM = 3 PM = poder de 2º -> aviso
r = calcular({
  circulo: 1,
  eixos: { execucao: "padrao", alcance: "curto", duracao: "instantanea", alvo: { tipo: "alvos", qtd: 1 } },
  efeitos: { dano: { n: 2, faces: 6 } },
  aprimoramentos: [{ pm: 2, texto: "aumenta o dano em +2d6" }],
}, tabela);
assert.ok(r.avisos.some((a) => a.includes("2º círculo")));
assert.equal(circuloEfetivo(6), 3);
assert.equal(circuloEfetivo(2), 1);

// tarifas mineradas respondem
const s = sugerirPm("dano+:1d6", tarifas, 1);
assert.ok(s && s.pm >= 1 && s.n >= 5, JSON.stringify(s));
assert.ok(sugerirPm("efeito-inventado", tarifas, 1).generico);

// v5: Sono oficial agora fecha em 10 e é válido
r = calcular({
  circulo: 1,
  eixos: { execucao: "padrao", alcance: "curto", duracao: "cena", resistencia: "anula", teste: "Vontade", alvo: { tipo: "alvos", qtd: 1 } },
  efeitos: { condicoes: ["inconsciente"] },
}, tabela);
assert.equal(r.total, 10, `Sono: ${r.total}`);
assert.ok(r.valido, "Sono devia ser válido");

// v5: trava — paralisia em 2 alvos é bloqueada mesmo coubesse no orçamento
r = calcular({
  circulo: 1,
  eixos: { execucao: "padrao", alcance: "curto", duracao: "cena", resistencia: "parcial", teste: "Vontade", alvo: { tipo: "alvos", qtd: 2 } },
  efeitos: { condicoes: ["paralisado"] },
}, tabela);
assert.ok(r.bloqueada && !r.valido, "tier4 multi-alvo devia bloquear");

// v5: tier 3 em área bloqueia
r = calcular({
  circulo: 1,
  eixos: { execucao: "padrao", alcance: "pessoal", duracao: "cena", resistencia: "parcial", teste: "Vontade", alvo: { tipo: "area", tamanho: "p", forma: "cone" } },
  efeitos: { condicoes: ["atordoado"] },
}, tabela);
assert.ok(!r.valido, "tier3 em área devia bloquear");

// v5: alcance pessoal com alvo externo cobra como toque
r = calcular({
  circulo: 1,
  eixos: { execucao: "padrao", alcance: "pessoal", duracao: "instantanea", resistencia: "reduz-metade", alvo: { tipo: "alvos", qtd: 1 } },
  efeitos: { dano: { n: 2, faces: 8, fixo: 2 } },
}, tabela);
assert.equal(r.partes.alcance, tabela.eixos.alcance.toque, "pessoal+alvo devia virar toque");

// v5: dano com duração repete -> x1.5
r = calcular({
  circulo: 1,
  eixos: { execucao: "padrao", alcance: "curto", duracao: "sustentada", resistencia: "reduz-metade", alvo: { tipo: "alvos", qtd: 1 } },
  efeitos: { dano: { n: 2, faces: 6 } },
}, tabela);
assert.equal(r.partes.dano, 9, `dano repetível: ${r.partes.dano}`);

// v5: permanente numérico bloqueia
r = calcular({
  circulo: 1,
  eixos: { execucao: "padrao", alcance: "pessoal", duracao: "permanente", alvo: { tipo: "pessoal" } },
  efeitos: { bonus: 2 },
}, tabela);
assert.ok(!r.valido, "bônus permanente devia bloquear");

// v5: escopo do bônus multiplica; penalidade é ofensiva
r = calcular({
  circulo: 1,
  eixos: { execucao: "padrao", alcance: "pessoal", duracao: "cena", alvo: { tipo: "pessoal" } },
  efeitos: { bonus: 2, bonusEscopo: "combate" },
}, tabela);
assert.equal(r.partes.bonus, 7.5, `bônus combate: ${r.partes.bonus}`);
r = calcular({
  circulo: 1,
  eixos: { execucao: "padrao", alcance: "curto", duracao: "cena", resistencia: "anula", teste: "Vontade", alvo: { tipo: "alvos", qtd: 1 } },
  efeitos: { penalidade: 2 },
}, tabela);
assert.equal(r.partes.penalidade, 5, `penalidade: ${r.partes.penalidade}`);
assert.equal(r.partes.resistencia, tabela.eixos.resistencia.anula, "penalidade devia ser ofensiva");

// v5: tarifa do texto detecta delta e devolve régua
import { tarifaDoTexto } from "./static/custo.mjs";
const td = tarifaDoTexto("Aumenta o dano em +1d8.", { efeitos: { dano: { faces: 8 } } }, tarifas);
assert.ok(td && td.pm >= 1 && td.chave.includes("1d8"), JSON.stringify(td));

// v7: Bola de Fogo (2º, blast puro 6d6 esfera 6m, médio, reduz) fecha em 17/18
r = calcular({
  circulo: 2,
  eixos: { execucao: "padrao", alcance: "medio", duracao: "instantanea", resistencia: "reduz-metade", teste: "Reflexos", alvo: { tipo: "area", tamanho: "m", forma: "esfera" } },
  efeitos: { dano: { n: 6, faces: 6, fixo: 0, tipo: "fogo" } },
}, tabela);
assert.equal(r.total, 17, `Bola de Fogo: ${r.total}`);
assert.ok(r.valido, "Bola de Fogo devia ser válida");

// v7: com condição junto NÃO é blast puro (sem desconto) e cai na margem de aval
r = calcular({
  circulo: 2,
  eixos: { execucao: "padrao", alcance: "medio", duracao: "instantanea", resistencia: "reduz-metade", teste: "Reflexos", alvo: { tipo: "area", tamanho: "m", forma: "esfera" } },
  efeitos: { dano: { n: 6, faces: 6, fixo: 0, tipo: "fogo" }, condicoes: ["em chamas"] },
}, tabela);
assert.ok(!r.valido, "com condição devia passar do orçamento");
assert.ok(r.total > 18, `esperava >18: ${r.total}`);

// v7: margem do mestre marca precisaAval até +15%
r = calcular({
  circulo: 1,
  eixos: { execucao: "padrao", alcance: "curto", duracao: "cena", resistencia: "anula", teste: "Vontade", alvo: { tipo: "alvos", qtd: 1 } },
  efeitos: { condicoes: ["inconsciente"], custom: { texto: "ronca alto", pontos: 1 } },
}, tabela);
assert.ok(!r.valido && r.precisaAval, `11/10 devia pedir aval: ${JSON.stringify({t:r.total,a:r.precisaAval})}`);

console.log("custo.mjs OK");
