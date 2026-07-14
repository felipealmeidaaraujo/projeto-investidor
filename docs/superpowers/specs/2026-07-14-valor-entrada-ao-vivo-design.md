# Valor da entrada ao vivo (métrica-herói) — Design

**Data:** 2026-07-14
**Projeto:** Investidor (PWA de trade de tênis na Betfair)
**Autor:** Felipe + Claude (brainstorm)

## Contexto e virada

O Felipe opera **quase tudo ao vivo** (entra com o jogo rolando), não pré-jogo. Isso invalida o
CLV pré-jogo como métrica-herói: comparar uma odd pega ao vivo com o fechamento pré-jogo não mede
nada útil. A métrica que reflete o que ele faz é o **valor da entrada ao vivo**: comparar a odd que
ele pegou com a **odd justa naquele placar**, calculada pelo motor ao vivo que já existe
(`web/src/inplay.js`, usado na tela "Trade ao vivo").

## Decisões travadas (brainstorm 2026-07-14)

- **Métrica-herói:** valor da entrada ao vivo (esta entrega). **CLV pré-jogo** vira secundário
  (Entrega 2, captura tennis-data — outro spec).
- **Registro:** cada trade de Match Odds guarda **em qual jogador entrou** (`side`) e **back/lay**
  (`dir`), e um marcador **pré-jogo vs ao vivo** (`entryType`).
- **Fluxo primário:** registrar **na hora, direto da tela "Trade ao vivo"** — o placar já montado e
  a prob pré-jogo vão junto pro registro.
- **Ressalva honesta (mostrar na UI):** a odd justa vem do *nosso* modelo (bom, mas não bate o
  mercado). É termômetro da leitura, não a verdade do mercado.

## Escopo desta entrega

Métrica de valor ao vivo ponta a ponta: campos novos no registro, cálculo da odd justa ao vivo,
o valor da entrada, e o herói no Histórico. Frontend/local — sem robô, sem tennis-data.

## Fora de escopo (Entrega 2)

Captura automática do CLV pré-jogo (tennis-data + robô publica `closings.json` + cliente cruza).
Alimenta o card **secundário** de CLV pré-jogo (que já existe da fase 1). Terá seu próprio spec.

## Modelo de dados — campos novos no trade

Gravados por `makeTrade`. Só para Match Odds (os outros mercados ignoram):

- `entryType`: `'live'` | `'pre'` — ao vivo ou pré-jogo.
- `side`: `'a'` | `'b'` — em qual jogador do confronto entrou.
- `dir`: `'back'` | `'lay'` — direção da entrada.
- Para `entryType === 'live'`:
  - `liveState`: `{ setsA, setsB, gamesA, gamesB, serverIsA, bestOf }` — placar da entrada.
  - `liveFairOdd`: odd justa ao vivo **do jogador do `side`**, no momento da entrada.
  - `liveValue`: valor da entrada em % = `clvPct(oddEntry, liveFairOdd, dir)`.

Campos da fase 1 continuam: `clv`/`oddClose` (CLV pré-jogo, agora calculado com `dir`).

## Componentes

### 1. `web/src/inplay.js` — extrair `liveFairOdds` (função pura)

Hoje o cálculo está inline em `renderLive` (app.js). Extrair para reuso e teste:

```js
/** Odd justa ao vivo de A e B, dado a prob pré-jogo de A e o placar. */
export function liveFairOdds(preProbA, state, { base = 0.64, bestOf = 3 } = {}) {
  const { pA, pB } = impliedServeProbs(preProbA, { base, bestOf });
  const probA = winProbFromState(state, pA, pB, bestOf);
  const probB = 1 - probA;
  return { probA, probB, fairOddA: 1 / probA, fairOddB: 1 / probB };
}
```

`renderLive` passa a usar `liveFairOdds` (DRY — mesmo número na tela e no registro).

### 2. `web/src/finance.js` — `clvPct`/`beatClose` com direção

A conta de valor no **lay** é invertida (odd baixa é boa). Estender, mantendo `'back'` como default
(retrocompat total com a fase 1):

```js
/** Valor (%) da odd pega vs. uma referência (fechamento ou odd justa ao vivo). */
export function clvPct(oddsTaken, oddsRef, side = 'back') {
  return side === 'lay' ? (oddsRef / oddsTaken - 1) * 100 : (oddsTaken / oddsRef - 1) * 100;
}
/** A odd pega superou a referência? (back: maior; lay: menor) */
export function beatClose(oddsTaken, oddsRef, side = 'back') {
  return side === 'lay' ? oddsTaken < oddsRef : oddsTaken > oddsRef;
}
```

### 3. `web/src/trade.js` — `makeTrade` estendido

Recebe `side`, `dir`, `entryType`, `liveState`, `liveFairOdd` no input. Guarda os campos e calcula
`liveValue` (ao vivo) e `clv` (pré-jogo manual, agora com `dir`). `makeTrade` continua **puro** — o
app calcula `liveFairOdd` antes (precisa do motor+prob) e passa pronto.

### 4. `web/src/stats.js` — generalizar por campo

As funções da fase 1 ganham um parâmetro `field` (default `'clv'`, retrocompat):
`clvStats(trades, field='clv')`, `clvTrend(trades, field='clv')`, `clvBySegment(trades, field='clv', key)`.
Assim o herói ao vivo usa `clvStats(trades, 'liveValue')` e o card secundário usa `clvStats(trades, 'clv')`,
sem duplicar lógica.

