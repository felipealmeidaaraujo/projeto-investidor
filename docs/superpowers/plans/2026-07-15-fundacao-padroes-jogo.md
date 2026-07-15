# Fundação: motor de padrões de jogo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir as funções puras que transformam o placar (`score`) e as estatísticas de break point de cada partida nos padrões de estilo e de pressão que a plataforma vai exibir por jogador.

**Architecture:** Um módulo novo `pipeline/game-patterns.js` com funções puras (sem rede, sem I/O), testável offline. É a peça-fundação: os próximos planos (ingestão enriquecida, telas) consomem essas funções. Segue o padrão dos módulos puros existentes (`pipeline/metrics.js`, `web/src/analysis.js`) e os testes seguem `tests/*.test.js` com `node:test`.

**Tech Stack:** Node.js (ESM, `type: module`), `node --test`, `node:assert/strict`. Zero dependências novas.

**Contexto do dado (importante):** No histórico do Sackmann o `score` é sempre da perspectiva do **vencedor da partida** (ex.: `3-6 6-4 6-4` = o vencedor perdeu o 1º set e virou). Tie-break vem como `7-6(5)` (o 5 é o placar do tie-break). Casos especiais: `W/O` (walkover, não jogado) e `... RET` (abandono no meio).

---

### Task 1: Parser do placar (`parseScore`)

**Files:**
- Create: `pipeline/game-patterns.js`
- Test: `tests/game-patterns.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScore } from '../pipeline/game-patterns.js';

test('parseScore: placar normal de 3 sets, vencedor primeiro', () => {
  const r = parseScore('6-4 3-6 7-5');
  assert.equal(r.walkover, false);
  assert.equal(r.incomplete, false);
  assert.deepEqual(r.sets, [
    { w: 6, l: 4, tb: null },
    { w: 3, l: 6, tb: null },
    { w: 7, l: 5, tb: null },
  ]);
});

test('parseScore: tie-break guarda o placar do TB', () => {
  const r = parseScore('7-6(5) 6-3');
  assert.equal(r.sets[0].tb, 5);
  assert.equal(r.sets[1].tb, null);
});

test('parseScore: walkover', () => {
  const r = parseScore('W/O');
  assert.equal(r.walkover, true);
  assert.equal(r.incomplete, true);
  assert.deepEqual(r.sets, []);
});

test('parseScore: abandono (RET) marca incompleto mas mantém os sets jogados', () => {
  const r = parseScore('6-3 1-2 RET');
  assert.equal(r.incomplete, true);
  assert.equal(r.walkover, false);
  assert.deepEqual(r.sets, [{ w: 6, l: 3, tb: null }, { w: 1, l: 2, tb: null }]);
});

test('parseScore: vazio devolve estrutura segura', () => {
  const r = parseScore('');
  assert.deepEqual(r, { sets: [], walkover: false, incomplete: false });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/game-patterns.test.js`
Expected: FAIL com `ERR_MODULE_NOT_FOUND` (o arquivo `pipeline/game-patterns.js` ainda não existe).

- [ ] **Step 3: Write minimal implementation**

Crie `pipeline/game-patterns.js`:

```javascript
// Funções puras que leem o placar (score do Sackmann) e derivam padrões de jogo.
// O score é sempre da perspectiva do VENCEDOR da partida. Testado em tests/game-patterns.test.js.

/** "6-4 3-6 7-6(5)" -> { sets:[{w,l,tb}], walkover, incomplete }.
 *  w/l = games do vencedor/perdedor da partida naquele set; tb = placar do tie-break (ou null). */
export function parseScore(score) {
  const raw = (score || '').trim();
  if (!raw) return { sets: [], walkover: false, incomplete: false };
  if (/^w\/o$/i.test(raw) || /walkover/i.test(raw)) return { sets: [], walkover: true, incomplete: true };
  const incomplete = /\b(ret|def|abn|abd)\b/i.test(raw);
  const sets = [];
  for (const tok of raw.split(/\s+/)) {
    const m = tok.match(/^(\d+)-(\d+)(?:\((\d+)\))?$/);
    if (!m) continue;
    sets.push({ w: Number(m[1]), l: Number(m[2]), tb: m[3] != null ? Number(m[3]) : null });
  }
  return { sets, walkover: false, incomplete };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/game-patterns.test.js`
