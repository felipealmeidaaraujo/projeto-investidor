# Dossiê completo + saque WTA — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer stats de saque/devolução para a WTA, dar referência ("elite/média/…") por circuito a cada número do dossiê, tornar as tags por circuito, e adicionar a faixa explicativa "O que significam esses números?" no dossiê.

**Architecture:** O pipeline `serve-stats.js` é refatorado para enriquecer ATP (fonte TML) **e** WTA (fonte archive/jsDelivr), com `main()` protegido por checagem de módulo principal. A lógica de faixas e tags vira **por circuito** em `web/src/analysis.js` (funções puras testáveis). O dossiê (`web/app.js`) passa a mostrar a pill de referência e a faixa, virando re-renderizável.

**Tech Stack:** PWA sem build (HTML/CSS/JS ES modules), Node built-in test runner (`node --test` = `npm test`), pipeline Node, GitHub Actions.

**Nota de cache:** service worker é network-first — muda nada. Propaga sozinho.

---

## Estrutura de arquivos

- **Modificar** `pipeline/serve-stats.js` — guard de `main`, `enrichServe`, `applyServe`, `accumulate` exportadas; roda ATP+WTA.
- **Modificar** `tests/serve-stats.test.js` — testes de `accumulate` e `applyServe` (além do `serveProfile` já existente).
- **Modificar** `web/src/analysis.js` — `SERVE_BANDS`, `serveBand(tour,key,value)`, `SERVE_TAG_THRESHOLDS`, `playerTags(player, tour)`.
- **Modificar** `tests/analysis.test.js` — testes de `serveBand`.
- **Modificar** `tests/player-tags.test.js` — testes de `playerTags` por circuito.
- **Modificar** `web/model-wta.json` — regenerado com `serve` + `fullName` (gerado pelo pipeline).
- **Modificar** `web/app.js` — `openDossier` re-renderizável + pills + faixa + `playerTags(player, anal.tour)`.
- **Modificar** `web/styles.css` — `.refpill` e variantes.
- **Modificar** `.github/workflows/update-model.yml` — rótulo do passo (roda ATP+WTA).

---

## Task 1: Refatorar `serve-stats.js` (guard de main, ATP+WTA)

**Files:**
- Modify: `pipeline/serve-stats.js`
- Test: `tests/serve-stats.test.js`

- [ ] **Step 1: Escrever os testes que falham**

No topo de `tests/serve-stats.test.js`, ampliar o import:

```js
import { serveProfile, accumulate, applyServe } from '../pipeline/serve-stats.js';
```

Adicionar ao fim do arquivo:

```js
test('accumulate: soma saque do vencedor e devolução do perdedor', () => {
  const m = new Map();
  accumulate(m, {
    winner_name: 'A', loser_name: 'B',
    w_ace: '5', w_svpt: '80', w_1stIn: '50', w_1stWon: '40', w_2ndWon: '18', w_bpSaved: '3', w_bpFaced: '5',
    l_ace: '2', l_svpt: '70', l_1stWon: '38', l_2ndWon: '15', l_1stIn: '45', l_bpSaved: '4', l_bpFaced: '8',
  });
  const a = m.get('A');
  assert.equal(a.ace, 5);
  assert.equal(a.svpt, 80);
  // devolução de A = pontos de saque de B menos os que B ganhou
  assert.equal(a.retPts, 70);
  assert.equal(a.retWon, 70 - (38 + 15));
});

test('applyServe: enriquece quem passa do mínimo de saques e ignora quem não', () => {
  const model = { players: [{ name: 'AAA', elo: 2000 }, { name: 'BBB', elo: 1900 }] };
  const big = { ace: 60, svpt: 600, firstIn: 380, firstWon: 300, secondWon: 130, bpSaved: 30, bpFaced: 45, retWon: 200, retPts: 550 };
  const small = { ace: 20, svpt: 300, firstIn: 190, firstWon: 150, secondWon: 60, bpSaved: 10, bpFaced: 18, retWon: 90, retPts: 280 };
  const byFull = new Map([['Full A', big], ['Full B', small]]);
  const match = (full, players) => players.find((p) => full.endsWith(p.name[0])) || null; // 'Full A'→AAA, 'Full B'→BBB
  const enriched = applyServe(model, byFull, { match });
  assert.equal(enriched, 1);
  assert.ok(model.players[0].serve && typeof model.players[0].serve.servePtsWonPct === 'number');
  assert.equal(model.players[0].fullName, 'Full A');
  assert.equal(model.players[1].serve, undefined);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/serve-stats.test.js`
