# Grade do dia via Flashscore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a fonte da grade de jogos do dia para o **Flashscore** (cobre ATP + WTA + **Challenger**, e traz a **superfície**), mantendo a **ESPN como fallback** se o Flashscore falhar. O resultado continua saindo em `web/today.json`, no mesmo formato que o app já consome.

**Architecture:** Um módulo novo `pipeline/flashscore.js` (parser puro do feed proprietário + fetch). O `pipeline/fixtures.js` passa a tentar o Flashscore primeiro e cair para a ESPN. O casamento de nomes ganha uma função unificada `findModelPlayer` em `web/src/match-names.js` (o Flashscore dá "Borges N." no formato do modelo; a ESPN dá "Nuno Borges" completo).

**Tech Stack:** Node.js (ESM), `node --test`. Zero dependências novas.

**Formato do feed Flashscore** (`https://www.flashscore.com/x/feed/f_2_0_3_en_1`, header `x-fsign`): texto com registros separados por `¬`, cada um `CHAVE÷VALOR`. `~ZA÷` = cabeçalho do torneio ("CHALLENGER MEN - SINGLES: Bunschoten (Netherlands), clay" — categoria, nome e superfície). `~AA÷` = id do jogo; `AD÷` = horário (unix segundos); `AE÷`/`AF÷` = jogadores casa/visitante (formato "Sobrenome I."); `AB÷` = status (1=agendado, 2=ao vivo, 3=encerrado).

---

### Task 1: Parser do cabeçalho de torneio (`parseTournamentHeader`)

**Files:**
- Create: `pipeline/flashscore.js`
- Test: `tests/flashscore.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTournamentHeader } from '../pipeline/flashscore.js';

test('parseTournamentHeader: Challenger masculino no saibro', () => {
  const r = parseTournamentHeader('CHALLENGER MEN - SINGLES: Bunschoten (Netherlands), clay');
  assert.equal(r.tour, 'ATP');
  assert.equal(r.singles, true);
  assert.equal(r.surface, 'clay');
  assert.equal(r.tournament, 'Bunschoten (Netherlands)');
});

test('parseTournamentHeader: WTA na quadra dura', () => {
  const r = parseTournamentHeader('WTA - SINGLES: Prague (Czechia), hard');
  assert.equal(r.tour, 'WTA');
  assert.equal(r.surface, 'hard');
});

test('parseTournamentHeader: duplas marcadas como singles=false', () => {
  const r = parseTournamentHeader('ATP - DOUBLES: Bastad (Sweden), clay');
  assert.equal(r.singles, false);
});

test('parseTournamentHeader: superfície desconhecida cai em hard', () => {
  const r = parseTournamentHeader('ATP - SINGLES: Lugar Estranho');
  assert.equal(r.surface, 'hard');
  assert.equal(r.tournament, 'Lugar Estranho');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/flashscore.test.js`
Expected: FAIL com `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write minimal implementation**

Crie `pipeline/flashscore.js`:

```javascript
// Parser do feed proprietário do Flashscore (grade de tênis do dia) + fetch.
// Cobre ATP + WTA + Challenger e traz a superfície. Puro testado em tests/flashscore.test.js.

const SURFACE = { clay: 'clay', hard: 'hard', grass: 'grass', carpet: 'hard' };

/** "CHALLENGER MEN - SINGLES: Bunschoten (Netherlands), clay"
 *  -> { tour, singles, surface, tournament }. */
