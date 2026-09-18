# Criador de Magias T20

Crie magias próprias de **Tormenta 20** por compra de pontos, com balanceamento calibrado
contra as 275 magias oficiais. Online em [magias.raynathus.com.br](https://magias.raynathus.com.br).

## Como funciona

- Toda magia de 1º círculo tem **10 pontos** de orçamento. Cada escolha técnica (dado de
  dano, alcance, área, duração, resistência, condição...) custa ou devolve pontos, com
  preços em [`data/tabela-custos.json`](data/tabela-custos.json).
- Desvantagens (toque, execução completa...) devolvem no máximo **−4**.
- **Aprimoramentos** não gastam pontos: pagam-se em PM pela tarifa minerada dos ~750
  aprimoramentos oficiais ([`data/tarifas-pm.json`](data/tarifas-pm.json)), com o trilho
  de círculo do jogo (1 PM=1º, 3=2º, 6=3º, 10=4º, 15=5º).
- **Efeito custom**: descreva o efeito e precifique com a galeria de referência
  ([`data/exemplos.json`](data/exemplos.json)) — preços derivados das magias oficiais.
  Aprovação final é sempre do mestre.

## Grimório: magias e poderes

A página `/` tem duas abas com o mesmo mecanismo de busca (mesmas palavras,
mesmos sinônimos, mesma mesa de cartas):

- **magias** — as 275 oficiais + as publicadas pela mesa, com filtro
  **🧪 permitido em poção** (LB p. 341: só magia com alvo criatura/objeto ou com
  área vira item de uso único). O nome do frasco muda com o alvo — objeto = óleo,
  área = granada —, então a carta mostra "pode virar *granada de Bola de Fogo*".
  A regra é a mesma do módulo `t20-fabricar` ([`static/pocao.mjs`](static/pocao.mjs),
  `node static/pocao.mjs --check`);
- **poderes** — 1.612 poderes oficiais (`/api/poderes`), filtráveis por categoria
  (combate, destino, magia, tormenta, classe, habilidade de classe, racial,
  origem, concedido, distinção…) e por livro. `/d/<slug>` abre um poder direto.

```
node tools/minerar-poderes.mjs          # -> dados/poderes.json (local, fora do repo)
node tools/minerar-poderes.mjs --check  # self-test do parser
```

Duas fontes, porque nenhuma cobre tudo: o compêndio do sistema Tormenta20 do
**Foundry** (LevelDB — Livro Básico e Distinções, com categoria, página e PM
prontos) e os markdowns de **`tormenta-livros`** (Heróis de Arton, Dragão Brasil e
Deuses de Arton, que compêndio nenhum traz por inteiro). Nome repetido fica com a versão do
compêndio. Caminhos por env: `FOUNDRY_DIR`, `T20_LIVROS`. O server lê o arquivo uma
vez e guarda em memória — depois de minerar de novo, reiniciar (o deploy já faz).

## Mineração / calibração

`tools/` (Python 3 stdlib, sem dependências) minera o dataset de magias e calibra a tabela:

```
python tools/minerar.py     # magias -> dataset estruturado (local, fora do repo)
python tools/tarifas.py     # tarifa PM dos aprimoramentos -> data/tarifas-pm.json
python tools/features.py    # stats numéricos por magia -> data/features.json
python tools/calibrar.py    # reconstrói as oficiais com a tabela; teste de regressão
python tools/exemplos.py    # galeria de preços de referência -> data/exemplos.json
python tools/minerar_escolas.py  # perfil profundo por escola -> data/perfil-escolas.json (permanente)
python tools/regras_escolas.py   # deriva as regras de escola da tabela a partir do perfil
python tools/minerar_padroes.py  # padrões que viram regra -> data/padroes-corpus.json (permanente)
```

`padroes-corpus.json` guarda a evidência das regras que não são preço: quais oficiais
deixam **escolher o tipo de dano** na hora (e que faixa de custo cada lista mistura),
toda **CD fixa** escrita numa magia, qual **modo de resistência** cada tipo de efeito usa
(dano+condição = `parcial` em 17 de 21; `reduz-metade` em zero) e as magias com
**condições alternativas**.

O repo só versiona números e categorias — **nenhum texto das magias**. Tormenta 20
pertence à Jambo Editora; este projeto é uma ferramenta de fã, sem conteúdo oficial.

## Rodar

```
node server.mjs             # http://localhost:8070 (grimório; criador em /criar)
node server.mjs --check     # self-test
node test-custo.mjs         # motor de custo
node test-oficiais.mjs      # 28 oficiais recriadas à mão, com a faixa esperada
node test-corpus.mjs        # passa as 275 oficiais mineradas pelo motor (0 podem ser bloqueadas)
node tools/minerar-poderes.mjs --check   # parser dos poderes
```