### 5. `web/app.js` — registro

No `renderRegistrar`, quando `reg.market === 'Match Odds'`, campos novos (chips por toque):
- **Tipo de entrada:** `[Pré-jogo] [Ao vivo]` → `reg.entryType`.
- **Entrei em:** `[nome A] [nome B]` → `reg.side` (só com confronto definido).
- **Direção:** `[Back] [Lay]` → `reg.dir`.
- Se `entryType === 'live'`: **placar da entrada** (reaproveita os steppers de sets/games + "quem
  saca" + "melhor de" da tela Trade ao vivo), pré-preenchido de `reg.liveState` e editável; e um
  feedback com a **odd justa ao vivo** + o **valor** calculados na hora.

`regValid()`: para Match Odds, exige `entryType`, `side`, `dir`; se `entryType==='live'`, exige
`reg.preProbA` presente (a prob pré-jogo do confronto, para a odd justa).

`saveTrade()`: se `entryType==='live'`, calcula `liveFairOdd` via
`liveFairOdds(reg.preProbA, reg.liveState, { base, bestOf })` (base: WTA 0,56 / ATP 0,64), escolhe
`fairOddA`/`fairOddB` conforme `side`, e passa a `makeTrade`.

**Prob pré-jogo (`reg.preProbA`):** vem do fluxo do Trade ao vivo (ver 6). Se o Felipe marcar "ao
vivo" no registro **sem** ter vindo de lá, calcular sob demanda: `ensureModel(tour)` +
`matchPlayer(reg.players.a/b, model.players)` (de `match-names.js`, casa fullName↔modelo) +
`analyzeMatch(...)` → `probA`. Guardar em `reg.preProbA`. Se não casar os jogadores, avisar que o
valor ao vivo não pode ser medido nesse confronto (segue sem `liveValue`).

### 6. `web/app.js` — atalho do "Trade ao vivo"

O botão `btn-reg-conf` ("Registrar trade neste confronto") hoje leva confronto+superfície+tour pro
registro. Estender: quando `anal.live.active`, levar também `entryType:'live'`,
`liveState: {...anal.live}` (sem `active`) e `preProbA: r.probA`. Assim o registro abre com o placar
e a prob prontos.

### 7. `web/app.js` — herói no Histórico

No topo do `renderHistorico`, a métrica-herói passa a ser o **valor ao vivo**:
- **Herói** (reusa `.clv-hero`): "Valor médio ao vivo — sua leitura", valor grande (verde se >0),
  pills (beat rate = "X% entrou com valor", nº medidas), tendência (`clvTrend(trades,'liveValue')`).
  Estado vazio educativo quando não há trades ao vivo medidos.
- **Quebra por superfície** do valor ao vivo (`clvBySegment(trades,'liveValue','surface')`). Sem
  quebra por mercado (ao vivo é só Match Odds).
- **Card secundário** "CLV pré-jogo" (o `clvBlock` atual da fase 1, rebaixado): média + beat rate +
  nº, só aparece se houver trades pré-jogo com `clv`.

## Fluxo de dados

Trade ao vivo (aba Análise) → monta placar → `btn-reg-conf` leva `{players, surface, tour,
entryType:'live', liveState, preProbA}` → registro (placar editável, odd justa/valor ao vivo) →
Felipe completa side/dir/odd/stake/resultado → `saveTrade` calcula `liveFairOdd` → `makeTrade` grava
`liveValue` → store (Supabase) → Histórico mostra o herói de valor ao vivo.

## Edge cases

- **Prob pré-jogo indisponível** (jogadores não casam o modelo, ex.: nome digitado à mão): não mede
  valor ao vivo; salva o trade sem `liveValue` e avisa.
- **Placar impossível** (ex.: 2 sets a 0 num "melhor de 3" já é fim): o motor retorna prob 1/0 →
  odd justa 1.0; tratar divisão (prob 0 → sem valor). Guardar `liveState` mesmo assim.
- **Trade não-Match-Odds** (Handicap/Over-Under): sem `entryType`/`side`/`dir`/valor ao vivo.
- **Trade da fase 1 / simulação:** sem `liveValue` → não entra no herói ao vivo (estado vazio).
- **`liveValue`/`clv` não-finito:** já filtrado por `Number.isFinite` (fase 1).

## Testes (`node --test`)

- `inplay.test.js`: `liveFairOdds` — placar inicial ≈ odd justa pré-jogo; placar favorável baixa a
  odd do líder; simetria A/B.
- `finance.test.js`: `clvPct`/`beatClose` no **lay** (invertido) e retrocompat do back.
- `trade.test.js`: `makeTrade` grava `side`/`dir`/`entryType`/`liveState`/`liveFairOdd`/`liveValue`;
  `liveValue` = `clvPct(oddEntry, liveFairOdd, dir)`.
- `stats.test.js`: `clvStats`/`clvTrend`/`clvBySegment` com `field='liveValue'`.

## Verificação

`npm test` verde; `npm run dev` + preview isolado (como na fase 1) exercitando: registrar uma
entrada ao vivo a partir do Trade ao vivo, conferir a odd justa/valor, e o herói no Histórico
(estados com e sem dados). Revisão adversarial do diff antes de publicar.

## Entrega

Pronto + testes verdes + verificado → merge no `main` + push (autorização permanente do Felipe).