export function parseTournamentHeader(za) {
  const colon = za.indexOf(':');
  const cat = colon >= 0 ? za.slice(0, colon) : za;
  const rest = colon >= 0 ? za.slice(colon + 1).trim() : '';
  const singles = /singles/i.test(cat);
  const tour = /women|wta|girls|ladies/i.test(cat) ? 'WTA' : 'ATP';
  let surface = 'hard';
  let tournament = rest;
  const comma = rest.lastIndexOf(',');
  if (comma >= 0) {
    const word = rest.slice(comma + 1).trim().toLowerCase();
    if (SURFACE[word]) {
      surface = SURFACE[word];
      tournament = rest.slice(0, comma).trim();
    }
  }
  return { tour, singles, surface, tournament };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/flashscore.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add pipeline/flashscore.js tests/flashscore.test.js
git commit -m "feat(grade): parser do cabecalho de torneio Flashscore"
```

---

### Task 2: Mapa de status (`statusFromCode`)

**Files:**
- Modify: `pipeline/flashscore.js`
- Test: `tests/flashscore.test.js`

- [ ] **Step 1: Write the failing test**

Adicione ao final de `tests/flashscore.test.js`:

```javascript
import { statusFromCode } from '../pipeline/flashscore.js';

test('statusFromCode: 1 agendado, 2 ao vivo, 3 encerrado', () => {
  assert.equal(statusFromCode('1'), 'SCHEDULED');
  assert.equal(statusFromCode('2'), 'IN_PROGRESS');
  assert.equal(statusFromCode('3'), 'FINISHED');
  assert.equal(statusFromCode('99'), 'OTHER');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/flashscore.test.js`
Expected: FAIL — `statusFromCode is not a function`.

- [ ] **Step 3: Write minimal implementation**

Adicione a `pipeline/flashscore.js`:

```javascript
/** Código de status do Flashscore -> rótulo. */
export function statusFromCode(ab) {
  if (ab === '1') return 'SCHEDULED';
  if (ab === '2') return 'IN_PROGRESS';
  if (ab === '3') return 'FINISHED';
  return 'OTHER';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/flashscore.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/flashscore.js tests/flashscore.test.js
git commit -m "feat(grade): mapa de status do Flashscore"
```

---

### Task 3: Parser do feed inteiro (`parseFeed`)

**Files:**
- Modify: `pipeline/flashscore.js`
- Test: `tests/flashscore.test.js`

`parseFeed(text)` devolve os jogos de **simples não-encerrados**: `[{ tour, tournament, surface, status, commence, a, b }]`. `commence` é ISO 8601. Ignora duplas, encerrados e jogos sem os dois jogadores.

- [ ] **Step 1: Write the failing test**

Adicione ao final de `tests/flashscore.test.js`:

```javascript
import { parseFeed } from '../pipeline/flashscore.js';

const FEED = [
  '~ZA÷CHALLENGER MEN - SINGLES: Bunschoten (Netherlands), clay',
  '~AA÷id1', 'AD÷1784106600', 'AB÷1', 'AE÷Borges N.', 'AF÷Dimitrov G.',
  '~AA÷id2', 'AD÷1784110000', 'AB÷3', 'AE÷Encerrado A.', 'AF÷Encerrado B.',
  '~ZA÷WTA - DOUBLES: Prague (Czechia), hard',
  '~AA÷id3', 'AD÷1784106600', 'AB÷1', 'AE÷Dupla A.', 'AF÷Dupla B.',
  '~ZA÷WTA - SINGLES: Prague (Czechia), hard',
  '~AA÷id4', 'AD÷1784106600', 'AB÷2', 'AE÷Swiatek I.', 'AF÷Gauff C.',
].join('¬');

test('parseFeed: só simples não-encerrados (exclui duplas, encerrado)', () => {
  const jogos = parseFeed(FEED);
  assert.equal(jogos.length, 2);
  assert.deepEqual(jogos.map((j) => `${j.a} vs ${j.b}`), ['Borges N. vs Dimitrov G.', 'Swiatek I. vs Gauff C.']);
});

test('parseFeed: preenche tour, superfície, status e horário ISO', () => {
  const [g] = parseFeed(FEED);
  assert.equal(g.tour, 'ATP');
  assert.equal(g.surface, 'clay');
  assert.equal(g.status, 'SCHEDULED');
  assert.equal(g.tournament, 'Bunschoten (Netherlands)');
  assert.equal(g.commence, new Date(1784106600 * 1000).toISOString());
});

test('parseFeed: o jogo ao vivo vem com status IN_PROGRESS e tour WTA', () => {
  const jogos = parseFeed(FEED);
  const g = jogos.find((x) => x.a === 'Swiatek I.');
  assert.equal(g.status, 'IN_PROGRESS');
  assert.equal(g.tour, 'WTA');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/flashscore.test.js`
Expected: FAIL — `parseFeed is not a function`.

- [ ] **Step 3: Write minimal implementation**

Adicione a `pipeline/flashscore.js`:

```javascript
const ACTIVE = new Set(['SCHEDULED', 'IN_PROGRESS']);

/** Feed cru do Flashscore -> jogos de simples não-encerrados. */
export function parseFeed(text) {
  const out = [];
  let th = null;   // cabeçalho de torneio atual
  let cur = null;  // jogo atual
  const flush = () => {
    if (cur && th && th.singles && ACTIVE.has(cur.status) && cur.a && cur.b) {
      out.push({
        tour: th.tour, tournament: th.tournament, surface: th.surface,
        status: cur.status, commence: cur.commence, a: cur.a, b: cur.b,
      });
    }
  };
  for (const reg of text.split('¬')) {
    const i = reg.indexOf('÷');
    if (i < 0) continue;
    const key = reg.slice(0, i).replace(/^~/, '');
    const val = reg.slice(i + 1);
    if (key === 'ZA') { flush(); cur = null; th = parseTournamentHeader(val); }
    else if (key === 'AA') { flush(); cur = { status: null, commence: null, a: null, b: null }; }
    else if (cur) {
      if (key === 'AB' && cur.status == null) cur.status = statusFromCode(val);
      else if (key === 'AD' && cur.commence == null) cur.commence = new Date(Number(val) * 1000).toISOString();
      else if (key === 'AE' && cur.a == null) cur.a = val;
      else if (key === 'AF' && cur.b == null) cur.b = val;
    }
  }
  flush();
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/flashscore.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/flashscore.js tests/flashscore.test.js
git commit -m "feat(grade): parser do feed Flashscore (parseFeed)"
```

---

### Task 4: Casamento de nome unificado (`findModelPlayer`)

**Files:**
- Modify: `web/src/match-names.js`
- Test: `tests/match-names.test.js` (criar se não existir)

O Flashscore dá "Borges N." (formato do modelo); a ESPN dá "Nuno Borges" (completo). `findModelPlayer` tenta o formato-modelo (comparação normalizada direta) e cai para `matchPlayer` (nome completo).

- [ ] **Step 1: Write the failing test**

Crie (ou adicione a) `tests/match-names.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findModelPlayer } from '../web/src/match-names.js';

const PLAYERS = [{ name: 'Borges N.' }, { name: 'Dimitrov G.' }, { name: 'Alcaraz C.' }];

test('findModelPlayer: nome no formato do modelo (Flashscore)', () => {
  assert.equal(findModelPlayer('Borges N.', PLAYERS).name, 'Borges N.');
});

test('findModelPlayer: nome completo (ESPN) cai no matchPlayer', () => {
  assert.equal(findModelPlayer('Carlos Alcaraz', PLAYERS).name, 'Alcaraz C.');
});

test('findModelPlayer: desconhecido devolve null', () => {
  assert.equal(findModelPlayer('Fulano Z.', PLAYERS), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/match-names.test.js`
Expected: FAIL — `findModelPlayer is not a function`.

- [ ] **Step 3: Write minimal implementation**

Adicione ao final de `web/src/match-names.js`:

```javascript
/** Resolve um nome contra o modelo, seja no formato do modelo ("Borges N.") ou completo ("Nuno Borges"). */
export function findModelPlayer(name, players) {
  const n = normName(name);
  for (const p of players) if (normName(p.name) === n) return p;
  return matchPlayer(name, players);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/match-names.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/match-names.js tests/match-names.test.js
git commit -m "feat(grade): casamento de nome unificado (findModelPlayer)"
```

---

### Task 5: Fetch do Flashscore + integração no fixtures (Flashscore primário, ESPN fallback)

**Files:**
- Modify: `pipeline/flashscore.js` (adicionar `fetchGrid`)
- Modify: `pipeline/fixtures.js` (trocar a fonte)

- [ ] **Step 1: Adicionar o fetch ao flashscore.js**

Adicione a `pipeline/flashscore.js`:

```javascript
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Baixa e parseia a grade de tênis do dia do Flashscore (IO). Lança se o feed vier vazio. */
export async function fetchGrid() {
  const r = await fetch('https://www.flashscore.com/x/feed/f_2_0_3_en_1', {
    headers: { 'x-fsign': 'SW9D1eZo', Referer: 'https://www.flashscore.com/', 'User-Agent': UA },
  });
  if (!r.ok) throw new Error(`Flashscore HTTP ${r.status}`);
  const text = await r.text();
  const jogos = parseFeed(text);
  if (!jogos.length) throw new Error('Flashscore: feed sem jogos (formato mudou?)');
  return jogos;
}
```

- [ ] **Step 2: Reescrever o buildToday do fixtures.js**

Substitua o conteúdo de `pipeline/fixtures.js` por:

```javascript
// Monta web/today.json: a grade de jogos do dia (Flashscore — ATP/WTA/Challenger, com superfície),
// com a leitura Elo de cada confronto. Fallback: ESPN (só tour) se o Flashscore falhar.
// Uso: node pipeline/fixtures.js
import { writeFile, readFile } from 'node:fs/promises';
import { findModelPlayer } from '../web/src/match-names.js';
import { analyzeMatch } from '../web/src/analysis.js';
import { fetchGrid } from './flashscore.js';
import { fetchDayFixtures } from './espn.js';

const STATUS_RANK = { IN_PROGRESS: 0, SUSPENDED: 1, SCHEDULED: 2 };
const ymdUTC = (d) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

/** Grade crua {tour,tournament,surface,status,commence,a,b} de Flashscore, com ESPN de fallback. */
async function loadGrid() {
  try {
    const jogos = await fetchGrid();
    console.log(`Flashscore: ${jogos.length} jogos de simples.`);
    return { source: 'flashscore', jogos };
  } catch (e) {
    console.warn(`Flashscore indisponível (${e.message}) — caindo pra ESPN.`);
  }
  const ymd = ymdUTC(new Date());
  let jogos = [];
  for (const endpoint of ['atp', 'wta']) {
    try {
      const g = await fetchDayFixtures(endpoint, ymd);
      jogos = jogos.concat(g.map((x) => ({ ...x, a: x.aFull, b: x.bFull })));
    } catch (e) {
      console.warn(`ESPN ${endpoint}: ${e.message}`);
    }
  }
  console.log(`ESPN (fallback): ${jogos.length} jogos.`);
  return { source: 'espn', jogos };
}

async function buildToday() {
  const models = {
    ATP: JSON.parse(await readFile(new URL('../web/model-atp.json', import.meta.url))),
    WTA: JSON.parse(await readFile(new URL('../web/model-wta.json', import.meta.url))),
  };
  const out = { generatedAt: new Date().toISOString(), source: null, count: 0, matches: [], unmatched: [] };

  const { source, jogos } = await loadGrid();
  out.source = source;
  if (!jogos.length) {
    console.warn('Nenhuma fonte trouxe jogos — mantendo o today.json anterior.');
    return;
  }

  const seen = new Set();
  for (const g of jogos) {
    const key = `${g.tour}|${g.a}|${g.b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const model = models[g.tour];
    if (!model) continue;
    const pa = findModelPlayer(g.a, model.players);
    const pb = findModelPlayer(g.b, model.players);
    if (!pa || !pb) {
      out.unmatched.push(`${g.a} / ${g.b} [${g.tour} ${g.tournament}]`);
      continue;
    }
    const r = analyzeMatch(pa, pb, g.surface, model);
    out.matches.push({
      tour: g.tour,
      tournament: g.tournament,
      surface: g.surface,
      status: g.status,
      commence: g.commence,
      a: pa.name,
      b: pb.name,
      probA: r.probA,
      favorite: r.favorite,
      favoriteProb: r.favoriteProb,
      marginLabel: r.marginLabel,
      confidence: r.confidence.level,
      fairOddA: Math.round(r.fairOddA * 100) / 100,
      fairOddB: Math.round(r.fairOddB * 100) / 100,
      marketOddA: null,
      marketOddB: null,
    });
  }

  out.matches.sort(
    (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || (a.commence || '').localeCompare(b.commence || '')
  );
  out.count = out.matches.length;
  await writeFile(new URL('../web/today.json', import.meta.url), JSON.stringify(out));
  console.log(`today.json (${source}): ${out.count} jogos casados, ${out.unmatched.length} não-casados.`);
  if (out.unmatched.length) console.log('não-casados:', out.unmatched.slice(0, 15).join(' | '));
}

buildToday();
```

- [ ] **Step 3: Commit**

```bash
git add pipeline/flashscore.js pipeline/fixtures.js
git commit -m "feat(grade): Flashscore como fonte da grade + ESPN fallback"
```

---

### Task 6: Rodar de verdade e verificar a cobertura (com Challenger)

**Files:** nenhum (verificação).

- [ ] **Step 1: Rodar toda a suíte**

Run: `npm test`
Expected: PASS em tudo (os testes de `flashscore` e `match-names` + os antigos).

- [ ] **Step 2: Gerar a grade de verdade**

Run: `node pipeline/fixtures.js`
Expected: imprime `Flashscore: NNN jogos de simples.` e `today.json (flashscore): NNN jogos casados, NN não-casados.`

- [ ] **Step 3: Confirmar que a grade tem Challenger**

Run:
```bash
node -e 'const t=require("./web/today.json"); console.log("source:", t.source, "| count:", t.count); const ch=t.matches.filter(m=>/challenger|itf/i.test(m.tournament)); console.log("torneios distintos:", [...new Set(t.matches.map(m=>m.tournament))].length); console.log("exemplos:", t.matches.slice(0,6).map(m=>`[${m.tour}/${m.surface}] ${m.a} vs ${m.b} (${m.status})`).join(" | "));'
```
Expected: `source: flashscore`, count na casa das dezenas/centenas, torneios distintos > 5. Se `count` for 0 ou `source` for `espn` num dia com jogos, investigar antes de seguir.

- [ ] **Step 4: Commit do today.json gerado**

```bash
git add web/today.json
git commit -m "chore(grade): today.json gerado via Flashscore (com Challenger)"
```

---

## Próximo plano (fora deste documento)

- **Plano 4 — Telas:** card rico do jogador, análise de confronto (com a sugestão tática em palavras) e a seção de jogadores, consumindo `p.style`, `p.pressure`, `p.bio` e a grade completa.
- **Depois:** integrar `fixtures.js` e `patterns-ingest.js` ao robô diário; tratar o `x-fsign` do Flashscore como ponto de manutenção (se o feed vier vazio, o fallback ESPN já cobre o tour).
