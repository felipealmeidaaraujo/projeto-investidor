# Dossiê completo + dados de saque WTA — Design

- **Data:** 2026-07-14
- **Status:** Aprovado (brainstorming) — pronto para virar plano
- **Área:** `web/` (app), `pipeline/` (Node), `.github/workflows/` (CI)
- **Antecede:** [[2026-07-14-explicacao-pontuacoes-analise-design]] (mesma ideia, no card de leitura)

## Problema

O dossiê do jogador mostra Elo, tags, Elo por superfície com rank e stats de saque em
números crus. Dois problemas:
1. Não se sabe **o que** cada coisa é nem **como ler** (o piso, as tags, o rank, os %).
2. Os percentuais de saque **enganam sem referência** ("40% de devolução" parece pouco, mas
   no ATP é elite).
3. **A WTA não tem stats de saque no modelo** — o dossiê feminino fica pela metade.

O usuário quer o sistema **o mais completo possível**: incluir os dados de saque da WTA
agora, não depois.

## Objetivo

1. Trazer **stats de saque/devolução para a WTA** (novo dado no `model-wta.json`).
2. Dar **referência inline** a cada stat (elite / acima / na média / abaixo), com faixas
   **por circuito** (ATP e WTA têm distribuições bem diferentes).
3. Tornar as **tags automáticas por circuito** (limiares de saque de ATP não servem pra WTA).
4. Adicionar a **faixa "O que significam esses números?"** no dossiê (padrão do card de leitura).

## Descoberta de viabilidade (já validada)

- **Fonte WTA:** `Aneeshers/tennis-sackmann-archive` (espelho mantido do Sackmann) via
  **jsDelivr** (`https://cdn.jsdelivr.net/gh/Aneeshers/tennis-sackmann-archive@main/wta/wta_matches_${ano}.csv`).
  Colunas idênticas ao Sackmann (`w_ace`, `w_svpt`, `w_1stIn`, `w_bpSaved`, `l_svpt`…).
  Sackmann direto e o mirror TML **não** cobrem WTA; este archive cobre e é acessível em CI.
- **Cobertura:** 92–98% das partidas com stats; **~210 de 211 jogadoras ativas** enriquecidas.
- **Números batem** com a realidade (Swiatek/Gauff devolução de elite, Rybakina mais aces,
  Gauff saque fraco). Validado end-to-end com `serveProfile` + `matchPlayer`.

## Escopo

**Dentro:**
- Enriquecer `model-wta.json` com perfil de saque (fonte archive) + ligar no robô diário.
- `serveBand(tour, key, value)` — classifica um stat na banda, **por circuito**.
- `playerTags(player, tour)` — limiares de saque **por circuito** (ATP mantém os atuais).
- Referência inline nos stats do dossiê (ATP **e** WTA).
- Faixa colapsável de explicação no dossiê.

**Fora:**
- Mini-barras visuais (escolhido rótulo de texto).
- Repensar nomes "piso"/"força" (mantidos).
- Trocar a fonte do ATP (segue TML, que funciona).

## Design

### 1. Pipeline: saque da WTA

Refatorar `pipeline/serve-stats.js` para servir **os dois circuitos**:
- Extrair o núcleo (baixar anos → `accumulate` → `matchPlayer` → enriquecer modelo → gravar)
  numa função `enrichServe({ modelFile, urlFor, label })`. `serveProfile`/`accumulate`
  continuam puros e reutilizados.
- **Guardar `main()` atrás de checagem de módulo principal** (`import.meta.url === pathToFileURL(process.argv[1]).href`) — hoje `main()` roda no import, o que atrapalha testes/reuso.
- `main()` roda ATP (TML, como hoje) **e** WTA (archive), cada um com sua `urlFor(ano)` e seu
  `modelFile`. Janela de anos: `to-3 … to` (igual hoje). Limiar de inclusão: `svpt > 500`.
- Bônus: o WTA passa a ter `fullName` (melhora a busca de foto na Wikipédia).

Fontes:
- ATP: `https://raw.githubusercontent.com/Tennismylife/TML-Database/master/${ano}.csv`
- WTA: `https://cdn.jsdelivr.net/gh/Aneeshers/tennis-sackmann-archive@main/wta/wta_matches_${ano}.csv`

Gerar e **commitar** `web/model-wta.json` já enriquecido (pra o app publicado ter o dado).

### 2. Faixas de referência por circuito

`serveBand(tour, key, value) → { band, label } | null`
- `band` ∈ `elite | high | mid | low`; `label` = `elite | acima da média | na média | abaixo da média`.
- `null` se a métrica não tem faixa ou `value <= 0`.
- Tabela `SERVE_BANDS[tour][key] = { lo, mid, hi }`; regra: `≥hi`→elite, `≥mid`→high, `≥lo`→mid, senão low.

**Limiares (fração 0–1), tirados dos dados reais (ATP n=176; WTA n=191 ativas):**