Expected: PASS (5 testes de `parseScore`).

- [ ] **Step 5: Commit**

```bash
git add pipeline/game-patterns.js tests/game-patterns.test.js
git commit -m "feat(padroes): parser do placar (parseScore)"
```

---

### Task 2: Perspectiva do jogador (`firstSetWonByPlayer`, `isComeback`)

**Files:**
- Modify: `pipeline/game-patterns.js`
- Test: `tests/game-patterns.test.js`

- [ ] **Step 1: Write the failing test**

Adicione ao final de `tests/game-patterns.test.js`:

```javascript
import { firstSetWonByPlayer, isComeback } from '../pipeline/game-patterns.js';

test('firstSetWonByPlayer: vencedor da partida que ganhou o 1º set', () => {
  const p = parseScore('6-4 6-3');
  assert.equal(firstSetWonByPlayer(p, true), true);
});

test('firstSetWonByPlayer: perdedor da partida enxerga o 1º set invertido', () => {
  const p = parseScore('6-4 6-3'); // vencedor levou o 1º set -> perdedor perdeu o 1º set
  assert.equal(firstSetWonByPlayer(p, false), false);
});

test('firstSetWonByPlayer: perdedor que tinha levado o 1º set', () => {
  const p = parseScore('4-6 6-3 6-2'); // vencedor perdeu o 1º set -> perdedor GANHOU o 1º set
  assert.equal(firstSetWonByPlayer(p, false), true);
});

test('isComeback: vencedor que perdeu o 1º set virou o jogo', () => {
  assert.equal(isComeback(parseScore('4-6 6-3 6-2'), true), true);
  assert.equal(isComeback(parseScore('6-4 6-3'), true), false);
});

test('isComeback: perdedor nunca conta como virada', () => {
  assert.equal(isComeback(parseScore('4-6 6-3 6-2'), false), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/game-patterns.test.js`
Expected: FAIL — `firstSetWonByPlayer is not a function` / `isComeback is not a function`.

- [ ] **Step 3: Write minimal implementation**

Adicione a `pipeline/game-patterns.js`:

```javascript
/** O jogador ganhou o 1º set? `playerWon` diz se ele é o vencedor da partida (perspectiva do score). */
export function firstSetWonByPlayer(parsed, playerWon) {
  const s = parsed.sets[0];
  if (!s) return false;
  const winnerTookSet = s.w > s.l;
  return playerWon ? winnerTookSet : !winnerTookSet;
}

/** Virada: o jogador venceu a PARTIDA tendo perdido o 1º set. Só o vencedor pode virar. */
export function isComeback(parsed, playerWon) {
  return playerWon === true && parsed.sets.length > 0 && !firstSetWonByPlayer(parsed, true);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/game-patterns.test.js`
Expected: PASS (todos, incluindo os 5 novos).

- [ ] **Step 5: Commit**

```bash
git add pipeline/game-patterns.js tests/game-patterns.test.js
git commit -m "feat(padroes): perspectiva do jogador (1o set e virada)"
```

---

### Task 3: Padrões de estilo agregados (`stylePatterns`)

**Files:**
- Modify: `pipeline/game-patterns.js`
- Test: `tests/game-patterns.test.js`

`stylePatterns(games)` recebe `games` = lista de `{ won: boolean, score: string, minutes: number|null }` e devolve as taxas. Cada taxa é `{ pct, n }` onde `n` é o denominador (para o aviso de "poucos dados").

- [ ] **Step 1: Write the failing test**

Adicione ao final de `tests/game-patterns.test.js`:

```javascript
import { stylePatterns } from '../pipeline/game-patterns.js';

const GAMES = [
  { won: true, score: '6-4 6-3', minutes: 90 },       // ganhou 1o set, venceu, 2 sets
  { won: true, score: '4-6 6-3 6-2', minutes: 150 },  // perdeu 1o set, virou, 3 sets
  { won: false, score: '6-3 6-4', minutes: 80 },      // perdedor: perdeu o 1o set (6-3 do vencedor)
  { won: false, score: '4-6 6-3 7-6(4)', minutes: 170 }, // perdedor GANHOU o 1o set, perdeu em 3, TB no 3o
];

test('stylePatterns: taxa de ganhar o 1o set', () => {
  const r = stylePatterns(GAMES);
  // ganhou o 1o set em: jogo1(sim), jogo2(nao), jogo3(nao), jogo4(sim) = 2 de 4
  assert.equal(r.firstSet.n, 4);
  assert.equal(r.firstSet.pct, 50);
});

test('stylePatterns: taxa de virada quando perde o 1o set', () => {
  const r = stylePatterns(GAMES);
  // perdeu o 1o set em: jogo2, jogo3 = 2 jogos; venceu 1 deles (jogo2) = 50%
  assert.equal(r.comeback.n, 2);
  assert.equal(r.comeback.pct, 50);
});

test('stylePatterns: taxa de vitoria quando vai a 3 sets', () => {
  const r = stylePatterns(GAMES);
  // 3 sets em: jogo2(venceu), jogo4(perdeu) = 2 jogos; venceu 1 = 50%
  assert.equal(r.decider.n, 2);
  assert.equal(r.decider.pct, 50);
});

test('stylePatterns: aproveitamento em tie-break', () => {
  const r = stylePatterns(GAMES);
  // 1 tie-break no total (jogo4, 3o set 7-6); o jogador do jogo4 perdeu a partida...
  // o TB do 3o set: vencedor fez 7-6, entao quem perdeu a partida perdeu o TB.
  assert.equal(r.tieBreak.n, 1);
  assert.equal(r.tieBreak.pct, 0);
});

test('stylePatterns: duracao media ignora nulos', () => {
  const r = stylePatterns(GAMES);
  assert.equal(r.avgMinutes, Math.round((90 + 150 + 80 + 170) / 4));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/game-patterns.test.js`
Expected: FAIL — `stylePatterns is not a function`.

- [ ] **Step 3: Write minimal implementation**

Adicione a `pipeline/game-patterns.js`:

```javascript
const rate = (num, den) => ({ pct: den ? Math.round((num / den) * 100) : null, n: den });

/** Um tie-break do ponto de vista do jogador: ele o venceu?
 *  No set com tb != null, o vencedor da partida ganhou o TB sse w > l naquele set. */
function tieBreaksFor(parsed, playerWon) {
  let won = 0, total = 0;
  for (const s of parsed.sets) {
    if (s.tb == null) continue;
    total++;
    const winnerTookTb = s.w > s.l;
    if (playerWon ? winnerTookTb : !winnerTookTb) won++;
  }
  return { won, total };
}

/** Agrega os padrões de estilo de um jogador a partir dos jogos dele. */
export function stylePatterns(games) {
  let firstWon = 0, firstN = 0;
  let comebackWon = 0, comebackN = 0;
  let deciderWon = 0, deciderN = 0;
  let tbWon = 0, tbN = 0;
  let minSum = 0, minN = 0;
  for (const g of games) {
    const p = parseScore(g.score);
    if (!p.sets.length) continue;
    const gotFirst = firstSetWonByPlayer(p, g.won);
    firstN++; if (gotFirst) firstWon++;
    if (!gotFirst) { comebackN++; if (g.won) comebackWon++; }
    if (p.sets.length >= 3) { deciderN++; if (g.won) deciderWon++; }
    const tb = tieBreaksFor(p, g.won);
    tbN += tb.total; tbWon += tb.won;
    if (Number.isFinite(g.minutes)) { minSum += g.minutes; minN++; }
  }
  return {
    firstSet: rate(firstWon, firstN),
    comeback: rate(comebackWon, comebackN),
    decider: rate(deciderWon, deciderN),
    tieBreak: rate(tbWon, tbN),
    avgMinutes: minN ? Math.round(minSum / minN) : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/game-patterns.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add pipeline/game-patterns.js tests/game-patterns.test.js
git commit -m "feat(padroes): padroes de estilo agregados (stylePatterns)"
```

---

### Task 4: Padrões de pressão / quebra (`pressurePatterns`)

**Files:**
- Modify: `pipeline/game-patterns.js`
- Test: `tests/game-patterns.test.js`

`pressurePatterns(games)` recebe `games` = lista de `{ bpFaced, bpSaved, svGms, oppBpFaced, oppBpSaved }` (números por partida, já do ponto de vista do jogador — `opp` = adversário). Devolve as taxas de pressão. Quebra sofrida = `bpFaced - bpSaved`; quebra convertida = `oppBpFaced - oppBpSaved`.

