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

console.log("custo.mjs OK");