Expected: FAIL — `accumulate`/`applyServe` não exportadas.

- [ ] **Step 3: Refatorar `pipeline/serve-stats.js`**

Substituir o arquivo inteiro por:

```js
// Agrega estatísticas de saque/devolução e enriquece os modelos (ATP: mirror TML;
// WTA: espelho Sackmann via jsDelivr). Uso: node pipeline/serve-stats.js
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseCsv } from './ingest.js';
import { matchPlayer } from './match-names.js';

const TML = 'https://raw.githubusercontent.com/Tennismylife/TML-Database/master';
const WTA_ARCHIVE = 'https://cdn.jsdelivr.net/gh/Aneeshers/tennis-sackmann-archive@main/wta';

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Percentuais de saque/devolução a partir dos totais somados. Puro (testado). */
export function serveProfile(t) {
  const pct = (a, b) => (b > 0 ? a / b : 0);
  return {
    acePct: pct(t.ace, t.svpt),
    firstInPct: pct(t.firstIn, t.svpt),
    firstWonPct: pct(t.firstWon, t.firstIn),
    secondWonPct: pct(t.secondWon, t.svpt - t.firstIn),
    servePtsWonPct: pct(t.firstWon + t.secondWon, t.svpt),
    bpSavedPct: pct(t.bpSaved, t.bpFaced),
    returnPtsWonPct: pct(t.retWon, t.retPts),
  };
}

const empty = () => ({ ace: 0, svpt: 0, firstIn: 0, firstWon: 0, secondWon: 0, bpSaved: 0, bpFaced: 0, retWon: 0, retPts: 0 });
function add(map, name, s) {
  const cur = map.get(name) || empty();
  for (const k of Object.keys(cur)) cur[k] += s[k];
  map.set(name, cur);
}

/** Acumula os totais de saque de uma linha (vencedor e perdedor). Puro (testado). */
export function accumulate(map, row) {
  const w = row.winner_name;
  const l = row.loser_name;
  if (!w || !l) return;
  add(map, w, {
    ace: n(row.w_ace), svpt: n(row.w_svpt), firstIn: n(row.w_1stIn), firstWon: n(row.w_1stWon), secondWon: n(row.w_2ndWon),
    bpSaved: n(row.w_bpSaved), bpFaced: n(row.w_bpFaced),
    retWon: n(row.l_svpt) - (n(row.l_1stWon) + n(row.l_2ndWon)), retPts: n(row.l_svpt),
  });
  add(map, l, {
    ace: n(row.l_ace), svpt: n(row.l_svpt), firstIn: n(row.l_1stIn), firstWon: n(row.l_1stWon), secondWon: n(row.l_2ndWon),
    bpSaved: n(row.l_bpSaved), bpFaced: n(row.l_bpFaced),
    retWon: n(row.w_svpt) - (n(row.w_1stWon) + n(row.w_2ndWon)), retPts: n(row.w_svpt),
  });
}

/** Casa nomes completos → jogador do modelo e escreve p.serve/p.fullName. Puro (testado). */
export function applyServe(model, byFull, { minSvpt = 500, match = matchPlayer } = {}) {
  const byPlayer = new Map();
  for (const [full, t] of byFull) {
    const p = match(full, model.players);
    if (!p) continue;
    let e = byPlayer.get(p.name);
    if (!e) { e = { t: empty(), fullName: full, bestSvpt: 0 }; byPlayer.set(p.name, e); }
    for (const k of Object.keys(e.t)) e.t[k] += t[k];
    if (t.svpt > e.bestSvpt) { e.bestSvpt = t.svpt; e.fullName = full; }
  }
  let enriched = 0;
  const rnd = (x) => Math.round(x * 1000) / 1000;
  for (const p of model.players) {
    const e = byPlayer.get(p.name);
    if (e && e.t.svpt > minSvpt) {
      const sp = serveProfile(e.t);
      p.serve = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, rnd(v)]));
      p.fullName = e.fullName;
      enriched++;
    }
  }
  return enriched;
}

/** Enriquece um modelo (IO): baixa os anos, agrega, aplica e grava. */
export async function enrichServe({ modelFile, urlFor, label }) {
  const modelUrl = new URL(modelFile, import.meta.url);
  const model = JSON.parse(await readFile(modelUrl));
  const to = new Date().getFullYear();
  const from = to - 3;
  console.log(`Agregando saque ${label} ${from}–${to}...`);
  const byFull = new Map();
  for (let y = from; y <= to; y++) {
    try {
      const text = await (await fetch(urlFor(y))).text();
      for (const row of parseCsv(text)) accumulate(byFull, row);
    } catch (e) {
      console.warn(`${label} ${y}: ${e.message}`);
    }
  }
  const enriched = applyServe(model, byFull);
  await writeFile(modelUrl, JSON.stringify(model));
  console.log(`${modelFile}: ${enriched} jogadores com perfil de saque.`);
  return enriched;
}

async function main() {
  await enrichServe({ modelFile: '../web/model-atp.json', label: 'ATP', urlFor: (y) => `${TML}/${y}.csv` });
  await enrichServe({ modelFile: '../web/model-wta.json', label: 'WTA', urlFor: (y) => `${WTA_ARCHIVE}/wta_matches_${y}.csv` });
}

// Só roda quando executado direto (não no import — evita rede/escrita nos testes).
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test tests/serve-stats.test.js`
Expected: PASS — `serveProfile`, `accumulate`, `applyServe`. (Sem rede: o import não roda mais `main()`.)