| Métrica | ATP lo / mid / hi | WTA lo / mid / hi |
|---|---|---|
| `servePtsWonPct` | 0.610 / 0.634 / 0.680 | 0.537 / 0.558 / 0.594 |
| `firstInPct` | 0.590 / 0.626 / 0.670 | 0.585 / 0.627 / 0.686 |
| `acePct` | 0.050 / 0.073 / 0.110 | 0.020 / 0.033 / 0.064 |
| `returnPtsWonPct` | 0.340 / 0.357 / 0.400 | 0.413 / 0.431 / 0.454 |
| `bpSavedPct` | 0.580 / 0.613 / 0.660 | 0.506 / 0.542 / 0.583 |

`lo`=p20, `mid`=mediana, `hi`=p90 do circuito. Cores: elite=verde, high=verde-dim,
mid=cinza, low=âmbar. Sem pill se `value<=0`.

### 3. Tags por circuito

`playerTags(player, tour)` — tabela `SERVE_TAG_THRESHOLDS[tour]`. Os cortes **elite/low de
cada banda = limiares forte/fraco da tag** (por construção, rótulo e tag nunca se contradizem).
ATP mantém exatamente os limiares atuais; WTA recebe os novos:

| Tag | ATP | WTA |
|---|---|---|
| Saque forte / fraco | ≥0.68 / <0.61 | ≥0.594 / <0.537 |
| Muitos aces | ≥0.11 | ≥0.064 |
| Devolvedor(a) forte / Devolve pouco | ≥0.40 / <0.34 | ≥0.454 / <0.413 |
| Salva break points / Vacila | ≥0.66 / <0.58 | ≥0.583 / <0.506 |

As tags de superfície (Especialista/Rende menos, ±60 de Elo) são independentes de circuito —
inalteradas.

### 4. Dossiê: referência inline + faixa

- Cada linha de saque ganha a pill de `serveBand(anal.tour, key, valor)` à direita do valor.
- A seção de saque passa a aparecer **sempre que `player.serve` existir** (ATP e WTA). O aviso
  "só ATP por enquanto" **sai**.
- **Faixa "O que significam esses números?"** no fim do dossiê, fechada por padrão, mesmo
  visual do card de leitura (`.explain-*`), com blocos:
  1. **Elo — o nível geral** (+ o que são os "N jogos").
  2. **As tags coloridas** (verde força / âmbar relativo / vermelho fraqueza; de onde saem).
  3. **Elo por superfície & rank** (o que é o piso; o que é "top 10 no circuito").
  4. **Saque & devolução** *(só quando há `player.serve`)* — como ler as etiquetas de referência,
     com o exemplo "40% de devolução parece pouco, mas no ATP é elite".
- `openDossier` vira **re-renderizável** (um `draw()` interno, como `openCalculator`), guardando
  `explainOpen` no closure; `loadPhoto(player)` é chamado ao fim de cada `draw()` (usa
  `photoCache`, não refaz fetch). O toggle chama `draw()`.

### 5. Robô diário (CI)

`.github/workflows/update-model.yml` já roda `node pipeline/serve-stats.js` após treinar.
Com a refatoração, esse mesmo comando passa a enriquecer **ATP e WTA**. Verificar que o job
republica os dois modelos. (jsDelivr é acessível no runner.)

## Arquitetura / onde mexer

- `pipeline/serve-stats.js`: refatorar (função `enrichServe`, guard de `main`, roda ATP+WTA).
- `web/model-wta.json`: regenerar com `serve` + `fullName` e commitar.
- `web/src/analysis.js`: `SERVE_BANDS`, `serveBand(tour,key,value)`, `SERVE_TAG_THRESHOLDS`,
  `playerTags(player, tour)` (assinatura nova).
- `web/app.js`: `openDossier` re-renderizável + pills de referência + faixa + `playerTags(player, anal.tour)`.
- `web/styles.css`: `.refpill` + variantes; reaproveita `.explain-*`.
- `tests/`: `serveBand` (ATP e WTA), `playerTags` por circuito, `serveProfile`/`enrichServe` puros.

**Sem** mexer no service worker.

## Estados de borda

1. **Jogador sem `serve`** (dados faltando): seção de saque some; faixa omite o bloco 4.
2. **Métrica zero/ausente**: sem pill.
3. **Piso ausente numa superfície**: linha já é omitida hoje — mantém.
4. **Nome não casado** no pipeline: jogador fica sem `serve` (sem erro).

## Testes

- `serveBand`: por circuito, cada banda e o `null` (valor 0 / chave desconhecida). Prova da
  diferença por circuito com `returnPtsWonPct=0.42`: **WTA → mid** ("na média", pois lo=0.413,
  mid=0.431) mas **ATP → elite** (hi=0.40). E `0.46` → elite nos dois.
- `playerTags`: mesma jogadora com devolução 0.45 → **sem** "Devolvedora forte" na WTA
  (limiar 0.454) mas seria forte no ATP (limiar 0.40).
- `serveProfile`/`accumulate`: já testados; manter.
- Pipeline WTA: teste do `enrichServe` com CSV de fixture pequeno (sem rede) → confirma
  enriquecimento e cálculo.
- Dossiê/toggle: verificação manual no navegador (via DOM).

## Fora de escopo / futuro

- Trocar a fonte do ATP para o archive (unificar) — possível, mas TML funciona; fica pra depois.
- Repensar "piso"/"força".
