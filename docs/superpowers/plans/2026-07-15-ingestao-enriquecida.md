# Ingestão enriquecida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rodar o motor de padrões (Plano 1) sobre os jogos reais do histórico Sackmann e enriquecer `web/model-atp.json` / `web/model-wta.json` com os padrões de estilo, os padrões de pressão e os dados bio (mão, altura, idade, país, ranking) de cada jogador.

**Architecture:** Um módulo puro novo `pipeline/patterns.js` (estruturação e agregação, testável offline) e um script de ingestão `pipeline/patterns-ingest.js` (IO: baixa o Sackmann, agrega, casa com o modelo, grava). Segue o padrão de `pipeline/serve-stats.js` (casa nomes via `matchPlayer` e escreve no modelo) e reusa `parseCsv` de `pipeline/ingest.js` e o motor de `pipeline/game-patterns.js`.

**Tech Stack:** Node.js (ESM), `node --test`, `node:assert/strict`. Zero dependências novas.

**Contexto do dado:** No CSV do Sackmann os metadados usam prefixo `winner_`/`loser_` (name, id, hand, ht, age, ioc, rank, seed) e as estatísticas usam prefixo `w_`/`l_` (`SvGms`, `bpSaved`, `bpFaced`). `tourney_level`: A/C/G/M/F. `surface` vem capitalizado ("Hard"). Arquivos por ano: `atp/atp_matches_{ano}.csv` (tour) + `atp/atp_matches_qual_chall_{ano}.csv` (challenger); `wta/wta_matches_{ano}.csv` + `wta/wta_matches_qual_itf_{ano}.csv`.

---

### Task 1: Extrair um jogo enriquecido de uma linha (`toEnrichedMatch`)

**Files:**
- Create: `pipeline/patterns.js`
- Test: `tests/patterns.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toEnrichedMatch } from '../pipeline/patterns.js';

const ROW = {
  tourney_date: '20260105', tourney_level: 'A', surface: 'Hard', score: '6-3 3-6 6-3', minutes: '114', best_of: '3',
  winner_name: 'Hubert Hurkacz', winner_id: '128034', winner_hand: 'R', winner_ht: '196', winner_age: '28.8',
  winner_ioc: 'POL', winner_rank: '83', winner_seed: '9', w_SvGms: '14', w_bpSaved: '8', w_bpFaced: '9',
  loser_name: 'Jannik Sinner', loser_id: '207989', loser_hand: 'R', loser_ht: '188', loser_age: '24.4',
  loser_ioc: 'ITA', loser_rank: '1', loser_seed: '1', l_SvGms: '13', l_bpSaved: '5', l_bpFaced: '7',
};

test('toEnrichedMatch: campos do jogo e superfície em minúsculo', () => {
  const m = toEnrichedMatch(ROW);
  assert.equal(m.dateInt, 20260105);
  assert.equal(m.level, 'A');
  assert.equal(m.surface, 'hard');
  assert.equal(m.score, '6-3 3-6 6-3');
  assert.equal(m.minutes, 114);
  assert.equal(m.bestOf, 3);
});

test('toEnrichedMatch: bio e stats do vencedor', () => {
  const m = toEnrichedMatch(ROW);
  assert.equal(m.winner.name, 'Hubert Hurkacz');
  assert.equal(m.winner.hand, 'R');
  assert.equal(m.winner.ht, 196);
  assert.equal(m.winner.age, 28.8);
  assert.equal(m.winner.ioc, 'POL');
  assert.equal(m.winner.rank, 83);
  assert.equal(m.winner.svGms, 14);
  assert.equal(m.winner.bpSaved, 8);
  assert.equal(m.winner.bpFaced, 9);
});

test('toEnrichedMatch: bio do perdedor usa o prefixo loser_/l_', () => {
  const m = toEnrichedMatch(ROW);
  assert.equal(m.loser.name, 'Jannik Sinner');
  assert.equal(m.loser.rank, 1);
  assert.equal(m.loser.bpFaced, 7);
});

test('toEnrichedMatch: campos ausentes viram null/0 sem quebrar', () => {
  const m = toEnrichedMatch({ tourney_date: '20260105', winner_name: 'A', loser_name: 'B' });
  assert.equal(m.minutes, null);
  assert.equal(m.winner.ht, null);
  assert.equal(m.winner.bpFaced, 0);
  assert.equal(m.bestOf, 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/patterns.test.js`
Expected: FAIL com `ERR_MODULE_NOT_FOUND` (o arquivo `pipeline/patterns.js` ainda não existe).

- [ ] **Step 3: Write minimal implementation**