- [ ] **Step 1: Write the failing test**

Adicione ao final de `tests/game-patterns.test.js`:

```javascript
import { pressurePatterns } from '../pipeline/game-patterns.js';

const BP = [
  { bpFaced: 4, bpSaved: 3, svGms: 10, oppBpFaced: 6, oppBpSaved: 3 },
  { bpFaced: 2, bpSaved: 2, svGms: 8, oppBpFaced: 4, oppBpSaved: 1 },
];

test('pressurePatterns: salva break points (salvos / enfrentados)', () => {
  const r = pressurePatterns(BP);
  // salvos 3+2=5, enfrentados 4+2=6 -> 83%
  assert.equal(r.bpSavedPct, Math.round((5 / 6) * 100));
});

test('pressurePatterns: quebras sofridas por jogo de saque', () => {
  const r = pressurePatterns(BP);
  // sofridas = (4-3)+(2-2)=1 ; games de saque = 18 -> 0.06 por game
  assert.equal(r.breaksAgainstPerSvGm, Math.round((1 / 18) * 100) / 100);
});

test('pressurePatterns: quebras convertidas na devolucao', () => {
  const r = pressurePatterns(BP);
  // convertidas = (6-3)+(4-1)=6
  assert.equal(r.breaksFor, 6);
});

test('pressurePatterns: pressao criada (break points gerados na devolucao)', () => {
  const r = pressurePatterns(BP);
  // bp criados = oppBpFaced total = 6+4 = 10
  assert.equal(r.bpCreated, 10);
});

test('pressurePatterns: lista vazia devolve nulos, nao quebra', () => {
  const r = pressurePatterns([]);
  assert.equal(r.bpSavedPct, null);
  assert.equal(r.breaksFor, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/game-patterns.test.js`
Expected: FAIL — `pressurePatterns is not a function`.

- [ ] **Step 3: Write minimal implementation**

Adicione a `pipeline/game-patterns.js`:

```javascript
/** Agrega padrões de pressão/quebra de um jogador a partir dos break points por partida. */
export function pressurePatterns(games) {
  let bpFaced = 0, bpSaved = 0, svGms = 0, oppBpFaced = 0, oppBpSaved = 0;
  for (const g of games) {
    bpFaced += g.bpFaced || 0;
    bpSaved += g.bpSaved || 0;
    svGms += g.svGms || 0;
    oppBpFaced += g.oppBpFaced || 0;
    oppBpSaved += g.oppBpSaved || 0;
  }
  const breaksAgainst = bpFaced - bpSaved;
  return {
    bpSavedPct: bpFaced ? Math.round((bpSaved / bpFaced) * 100) : null,
    breaksAgainstPerSvGm: svGms ? Math.round((breaksAgainst / svGms) * 100) / 100 : null,
    breaksFor: oppBpFaced - oppBpSaved,
    bpCreated: oppBpFaced,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/game-patterns.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add pipeline/game-patterns.js tests/game-patterns.test.js
git commit -m "feat(padroes): padroes de pressao e quebra (pressurePatterns)"
```

---

### Task 5: Rodar a suíte completa e verificar

**Files:** nenhum (verificação).

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: PASS em tudo — os testes antigos (banca, elo, ingest, espn…) continuam verdes e os novos de `game-patterns` passam. Nenhum warning.

- [ ] **Step 2: Confirmar a saída limpa**

Se algum teste antigo quebrou, é regressão — investigar antes de seguir. Se tudo verde, a fundação está pronta para o Plano 2 (ingestão enriquecida) consumir estas funções.

---

## Próximos planos (fora deste documento)

- **Plano 2 — Ingestão enriquecida:** estender o ingest do Sackmann para capturar `score`, `minutes`, break points, `tourney_level`, rankings e metadados; casar por jogador; gerar o JSON por jogador que as telas consomem (usando as funções deste plano).
- **Plano 3 — Grade Flashscore + ESPN fallback** (parser do formato do Flashscore, com superfície).
- **Plano 4 — Telas:** card rico do jogador, análise de confronto (com a sugestão tática em palavras) e a seção de jogadores, sob a regra de clareza total.