- [ ] **Step 5: Commit**

```bash
git add pipeline/serve-stats.js tests/serve-stats.test.js
git commit -m "Pipeline: serve-stats roda ATP+WTA e nao roda main no import"
```

---

## Task 2: `serveBand` por circuito (analysis.js)

**Files:**
- Modify: `web/src/analysis.js`
- Test: `tests/analysis.test.js`

- [ ] **Step 1: Escrever os testes que falham**

No import do topo de `tests/analysis.test.js`, acrescentar `serveBand`:

```js
import {
  blendedRating,
  matchProbability,
  marginLabel,
  surfaceRead,
  confidenceLevel,
  analyzeMatch,
  buildReadingExplanation,
  serveBand,
} from '../web/src/analysis.js';
```

Adicionar ao fim:

```js
test('serveBand: mesma devolução, banda diferente por circuito', () => {
  // 0.42 de devolução: no ATP é elite (limiar 0.40); na WTA é só "na média" (mediana 0.431)
  assert.deepEqual(serveBand('ATP', 'returnPtsWonPct', 0.42), { band: 'elite', label: 'elite' });
  assert.deepEqual(serveBand('WTA', 'returnPtsWonPct', 0.42), { band: 'mid', label: 'na média' });
  assert.deepEqual(serveBand('WTA', 'returnPtsWonPct', 0.46), { band: 'elite', label: 'elite' });
});
test('serveBand: bandas high/low e casos nulos', () => {
  assert.deepEqual(serveBand('ATP', 'acePct', 0.12), { band: 'elite', label: 'elite' });
  assert.deepEqual(serveBand('WTA', 'servePtsWonPct', 0.50), { band: 'low', label: 'abaixo da média' });
  assert.deepEqual(serveBand('ATP', 'servePtsWonPct', 0.65), { band: 'high', label: 'acima da média' });
  assert.equal(serveBand('ATP', 'servePtsWonPct', 0), null);
  assert.equal(serveBand('ATP', 'chaveInexistente', 0.5), null);
  assert.equal(serveBand('XYZ', 'acePct', 0.1), null);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/analysis.test.js`
Expected: FAIL — `serveBand` não exportada.

- [ ] **Step 3: Implementar em `web/src/analysis.js`**

Adicionar ao fim do arquivo:

```js
/** Faixas de referência de saque/devolução por circuito (frações 0–1), dos dados reais. */
const SERVE_BANDS = {
  ATP: {
    servePtsWonPct: { lo: 0.610, mid: 0.634, hi: 0.680 },
    firstInPct: { lo: 0.590, mid: 0.626, hi: 0.670 },
    acePct: { lo: 0.050, mid: 0.073, hi: 0.110 },
    returnPtsWonPct: { lo: 0.340, mid: 0.357, hi: 0.400 },
    bpSavedPct: { lo: 0.580, mid: 0.613, hi: 0.660 },
  },
  WTA: {
    servePtsWonPct: { lo: 0.537, mid: 0.558, hi: 0.594 },
    firstInPct: { lo: 0.585, mid: 0.627, hi: 0.686 },
    acePct: { lo: 0.020, mid: 0.033, hi: 0.064 },
    returnPtsWonPct: { lo: 0.413, mid: 0.431, hi: 0.454 },
    bpSavedPct: { lo: 0.506, mid: 0.542, hi: 0.583 },
  },
};
const BAND_LABEL = { elite: 'elite', high: 'acima da média', mid: 'na média', low: 'abaixo da média' };

/** Classifica um stat de saque na sua banda, conforme o circuito. */
export function serveBand(tour, key, value) {
  const b = SERVE_BANDS[tour]?.[key];
  if (!b || !(value > 0)) return null;
  const band = value >= b.hi ? 'elite' : value >= b.mid ? 'high' : value >= b.lo ? 'mid' : 'low';
  return { band, label: BAND_LABEL[band] };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/analysis.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/analysis.js tests/analysis.test.js
git commit -m "Analise: serveBand (faixas de referencia de saque por circuito)"
```

---

## Task 3: `playerTags` por circuito (analysis.js)