Crie `pipeline/patterns.js`:

```javascript
// Estruturação e agregação dos jogos enriquecidos do Sackmann para o motor de padrões.
// Funções puras testadas em tests/patterns.test.js.
import { stylePatterns, pressurePatterns } from './game-patterns.js';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const intOf = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

/** Uma linha do CSV Sackmann (objeto do parseCsv) -> jogo enriquecido com bio e stats dos dois lados.
 *  bioP = 'winner'/'loser' (metadados); statP = 'w'/'l' (estatísticas). */
function side(row, bioP, statP) {
  return {
    name: row[`${bioP}_name`] || null,
    id: row[`${bioP}_id`] || null,
    hand: row[`${bioP}_hand`] || null,
    ht: num(row[`${bioP}_ht`]),
    age: num(row[`${bioP}_age`]),
    ioc: row[`${bioP}_ioc`] || null,
    rank: intOf(row[`${bioP}_rank`]),
    seed: intOf(row[`${bioP}_seed`]),
    svGms: num(row[`${statP}_SvGms`]) || 0,
    bpSaved: num(row[`${statP}_bpSaved`]) || 0,
    bpFaced: num(row[`${statP}_bpFaced`]) || 0,
  };
}

export function toEnrichedMatch(row) {
  return {
    dateInt: intOf(row.tourney_date),
    level: row.tourney_level || null,
    surface: (row.surface || '').toLowerCase() || null,
    score: row.score || '',
    minutes: num(row.minutes),
    bestOf: intOf(row.best_of) ?? 3,
    winner: side(row, 'winner', 'w'),
    loser: side(row, 'loser', 'l'),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/patterns.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add pipeline/patterns.js tests/patterns.test.js
git commit -m "feat(ingestao): extrair jogo enriquecido de linha Sackmann (toEnrichedMatch)"
```

---

### Task 2: Perspectiva do jogador num jogo (`playerSideGame`)

**Files:**
- Modify: `pipeline/patterns.js`
- Test: `tests/patterns.test.js`

- [ ] **Step 1: Write the failing test**

Adicione ao final de `tests/patterns.test.js`:

```javascript
import { playerSideGame } from '../pipeline/patterns.js';

test('playerSideGame: perspectiva do vencedor', () => {
  const m = toEnrichedMatch(ROW);
  const g = playerSideGame(m, 'winner');
  assert.equal(g.won, true);
  assert.equal(g.score, '6-3 3-6 6-3');
  assert.equal(g.bpFaced, 9);      // do vencedor
  assert.equal(g.oppBpFaced, 7);   // do perdedor
});

test('playerSideGame: perspectiva do perdedor inverte os lados', () => {
  const m = toEnrichedMatch(ROW);
  const g = playerSideGame(m, 'loser');
  assert.equal(g.won, false);
  assert.equal(g.bpFaced, 7);      // do perdedor
  assert.equal(g.oppBpSaved, 8);   // do vencedor
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/patterns.test.js`
Expected: FAIL — `playerSideGame is not a function`.

- [ ] **Step 3: Write minimal implementation**

Adicione a `pipeline/patterns.js`:

```javascript
/** Monta o jogo na perspectiva de um lado ('winner'|'loser') para o motor de padrões. */
export function playerSideGame(match, sideKey) {
  const won = sideKey === 'winner';
  const me = won ? match.winner : match.loser;
  const opp = won ? match.loser : match.winner;
  return {
    won,
    score: match.score,
    minutes: match.minutes,
    bpFaced: me.bpFaced,
    bpSaved: me.bpSaved,
    svGms: me.svGms,
    oppBpFaced: opp.bpFaced,
    oppBpSaved: opp.bpSaved,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/patterns.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/patterns.js tests/patterns.test.js
git commit -m "feat(ingestao): perspectiva do jogador num jogo (playerSideGame)"
```

---

### Task 3: Agrupar os jogos por jogador (`groupByPlayer`)

**Files:**
- Modify: `pipeline/patterns.js`
- Test: `tests/patterns.test.js`

`groupByPlayer(matches)` recebe jogos enriquecidos e devolve um `Map<nomeCompleto, entries[]>`, onde cada entry é `{ game, bio, dateInt }`. Ignora jogos sem placar.

- [ ] **Step 1: Write the failing test**

Adicione ao final de `tests/patterns.test.js`:

```javascript
import { groupByPlayer } from '../pipeline/patterns.js';

test('groupByPlayer: cada jogo entra para os dois jogadores, na perspectiva certa', () => {
  const m = toEnrichedMatch(ROW);
  const g = groupByPlayer([m]);
  assert.equal(g.get('Hubert Hurkacz').length, 1);
  assert.equal(g.get('Hubert Hurkacz')[0].game.won, true);
  assert.equal(g.get('Jannik Sinner')[0].game.won, false);
  assert.equal(g.get('Jannik Sinner')[0].bio.rank, 1);
});

test('groupByPlayer: ignora jogos sem placar', () => {
  const m = toEnrichedMatch({ ...ROW, score: '' });
  const g = groupByPlayer([m]);
  assert.equal(g.size, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/patterns.test.js`
Expected: FAIL — `groupByPlayer is not a function`.

- [ ] **Step 3: Write minimal implementation**

Adicione a `pipeline/patterns.js`:

```javascript
/** Agrupa jogos enriquecidos por nome completo -> [{ game, bio, dateInt }]. Ignora sem placar. */
export function groupByPlayer(matches) {
  const byName = new Map();
  const add = (name, entry) => {
    if (!name) return;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(entry);
  };
  for (const m of matches) {
    if (!m.score) continue;
    add(m.winner.name, { game: playerSideGame(m, 'winner'), bio: m.winner, dateInt: m.dateInt });
    add(m.loser.name, { game: playerSideGame(m, 'loser'), bio: m.loser, dateInt: m.dateInt });
  }
  return byName;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/patterns.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/patterns.js tests/patterns.test.js
git commit -m "feat(ingestao): agrupar jogos por jogador (groupByPlayer)"
```

---

### Task 4: Montar o perfil de um jogador (`buildProfile`)

**Files:**
- Modify: `pipeline/patterns.js`
- Test: `tests/patterns.test.js`

`buildProfile(entries)` devolve `{ games, style, pressure, bio }`. `bio` vem do jogo mais recente (rank/idade mais atuais); `style`/`pressure` vêm do motor do Plano 1.

- [ ] **Step 1: Write the failing test**

Adicione ao final de `tests/patterns.test.js`:

```javascript
import { buildProfile } from '../pipeline/patterns.js';

test('buildProfile: agrega padrões e usa o bio do jogo mais recente', () => {
  const entries = [
    { game: { won: true, score: '6-4 6-3', minutes: 90, bpFaced: 2, bpSaved: 2, svGms: 10, oppBpFaced: 4, oppBpSaved: 1 },
      bio: { rank: 50, hand: 'R' }, dateInt: 20250101 },
    { game: { won: false, score: '4-6 6-3 6-2', minutes: 150, bpFaced: 5, bpSaved: 3, svGms: 12, oppBpFaced: 3, oppBpSaved: 2 },
      bio: { rank: 30, hand: 'R' }, dateInt: 20260101 },
  ];
  const p = buildProfile(entries);
  assert.equal(p.games, 2);
  assert.equal(p.bio.rank, 30);            // do mais recente (20260101)
  assert.equal(p.style.firstSet.n, 2);     // veio do motor de padrões
  assert.equal(typeof p.pressure.bpSavedPct, 'number');
});

test('buildProfile: lista vazia devolve bio null', () => {
  const p = buildProfile([]);
  assert.equal(p.games, 0);
  assert.equal(p.bio, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/patterns.test.js`
Expected: FAIL — `buildProfile is not a function`.

- [ ] **Step 3: Write minimal implementation**

Adicione a `pipeline/patterns.js`:

```javascript
/** Perfil agregado de um jogador a partir das entries de groupByPlayer. */
export function buildProfile(entries) {
  const sorted = [...entries].sort((a, b) => a.dateInt - b.dateInt);
  const recent = sorted[sorted.length - 1];
  const games = entries.map((e) => e.game);
  return {
    games: entries.length,
    style: stylePatterns(games),
    pressure: pressurePatterns(games),
    bio: recent ? recent.bio : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/patterns.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/patterns.js tests/patterns.test.js
git commit -m "feat(ingestao): montar perfil do jogador (buildProfile)"
```

---

### Task 5: Script de ingestão + enriquecimento do modelo (IO)

**Files:**
- Create: `pipeline/patterns-ingest.js`

Baixa o Sackmann (tour + challenger, ATP e WTA, ~3 anos), agrupa, casa cada nome com o jogador do modelo via `matchPlayer` e grava `p.style`, `p.pressure`, `p.bio`. Segue o padrão de `pipeline/serve-stats.js`.

- [ ] **Step 1: Write the script**

Crie `pipeline/patterns-ingest.js`:

