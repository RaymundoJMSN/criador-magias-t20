# Criador de Magias T20 — Design

Data: 2026-08-25. Aprovado por Ray na conversa.

## Objetivo

Site em `magias.raynathus.com.br` (repo público `RaymundoJMSN/criador-magias-t20`) para criar
magias próprias de Tormenta 20 por compra de pontos, calibrado contra as 275 magias oficiais
(101 de 1º círculo). Escopo inicial: **só 1º círculo**; círculos 2–5 reaproveitam a máquina.

## Modelo de balanceamento (aprovado)

**A — Eixos com linha de base.** Toda magia tem os mesmos eixos técnicos (execução, alcance,
área/alvo, duração, resistência, dano, condição, efeito custom). O perfil mais comum nas
oficiais custa 0 em cada eixo; subir custa pontos, descer devolve. Orçamento do 1º círculo:
**10 pts**. Desvantagens devolvem no máximo **−4** (anti-munchkin). Soma linear.

**Aprimoramentos não gastam pontos de construção** — pagam-se em PM pela tarifa padrão do
jogo, minerada dos ~600 aprimoramentos oficiais (+1 PM ≈ +1d6 / +1 alvo; +2 PM ≈ upgrade de
alcance/área; truque = de graça). **Trilho de círculo efetivo**: PM total → 1=1º, 3=2º, 6=3º,
10=4º, 15=5º; aprimoramento que estoura o trilho ganha tag "requer Xº círculo" (sugerida, não
proibida). Efeito custom: campo livre com preço manual + galeria de exemplos precificados.
Aprovação final é sempre do mestre — o app dá régua e alertas, não veto.

## Mineração (requisito do Ray: artefato permanente, legível por máquina)

Ferramentas Python stdlib em `tools/`, entrada `../magias-t20/magias-t20.json` (local,
**fora do repo** — descrições são da Jambo).

- `minerar.py` → **`../magias-t20/dataset.json`**: TODAS as magias 100% estruturadas
  (execução/alcance/duração/resistência categorizados, dano `XdY+Z` + média, cura, condições
  canônicas, área com forma+metros, aprimoramentos classificados por delta). É O artefato
  reutilizável: futuras minerações, círculos novos e revisões consultam ele, nunca
  re-extraem do HTML. Guarda versão, hash da fonte e % de cobertura da classificação.
- Derivados **sem texto autoral** (estes sim commitados no repo): `data/features.json`
  (stats numéricos por magia), `data/tarifas-pm.json` (delta→custo PM com frequências),
  `data/tabela-custos.json` (preços dos eixos), `data/exemplos.json` (oficiais reconstruídas,
  só números e nome).
- `calibrar.py` → roda as 101 oficiais de 1º círculo na tabela; meta mediana 10 pts, grosso
  8–12; outliers anotados. É o teste de regressão da tabela.

## Arquitetura

- Front vanilla (`static/index.html` + `app.js` + `style.css`), tema escuro, sem build.
- **`static/custo.mjs`** = motor de custo puro, importado pelo browser e pelo server
  (server valida orçamento no PUT — não confia no client).
- `server.mjs` Node puro, porta **8070**, padrão data-rpg: login por nome,
  `GET /api/state`, `PUT /api/user/<nome>`, escrita atômica, backup 7 dias, `--check`.
  Compartilhar: magia publicada ganha `/m/<id>` só-leitura.
- Deploy: `deploy/deploy.ps1`, systemd `criador-magias.service`, nginx+certbot
  `magias.raynathus.com.br` (devilsworks/Oracle).

## Dados (magia do usuário)

```json
{ "id", "autor", "nome", "escola", "tipo", "circulo": 1,
  "eixos": { "execucao", "alcance", "area", "duracao", "resistencia",
             "dano", "condicao", "efeitoCustom": {"texto", "pontos"} },
  "aprimoramentos": [{ "custoPm", "texto", "deltas" }],
  "pontos": { "gasto", "orcamento": 10 }, "status": "rascunho|publicada" }
```

## UI (1 tela)

Form de eixos + medidor ao vivo `7/10` + aprimoramentos (templates da tarifa, custom com
preço sugerido, alerta quando foge da régua) + preview em bloco de magia T20 + galeria
(minhas/públicas/exemplos) + copiar texto/link.

## Fases

1. Mineração → dataset permanente. 2. Tarifas + tabela + calibração. 3. Motor `custo.mjs`.
4. UI. 5. Server + deploy. Testes: `calibrar.py`, `node server.mjs --check`, casos-limite
do motor.