**Files:**
- Modify: `web/src/analysis.js` (função `playerTags`)
- Test: `tests/player-tags.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao fim de `tests/player-tags.test.js`:

```js
test('playerTags: limiar de devolução é por circuito', () => {
  // Devolução 0.45: forte no ATP (limiar 0.40), NÃO forte na WTA (limiar 0.454)
  const p = { elo: 2000, serve: { servePtsWonPct: 0.56, returnPtsWonPct: 0.45, acePct: 0.03, bpSavedPct: 0.55, firstInPct: 0.62 } };
  const atp = playerTags(p, 'ATP').map((t) => t.t);
  const wta = playerTags(p, 'WTA').map((t) => t.t);
  assert.ok(atp.includes('Devolvedor forte'));
  assert.ok(!wta.includes('Devolvedor forte'));
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/player-tags.test.js`
Expected: FAIL — na WTA ainda usaria o limiar 0.40 e marcaria "Devolvedor forte".

- [ ] **Step 3: Implementar — tornar `playerTags` ciente do circuito**

Em `web/src/analysis.js`, **antes** de `export function playerTags`, adicionar:

```js
/** Limiares de tag de saque por circuito (= cortes das bandas, pra não contradizer). */
const SERVE_TAG_THRESHOLDS = {
  ATP: { serveHi: 0.68, serveLo: 0.61, ace: 0.11, retHi: 0.40, retLo: 0.34, bpHi: 0.66, bpLo: 0.58 },
  WTA: { serveHi: 0.594, serveLo: 0.537, ace: 0.064, retHi: 0.454, retLo: 0.413, bpHi: 0.583, bpLo: 0.506 },
};
```

Substituir a função `playerTags` inteira por:

```js
/** Tags de força/fraqueza do jogador (saque/devolução + superfície), com limiares por circuito. */
export function playerTags(player, tour = 'ATP') {
  const tags = [];
  const s = player.serve;
  const T = SERVE_TAG_THRESHOLDS[tour] ?? SERVE_TAG_THRESHOLDS.ATP;
  if (s) {
    if (s.servePtsWonPct >= T.serveHi) tags.push({ t: 'Saque forte', kind: 'strength' });
    else if (s.servePtsWonPct > 0 && s.servePtsWonPct < T.serveLo) tags.push({ t: 'Saque fraco', kind: 'weakness' });
    if (s.acePct >= T.ace) tags.push({ t: 'Muitos aces', kind: 'strength' });
    if (s.returnPtsWonPct >= T.retHi) tags.push({ t: 'Devolvedor forte', kind: 'strength' });
    else if (s.returnPtsWonPct > 0 && s.returnPtsWonPct < T.retLo) tags.push({ t: 'Devolve pouco', kind: 'weakness' });
    if (s.bpSavedPct >= T.bpHi) tags.push({ t: 'Salva break points', kind: 'strength' });
    else if (s.bpSavedPct > 0 && s.bpSavedPct < T.bpLo) tags.push({ t: 'Vacila em break point', kind: 'weakness' });
  }
  for (const [surf, label] of [['clay', 'no saibro'], ['hard', 'na dura'], ['grass', 'na grama']]) {
    const e = player[surf];
    if (e == null) continue;
    const d = e - player.elo;
    if (d >= 60) tags.push({ t: `Especialista ${label}`, kind: 'strength' });
    else if (d <= -60) tags.push({ t: `Rende menos ${label}`, kind: 'relative' });
  }
  return tags;
}
```

(Os testes antigos chamam `playerTags(p)` sem `tour` → default `'ATP'` = limiares atuais → continuam passando.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/player-tags.test.js`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS (nada de regressão).

- [ ] **Step 6: Commit**

```bash
git add web/src/analysis.js tests/player-tags.test.js
git commit -m "Analise: playerTags com limiares de saque por circuito"
```

---

## Task 4: Gerar e commitar `model-wta.json` com saque

**Files:**
- Modify: `web/model-wta.json` (regenerado pelo pipeline)

- [ ] **Step 1: Rodar o pipeline de saque (ATP+WTA)**

Run: `node pipeline/serve-stats.js`
Expected (stdout): duas linhas "…: N jogadores com perfil de saque." — ATP ~200+ e WTA ~210.

- [ ] **Step 2: Conferir o enriquecimento da WTA**

Run:
```bash
node -e 'const m=require("./web/model-wta.json");const s=m.players.find(p=>p.name.startsWith("Swiatek"));console.log("Swiatek serve:",!!s.serve, s.serve?("dev "+Math.round(s.serve.returnPtsWonPct*100)+"%"):"")'
```
Expected: `Swiatek serve: true dev 48%` (ou próximo).

- [ ] **Step 3: Manter o diff focado na WTA — restaurar o `model-atp.json`**

O pipeline reescreve os dois modelos; o ATP muda só por dados novos (o robô refaz diário).
Para o diff desta feature ficar só na WTA:

Run: `git checkout -- web/model-atp.json`
Then: `git status --short web/` → deve listar só `web/model-wta.json` como modificado.

- [ ] **Step 4: Commit**

```bash
git add web/model-wta.json
git commit -m "Dados: model-wta.json enriquecido com perfil de saque/devolucao"
```

---

## Task 5: Dossiê — pills de referência, tags por circuito e faixa

**Files:**
- Modify: `web/app.js` (import, `openDossier`, novas constantes/render)

- [ ] **Step 1: Ampliar o import de analysis**

Em `web/app.js` linha 5:

```js
import { analyzeMatch, playerTags, buildReadingExplanation, serveBand } from './src/analysis.js';
```

- [ ] **Step 2: Adicionar o conteúdo estático e o render da faixa do dossiê**

Em `web/app.js`, **antes** de `function openDossier(player) {`, adicionar:

```js
const DOSSIER_EXPLAIN = [
  { term: 'Elo — o nível geral', what: 'Nota que resume o jogador: vence sobe, perde desce, e bater um forte vale mais. Quanto maior, melhor. O número de jogos é o tamanho da amostra por trás da nota.' },
  { term: 'As tags coloridas', what: 'Resumos automáticos do que os números dizem. <b style="color:var(--green)">Verde</b> = força; <b style="color:var(--amber)">âmbar</b> = rende menos numa superfície (relativo a ele); <b style="color:var(--red)">vermelho</b> = fraqueza. Saem do saque/devolução e da diferença de Elo por piso.' },
  { term: 'Elo por superfície & rank', what: 'O <b>piso</b> é o Elo contando só os jogos naquela superfície. O <b>"top 10 no circuito"</b> é a posição desse piso entre os jogadores ativos.' },
];
const DOSSIER_EXPLAIN_SERVE = { term: 'Saque & devolução', what: 'Percentuais tirados do histórico. A etiqueta ao lado (<b>na média / acima / elite</b>) mostra onde ele está no circuito — porque o número sozinho engana: <b>40% de devolução parece pouco, mas no ATP é elite</b> (a média fica bem abaixo).' };

function renderDossierExplain(st, hasServe) {
  if (!st.explainOpen) {
    return `<button class="explain-head" id="dos-explain" aria-expanded="false">
        <span>O que significam esses números?</span><span class="explain-caret">▸</span>
      </button>`;
  }
  const blocks = hasServe ? [...DOSSIER_EXPLAIN, DOSSIER_EXPLAIN_SERVE] : DOSSIER_EXPLAIN;
  const blk = (b) => `<div class="explain-blk"><div class="explain-term">${b.term}</div><div class="explain-what">${b.what}</div></div>`;
  return `
    <div class="explain">
      <button class="explain-head open" id="dos-explain" aria-expanded="true">
        <span>O que significam esses números?</span><span class="explain-caret">▾</span>
      </button>
      <div class="explain-body">${blocks.map(blk).join('')}</div>
    </div>`;
}
```

- [ ] **Step 3: Reescrever `openDossier` para ser re-renderizável, com pills e faixa**

Substituir a função `openDossier` inteira (de `function openDossier(player) {` até o `}` que fecha antes de `function tagPill`) por:

```js
function openDossier(player) {
  const root = document.getElementById('modal-root');
  const st = { explainOpen: false };

  function draw() {
    const tags = playerTags(player, anal.tour);
    const s = player.serve;
    const p100 = (x) => `${Math.round(x * 100)}%`;
    const srow = (surf, lbl) => {
      if (player[surf] == null) return '';
      const rl = rankLabel(surfaceRank(player, surf));
      return `<div class="dos-srow"><span>${lbl}${rl ? ` <span class="field-hint">· ${rl} no circuito</span>` : ''}</span><strong>${player[surf]}</strong></div>`;
    };
    const svRow = (key, lbl) => {
      const v = s[key];
      const r = serveBand(anal.tour, key, v);
      const pill = r ? `<span class="refpill ref-${r.band}">${r.label}</span>` : '';
      return `<div class="dos-srow"><span>${lbl}</span><span class="dos-srv-val"><strong>${p100(v)}</strong>${pill}</span></div>`;
    };
    root.innerHTML = `
      <div class="modal-overlay" id="dos-overlay">
        <div class="modal-sheet">
          <div class="dossier">
            <div class="dos-photo" id="dos-photo"><span class="dos-avatar">${initials(player.name)}</span></div>
            <div class="dos-name">${player.name}</div>
            <div class="dos-elo">Elo ${player.elo}${player.matches ? ` · ${player.matches} jogos` : ''}</div>
            ${tags.length ? `<div class="dos-tags">${tags.map((t) => `<span class="pill ${{ strength: 'pill-green', relative: 'pill-amber', weakness: 'pill-red' }[t.kind] || 'pill-muted'}">${t.t}</span>`).join('')}</div>` : ''}
            <div class="dos-section">Elo por superfície</div>
            <div class="dos-surf">${srow('clay', 'Saibro')}${srow('hard', 'Dura')}${srow('grass', 'Grama')}</div>
            ${s
              ? `<div class="dos-section">Saque &amp; devolução</div>
                 <div class="dos-serve">
                   ${svRow('servePtsWonPct', 'Pontos ganhos no saque')}
                   ${svRow('firstInPct', '1º saque dentro')}
                   ${svRow('acePct', 'Aces (por ponto de saque)')}
                   ${svRow('returnPtsWonPct', 'Pontos de devolução ganhos')}
                   ${svRow('bpSavedPct', 'Break points salvos')}
                 </div>`
              : ''}
            ${renderDossierExplain(st, !!s)}
          </div>
          <div class="modal-actions"><button class="btn btn-ghost" id="dos-close">Fechar</button></div>
        </div>
      </div>`;
    root.querySelector('#dos-close').addEventListener('click', () => (root.innerHTML = ''));
    root.querySelector('#dos-overlay').addEventListener('click', (e) => { if (e.target.id === 'dos-overlay') root.innerHTML = ''; });
    root.querySelector('#dos-explain')?.addEventListener('click', () => { st.explainOpen = !st.explainOpen; draw(); });
    loadPhoto(player);
  }

  draw();
}
```

- [ ] **Step 4: Verificação manual rápida (sem estilo das pills)**

Run: `npm run dev` (se a porta 5173 já estiver ocupada, use o servidor que já roda) e abra `http://localhost:5173`.
Passos: aba Análise → circuito **WTA** → escolher uma jogadora (ex.: Swiatek) → tocar no slot → abrir dossiê (na verdade: escolher 2 jogadoras e tocar na linha do confronto para o dossiê, ou tocar direto). Confirmar:
- A seção "Saque & devolução" aparece para a WTA (antes não aparecia).
- Cada stat tem um texto de referência ao lado (ainda cru, sem cor).
- A faixa "O que significam esses números?" abre/fecha.

- [ ] **Step 5: Commit**

```bash
git add web/app.js
git commit -m "Dossie: pills de referencia por circuito, tags por circuito e faixa explicativa"
```

---

## Task 6: Estilo das pills de referência

**Files:**
- Modify: `web/styles.css` (fim do arquivo)

- [ ] **Step 1: Adicionar as classes**

Adicionar ao fim de `web/styles.css`:

```css
/* ===== Pills de referência de saque (dossiê) ===== */
.dos-srv-val { display: inline-flex; align-items: center; gap: 8px; }
.refpill {
  font-size: 10px; padding: 1px 8px; border-radius: 999px; border: 1px solid; white-space: nowrap;
}
.ref-elite { color: var(--green); border-color: var(--green); }
.ref-high { color: #7dd3a8; border-color: #2f6b4b; }
.ref-mid { color: var(--muted); border-color: var(--border); }
.ref-low { color: var(--amber); border-color: rgba(245, 158, 11, 0.5); }
```

- [ ] **Step 2: Verificação manual do visual**

Run: `npm run dev` e abra `http://localhost:5173` (recarregue).
Passos: dossiê de uma jogadora WTA (Swiatek) e de um jogador ATP (Sinner).
Expected:
- WTA: devolução da Swiatek com pill **elite** (verde); saque em faixa condizente.
- ATP: Sinner com pills nas faixas do ATP (devolução ~41% também elite; saque elite).
- Nada estoura a largura no mobile (~380px). A faixa abre/fecha.

- [ ] **Step 3: Commit**

```bash
git add web/styles.css
git commit -m "Dossie: estilo das pills de referencia de saque"
```

---

## Task 7: Robô diário — rótulo do passo

**Files:**
- Modify: `.github/workflows/update-model.yml`

- [ ] **Step 1: Atualizar o nome do passo (o comando já enriquece os dois)**

Em `.github/workflows/update-model.yml`, trocar:

```yaml
      - name: Enriquecer o ATP com stats de saque (dossiês)
        run: node pipeline/serve-stats.js
```

por:

```yaml
      - name: Enriquecer ATP e WTA com stats de saque (dossiês)
        run: node pipeline/serve-stats.js
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/update-model.yml
git commit -m "CI: passo de saque enriquece ATP e WTA"
```

---

## Task 8: Verificação final e suíte

- [ ] **Step 1: Rodar a suíte completa**

Run: `npm test`
Expected: PASS (todos, incluindo os novos de serve-stats, serveBand e playerTags).

- [ ] **Step 2: Verificação de ponta a ponta no navegador (via DOM)**

Confirmar, para uma jogadora **WTA** e um jogador **ATP**:
- Dossiê mostra saque/devolução com a pill de referência do circuito correto.
- Tags coerentes (nenhuma jogadora WTA marcada indevidamente como "Devolvedor forte" por causa de limiar de ATP).
- Faixa "O que significam esses números?" abre com os 4 blocos (WTA e ATP) e o bloco de saque aparece.

- [ ] **Step 3: Confirmar árvore limpa (sem churn no model-atp.json)**

Run: `git status --short`
Expected: limpo (ou só o que for de propósito). `web/model-atp.json` **não** deve estar modificado.

---

## Cobertura da spec (auto-revisão)

- **Dados de saque WTA** (fonte archive/jsDelivr) → Task 1 (fonte/pipeline) + Task 4 (gera/commita `model-wta.json`) + Task 7 (robô).
- **`main()` não roda no import (corrige efeito colateral em `npm test`)** → Task 1 Step 3.
- **Faixas de referência por circuito** (`serveBand`) → Task 2.
- **Tags por circuito** (`playerTags(player, tour)`) → Task 3.
- **Dossiê: pills + tags por circuito + faixa; `openDossier` re-renderizável** → Task 5.
- **Estilo das pills** → Task 6.
- **Bordas** (sem serve → seção some e faixa omite bloco 4; valor 0 → sem pill) → Task 5 Step 3 (`s ? … : ''`, `serveBand` retorna null).
- **Testes** (serveBand ATP×WTA, playerTags por circuito, accumulate/applyServe) → Tasks 1–3.