```javascript
// Enriquece os modelos (ATP/WTA) com padrões de estilo/pressão e bio, a partir do Sackmann.
// Uso: node pipeline/patterns-ingest.js
import { readFile, writeFile } from 'node:fs/promises';
import { parseCsv } from './ingest.js';
import { matchPlayer } from '../web/src/match-names.js';
import { toEnrichedMatch, groupByPlayer, buildProfile } from './patterns.js';

const BASE = 'https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main';
const MIN_GAMES = 10;

const filesFor = (year, tour) =>
  tour === 'WTA'
    ? [`wta/wta_matches_${year}.csv`, `wta/wta_matches_qual_itf_${year}.csv`]
    : [`atp/atp_matches_${year}.csv`, `atp/atp_matches_qual_chall_${year}.csv`];

async function loadEnriched(from, to, tour) {
  const years = [];
  for (let y = from; y <= to; y++) years.push(y);
  const all = [];
  await Promise.all(
    years.flatMap((y) =>
      filesFor(y, tour).map(async (f) => {
        try {
          const res = await fetch(`${BASE}/${f}`);
          if (!res.ok) return;
          for (const row of parseCsv(await res.text())) all.push(toEnrichedMatch(row));
        } catch (e) {
          console.warn(`aviso: ${f} ignorado (${e.message})`);
        }
      })
    )
  );
  return all;
}

async function enrich(modelFile, tour) {
  const url = new URL(modelFile, import.meta.url);
  const model = JSON.parse(await readFile(url));
  const to = new Date().getFullYear();
  const from = to - 2;
  console.log(`Padrões ${tour} ${from}–${to}...`);
  const matches = await loadEnriched(from, to, tour);
  const byName = groupByPlayer(matches);

  // Junta as entries de todos os nomes completos que casam com cada jogador do modelo.
  const byPlayer = new Map();
  for (const [fullName, entries] of byName) {
    const p = matchPlayer(fullName, model.players);
    if (!p) continue;
    if (!byPlayer.has(p.name)) byPlayer.set(p.name, []);
    byPlayer.get(p.name).push(...entries);
  }

  let n = 0;
  for (const p of model.players) {
    const entries = byPlayer.get(p.name);
    if (!entries || entries.length < MIN_GAMES) continue;
    const prof = buildProfile(entries);
    p.style = prof.style;
    p.pressure = prof.pressure;
    p.bio = prof.bio;
    n++;
  }
  await writeFile(url, JSON.stringify(model));
  console.log(`${modelFile}: ${n} jogadores com padrões (de ${matches.length} jogos, ${byName.size} nomes).`);
}

async function main() {
  await enrich('../web/model-atp.json', 'ATP');
  await enrich('../web/model-wta.json', 'WTA');
}

main();
```

- [ ] **Step 2: Rodar a ingestão de verdade**

Run: `node pipeline/patterns-ingest.js`
Expected: imprime, para ATP e WTA, algo como `model-*.json: NNN jogadores com padrões (de NNNNN jogos, NNNN nomes).` com NNN na casa das centenas. Pode levar ~30-60s (baixa vários CSV).

- [ ] **Step 3: Verificar que jogadores conhecidos ganharam os padrões**

Run:
```bash
node -e 'const m=require("./web/model-atp.json"); const p=m.players.find(x=>x.name.startsWith("Sinner")); console.log(p.name, "| style:", JSON.stringify(p.style?.firstSet), "| pressure:", JSON.stringify(p.pressure?.bpSavedPct), "| bio:", JSON.stringify(p.bio));'
```
Expected: mostra o nome, um `firstSet` com `pct`/`n`, um `bpSavedPct` numérico e um `bio` com `rank`/`hand`/`ioc`. Se `p.style` vier `undefined`, o casamento de nome falhou — investigar antes de seguir.

- [ ] **Step 4: Rodar a suíte e confirmar sem regressão**

Run: `npm test`
Expected: PASS em tudo (os testes de `patterns` + os antigos).

- [ ] **Step 5: Commit**

```bash
git add pipeline/patterns-ingest.js web/model-atp.json web/model-wta.json
git commit -m "feat(ingestao): enriquecer modelos com padroes e bio (patterns-ingest)"
```

---

## Próximos planos (fora deste documento)

- **Plano 3 — Grade Flashscore + ESPN fallback** (parser do formato do Flashscore, com superfície e Challenger).
- **Plano 4 — Telas:** card rico do jogador, análise de confronto (com a sugestão tática em palavras) e a seção de jogadores, consumindo `p.style`, `p.pressure`, `p.bio`.
- **Depois:** integrar `patterns-ingest.js` ao robô diário (`.github/workflows/update-model.yml`) para os padrões se atualizarem sozinhos; e o "momento de carreira" (trajetória de ranking via rankings históricos).
