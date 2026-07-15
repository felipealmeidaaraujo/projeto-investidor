# Cobertura Challenger ATP + WTA 125 — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ampliar o universo de jogadores do app (ATP ~192→~700–900 ativos; WTA ~211→~400) adicionando Challenger ATP + WTA 125 (mirror Sackmann) sobre o tour do tennis-data, com Elo unificado.

**Architecture:** Um ingestor novo baixa os CSVs de Challenger/125 (só `tourney_level === 'C'`). O `train.js` combina essas partidas com o tennis-data, canonicalizando os nomes Sackmann ("Carlos Alcaraz") para o espaço do modelo ("Alcaraz C.") quando o jogador transita entre níveis, e mantendo o nome completo para o Challenger puro (evita misturar irmãos/homônimos). O scouting (`matches.json`) recebe as mesmas partidas; o dossiê ganha um selo "Challenger".

**Tech Stack:** Node ESM (sem build), `fetch` nativo, `node:test` + `node:assert/strict`, PWA em `web/` publicada por GitHub Pages.

**Branch:** `feat/cobertura-challenger` (já criado, spec commitada).

---

## Arquivos

- **Modificar** `web/src/match-names.js` — endurecer o matcher (nome-do-meio) + `canonicalName`.
- **Criar** `pipeline/ingest-sackmann.js` — baixar/parsear/filtrar Challenger (level C), sem odds.
- **Modificar** `pipeline/train.js` — combinar fontes + campo `level` por jogador.
- **Modificar** `pipeline/matches.js` — incluir Challenger canonicalizado no scouting.
- **Modificar** `web/app.js` — selo "Challenger" no dossiê.
- **Testes:** `tests/match-names.test.js` (estender), `tests/ingest-sackmann.test.js` (novo).
- Sem mudança no `.github/workflows/update-model.yml` (já chama `train.js`, `serve-stats.js`, `matches.js`).

---

## Task 1: Endurecer `match-names.js` + `canonicalName`

**Files:**
- Modify: `web/src/match-names.js`
- Test: `tests/match-names.test.js`

- [ ] **Step 1: Escrever os testes falhando** (adicionar ao fim de `tests/match-names.test.js`)

```js
import { canonicalName } from '../web/src/match-names.js'; // adicionar ao import existente no topo

test('matchPlayer: nome do meio (Juan Pablo Varillas) casa Varillas J.', () => {
  const pl = [...players, { name: 'Varillas J.' }];
  assert.equal(matchPlayer('Juan Pablo Varillas', pl)?.name, 'Varillas J.');
});

test('canonicalName: transita → nome do modelo; puro → fullName', () => {
  assert.equal(canonicalName('Jannik Sinner', players), 'Sinner J.');
  assert.equal(canonicalName('Fulano Puro', players), 'Fulano Puro');
});

test('canonicalName: irmãos/homônimos puros ficam separados', () => {
  assert.equal(canonicalName('Petros Tsitsipas', players), 'Petros Tsitsipas');
  assert.equal(canonicalName('Pavlos Tsitsipas', players), 'Pavlos Tsitsipas');
});
```

> Observação: o `import { canonicalName }` deve ser mesclado na linha de import já existente
> (`import { normName, matchPlayer, matchesModelName } from '../web/src/match-names.js';`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- tests/match-names.test.js` (ou `node --test tests/match-names.test.js`)
Expected: FAIL — `canonicalName is not a function` e o teste de Varillas falha (matcher atual não pega nome-do-meio).

- [ ] **Step 3: Reescrever `web/src/match-names.js` inteiro**

```js
// Casa nomes completos ("Jannik Sinner") com os do modelo ("Sinner J.").
// Estratégia: sobrenome normalizado (candidatos p/ nome-do-meio) + inicial do primeiro nome.

export function normName(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Nome do modelo "Sobrenome... I." → { surname, initial }. */
function parseModelName(name) {
  const tokens = name.trim().split(/\s+/);
  const initial = (tokens[tokens.length - 1].replace(/\./g, '')[0] || '').toLowerCase();
  const surname = normName(tokens.slice(0, -1).join(''));
  return { surname, initial };
}

/** Nome completo → inicial do 1º nome + candidatos de sobrenome.
 *  Candidatos = "tudo após o 1º token" (pega "de Minaur", "Bautista Agut") E
 *  "só o último token" (pega nome-do-meio: "Juan Pablo Varillas" → "Varillas"). */
function fullNameKey(full) {
  const tokens = full.trim().split(/\s+/);
  if (tokens.length < 2) return { initial: '', cands: [normName(full)].filter(Boolean) };
  const initial = (tokens[0][0] || '').toLowerCase();
  const rest = tokens.slice(1);
  const cands = [...new Set([normName(rest.join('')), normName(rest[rest.length - 1])])].filter(Boolean);
  return { initial, cands };
}

/** Acha o jogador do modelo correspondente ao nome completo (ou null). */
export function matchPlayer(fullName, players) {
  const { initial, cands } = fullNameKey(fullName);
  for (const p of players) {
    const m = parseModelName(p.name);
    if (m.surname && cands.includes(m.surname) && (initial === '' || m.initial === initial)) return p;
  }
  return null;
}

/** Um nome completo ("Carlos Alcaraz") e um nome de modelo ("Alcaraz C.") são o mesmo jogador? */
export function matchesModelName(fullName, modelName) {
  const { initial, cands } = fullNameKey(fullName);
  const m = parseModelName(modelName);
  return !!m.surname && cands.includes(m.surname) && (initial === '' || m.initial === initial);
}

/** Nome canônico p/ o Elo: nome do modelo se o jogador transita; senão o próprio fullName (puro). */
export function canonicalName(fullName, players) {
  return matchPlayer(fullName, players)?.name ?? fullName;
}
```

- [ ] **Step 4: Rodar o teste do arquivo e ver passar**

Run: `npm test -- tests/match-names.test.js`
Expected: PASS (todos, incluindo Varillas e os irmãos Tsitsipas).

- [ ] **Step 5: Rodar a suíte inteira (regressão em closings/serve-stats)**

Run: `npm test`
Expected: PASS em tudo (o matcher novo é superset do antigo; `closings.test.js` e `serve-stats.test.js` continuam verdes).

- [ ] **Step 6: Commit**

```bash
git add web/src/match-names.js tests/match-names.test.js
git commit -m "feat(nomes): canonicalName + matcher tolera nome-do-meio"
```

---

## Task 2: `pipeline/ingest-sackmann.js` (novo)

**Files:**
- Create: `pipeline/ingest-sackmann.js`
- Test: `tests/ingest-sackmann.test.js`

- [ ] **Step 1: Escrever o teste falhando** (`tests/ingest-sackmann.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { challengerMatches } from '../pipeline/ingest-sackmann.js';

const csv = [
  'tourney_level,surface,tourney_date,winner_name,loser_name',
  'C,Hard,20250106,Titouan Droguet,Jan Choinski',      // challenger → entra
  'A,Hard,20241230,Yoshihito Nishioka,Benjamin Bonzi',  // quali de tour → fora
  'C,Clay,20250310,,Foo Bar',                           // sem winner → descarta
  'C,,20250310,A B,C D',                                // sem surface → descarta
].join('\n');

test('challengerMatches: só level C, formato normalizado, descarta incompletas', () => {
  const m = challengerMatches(csv);
  assert.equal(m.length, 1);
  assert.deepEqual(m[0], {
    dateInt: 20250106, surface: 'hard', winnerFull: 'Titouan Droguet', loserFull: 'Jan Choinski',
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- tests/ingest-sackmann.test.js`
Expected: FAIL — `Cannot find module '../pipeline/ingest-sackmann.js'`.

- [ ] **Step 3: Criar `pipeline/ingest-sackmann.js`**

```js
// Ingestão de Challenger ATP / WTA 125 do mirror Sackmann (só tourney_level 'C', sem odds).
// Uso: import { loadChallenger } from './ingest-sackmann.js'
import { parseCsv } from './ingest.js';

const BASE = 'https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main';
const fileFor = (year, tour) =>
  tour === 'WTA' ? `wta/wta_matches_qual_itf_${year}.csv` : `atp/atp_matches_qual_chall_${year}.csv`;

/** Texto CSV → partidas de Challenger/125 (só level 'C'). Puro (testável). */
export function challengerMatches(text) {
  const out = [];
  for (const row of parseCsv(text)) {
    if (row.tourney_level !== 'C') continue;
    const dateInt = parseInt(row.tourney_date, 10);
    const surface = (row.surface || '').toLowerCase() || null;
    if (!Number.isFinite(dateInt) || !surface || !row.winner_name || !row.loser_name) continue;
    out.push({ dateInt, surface, winnerFull: row.winner_name, loserFull: row.loser_name });
  }
  return out;
}

/** Baixa um ano (IO). Ano faltando → lança (tratado por loadChallenger). */
export async function fetchChallengerYear(year, tour = 'ATP') {
  const res = await fetch(`${BASE}/${fileFor(year, tour)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${fileFor(year, tour)}`);
  return challengerMatches(await res.text());
}

/** Carrega um intervalo de anos, ordenado por data. Tolera ano faltando. */
export async function loadChallenger(from, to, tour = 'ATP') {
  const years = [];
  for (let y = from; y <= to; y++) years.push(y);
  const chunks = await Promise.all(
    years.map(async (y) => {
      try { return await fetchChallengerYear(y, tour); }
      catch (e) { console.warn(`aviso: Challenger ${tour} ${y} ignorado (${e.message})`); return []; }
    })
  );
  return chunks.flat().sort((a, b) => a.dateInt - b.dateInt);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- tests/ingest-sackmann.test.js`
Expected: PASS.

- [ ] **Step 5: Smoke test de rede (opcional, manual)**

Run: `node -e "import('./pipeline/ingest-sackmann.js').then(async m => { const r = await m.loadChallenger(2025,2025,'ATP'); console.log(r.length, r[0]); })"`
Expected: alguns milhares de partidas; primeiro objeto no formato `{ dateInt, surface, winnerFull, loserFull }`.

- [ ] **Step 6: Commit**

```bash
git add pipeline/ingest-sackmann.js tests/ingest-sackmann.test.js
git commit -m "feat(pipeline): ingestor de Challenger/125 do mirror Sackmann (level C)"
```

---

## Task 3: `train.js` combina fontes + campo `level`

**Files:**
- Modify: `pipeline/train.js`

Sem teste unitário novo (é script de IO). Verificação por execução (Step 3+).

- [ ] **Step 1: Reescrever `pipeline/train.js` inteiro**

```js
// Treina o modelo Elo de um circuito (ATP ou WTA) combinando tennis-data (tour + odds/frescor)
// com Challenger/125 do mirror Sackmann. Marca ativos e o nível de origem de cada jogador.
// Uso: node pipeline/train.js [ATP|WTA] [anoInicio] [anoFim]
import { writeFile } from 'node:fs/promises';
import { EloEngine } from './elo-engine.js';
import { loadTennisData } from './ingest-tennisdata.js';
import { loadChallenger } from './ingest-sackmann.js';
import { canonicalName } from '../web/src/match-names.js';
import { fitTemperature } from './calibrate.js';

const TOUR = (process.argv[2] || 'ATP').toUpperCase();
const FROM = Number(process.argv[3]) || 2013;
const TO = Number(process.argv[4]) || new Date().getFullYear();
const MIN_MATCHES = 20;
const warmupInt = (FROM + 2) * 10000;
const splitInt = (TO - 3) * 10000;

console.log(`Baixando ${TOUR} ${FROM}–${TO} (tennis-data + Challenger Sackmann)...`);
const tour = await loadTennisData(FROM, TO, TOUR);
for (const m of tour) m.src = 'tour';

// universo de nomes do tour, p/ canonicalizar os nomes do Sackmann (quem transita unifica)
const tourNames = new Set();
for (const m of tour) { tourNames.add(m.winner); tourNames.add(m.loser); }
const tourPlayers = [...tourNames].map((name) => ({ name }));

const challRaw = await loadChallenger(FROM, TO, TOUR);
const chall = challRaw.map((m) => ({
  dateInt: m.dateInt,
  surface: m.surface,
  winner: canonicalName(m.winnerFull, tourPlayers),
  loser: canonicalName(m.loserFull, tourPlayers),
  src: 'chall',
}));

const matches = [...tour, ...chall].sort((a, b) => a.dateInt - b.dateInt);
const maxDate = matches[matches.length - 1].dateInt;
console.log(`${tour.length} tour + ${chall.length} challenger = ${matches.length} partidas (até ${maxDate}). Treinando ${TOUR}...`);

const engine = new EloEngine();
const origin = new Map(); // name -> { tour, chall }
const fitPreds = [];
for (const m of matches) {
  if (!m.surface) continue;
  const rW = engine.rating(m.winner, m.surface);
  const rL = engine.rating(m.loser, m.surface);
  let favP, favOut;
  if (rW > rL) { favP = engine.predict(m.winner, m.loser, m.surface); favOut = 1; }
  else if (rL > rW) { favP = engine.predict(m.loser, m.winner, m.surface); favOut = 0; }
  else if (m.winner < m.loser) { favP = engine.predict(m.winner, m.loser, m.surface); favOut = 1; }
  else { favP = engine.predict(m.loser, m.winner, m.surface); favOut = 0; }
  if (m.dateInt >= warmupInt && m.dateInt < splitInt) fitPreds.push({ p: favP, outcome: favOut });
  const key = m.src === 'chall' ? 'chall' : 'tour';
  for (const nm of [m.winner, m.loser]) {
    const e = origin.get(nm) || { tour: 0, chall: 0 };
    e[key] += 1; origin.set(nm, e);
  }
  engine.processMatch({ winner: m.winner, loser: m.loser, surface: m.surface, dateInt: m.dateInt });
}

const T = fitTemperature(fitPreds);
const r = (x) => (x == null ? null : Math.round(x));
const activeCutoff = (Math.floor(maxDate / 10000) - 1) * 10000;

const players = [...engine.players.entries()]
  .map(([name, p]) => {
    const o = origin.get(name) || { tour: 0, chall: 0 };
    return {
      name,
      elo: r(p.overall),
      hard: r(p.surfaces.hard),
      clay: r(p.surfaces.clay),
      grass: r(p.surfaces.grass),
      matches: p.matches,
      matchesBySurface: {
        hard: p.surfaceMatches.hard ?? 0,
        clay: p.surfaceMatches.clay ?? 0,
        grass: p.surfaceMatches.grass ?? 0,
      },
      lastDate: p.lastDate,
      active: p.lastDate >= activeCutoff,
      level: o.chall > o.tour ? 'challenger' : 'tour',
    };
  })
  .filter((p) => p.matches >= MIN_MATCHES)
  .sort((a, b) => b.elo - a.elo);

const model = {
  generatedAt: new Date().toISOString(),
  tour: TOUR,
  source: 'tennis-data.co.uk + sackmann-challenger',
  yearsFrom: FROM,
  yearsTo: TO,
  dataThrough: maxDate,
  calibrationT: T,
  activeCutoff,
  playerCount: players.length,
  activeCount: players.filter((p) => p.active).length,
  challengerCount: players.filter((p) => p.level === 'challenger').length,
  players,
};

await writeFile(new URL(`../web/model-${TOUR.toLowerCase()}.json`, import.meta.url), JSON.stringify(model));
console.log(`\nmodel-${TOUR.toLowerCase()}.json salvo: ${players.length} jogadores (${model.activeCount} ativos, ${model.challengerCount} challenger), T=${T}, dados até ${maxDate}\n`);

console.log(`=== TOP 12 ATIVOS ${TOUR} POR ELO ===`);
players.filter((p) => p.active).slice(0, 12).forEach((p, i) =>
  console.log(`${String(i + 1).padStart(2)}. ${p.name.padEnd(22)} Elo ${p.elo}  (hard ${p.hard ?? '—'} / clay ${p.clay ?? '—'} / grass ${p.grass ?? '—'})`)
);
```

- [ ] **Step 2: Rodar os testes (garante que nada quebrou nos imports)**

Run: `npm test`
Expected: PASS (train.js não é testado, mas os módulos que ele importa sim).

- [ ] **Step 3: Executar o treino ATP e conferir invariantes**

Run: `node pipeline/train.js ATP`
Expected:
- `activeCount` **bem maior** que 192 (esperado ~700–900).
- Sem erro; imprime top 12.

Verificar Droguet e a separação dos irmãos:
Run:
```bash
node -e "const m=require('./web/model-atp.json'); const d=m.players.find(p=>/Droguet/i.test(p.name)); console.log('Droguet:', d && {name:d.name, matches:d.matches, level:d.level, active:d.active}); console.log('Tsitsipas:', m.players.filter(p=>/Tsitsipas/i.test(p.name)).map(p=>p.name));"
```
Expected:
- Droguet presente com `matches` ~150+ e `level: 'challenger'`.
- Lista de Tsitsipas inclui **"Petros Tsitsipas" e "Pavlos Tsitsipas" separados** (além de "Tsitsipas S." do tour).

- [ ] **Step 4: Executar o treino WTA**

Run: `node pipeline/train.js WTA`
Expected: `activeCount` maior que 211 (esperado ~350–450); sem erro.

- [ ] **Step 5: Commit**

```bash
git add pipeline/train.js
git commit -m "feat(train): combinar tennis-data + Challenger e marcar level por jogador"
```

---

## Task 4: `matches.js` inclui Challenger no scouting

**Files:**
- Modify: `pipeline/matches.js`

- [ ] **Step 1: Reescrever `pipeline/matches.js` inteiro**

```js
// Gera web/matches.json com o histórico de partidas (~3 anos, ATP+WTA, tour + Challenger)
// pra forma/descanso/H2H. Rode: node pipeline/matches.js
import { writeFile } from 'node:fs/promises';
import { fetchTennisDataYear } from './ingest-tennisdata.js';
import { loadChallenger } from './ingest-sackmann.js';
import { canonicalName } from '../web/src/match-names.js';

function ymdOf(d) {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

async function build() {
  const cutoff = ymdOf(new Date(Date.now() - 3 * 365 * 86400000)); // ~3 anos
  const fromYear = Math.floor(cutoff / 10000);
  const nowYear = new Date().getUTCFullYear();
  const years = [];
  for (let y = fromYear; y <= nowYear; y++) years.push(y);
  const out = { generatedAt: new Date().toISOString(), count: 0, matches: [] };

  for (const tour of ['ATP', 'WTA']) {
    // tour (tennis-data): fonte + universo de nomes p/ canonicalizar o Challenger
    const tourNames = new Set();
    for (const year of years) {
      let ms = [];
      try {
        ms = await fetchTennisDataYear(year, tour);
      } catch (e) {
        console.warn(`${tour} ${year} ignorado: ${e.message}`);
        continue;
      }
      for (const m of ms) {
        if (!m.dateInt || m.dateInt < cutoff || !m.winner || !m.loser) continue;
        out.matches.push({ date: m.dateInt, surface: m.surface, tour, winner: m.winner, loser: m.loser });
        tourNames.add(m.winner); tourNames.add(m.loser);
      }
    }
    const tourPlayers = [...tourNames].map((name) => ({ name }));

    // Challenger (Sackmann): canonicaliza contra o universo do tour
    let chall = [];
    try {
      chall = await loadChallenger(fromYear, nowYear, tour);
    } catch (e) {
      console.warn(`Challenger ${tour} ignorado: ${e.message}`);
    }
    for (const m of chall) {
      if (!m.dateInt || m.dateInt < cutoff || !m.surface) continue;
      out.matches.push({
        date: m.dateInt,
        surface: m.surface,
        tour,
        winner: canonicalName(m.winnerFull, tourPlayers),
        loser: canonicalName(m.loserFull, tourPlayers),
      });
    }
  }

  out.matches.sort((a, b) => a.date - b.date);
  out.count = out.matches.length;
  if (out.count === 0) {
    console.warn('matches.json: 0 partidas — mantendo o arquivo anterior.');
    return;
  }
  await writeFile(new URL('../web/matches.json', import.meta.url), JSON.stringify(out));
  console.log(`matches.json: ${out.count} partidas desde ${cutoff}`);
}

build();
```

- [ ] **Step 2: Executar e medir o peso**

Run: `node pipeline/matches.js`
Then: `ls -l web/matches.json` (ou `node -e "console.log((require('fs').statSync('web/matches.json').size/1048576).toFixed(2)+' MB')"`)
Expected: gera o arquivo; anotar o tamanho.

- [ ] **Step 3: Decisão de peso (condicional — sem cap silencioso)**

- Se `matches.json` **≤ ~3,5 MB**: seguir (GitHub Pages serve gzip ~1/5 → ~0,7 MB na rede). OK.
- Se **> ~3,5 MB**: reduzir a janela **só do Challenger** para ~2 anos. Trocar, dentro do laço,
  o filtro do Challenger por um cutoff próprio:
  ```js
  const challCutoff = ymdOf(new Date(Date.now() - 2 * 365 * 86400000)); // ~2 anos p/ Challenger
  // ...
  if (m.dateInt < challCutoff || !m.surface) continue;
  ```
  Registrar no commit qual janela ficou (transparência: nada de corte escondido).

- [ ] **Step 4: Conferir que Droguet tem partidas no scouting**

Run:
```bash
node -e "const j=require('./web/matches.json'); const n=j.matches.filter(m=>/Droguet/i.test(m.winner)||/Droguet/i.test(m.loser)).length; console.log('partidas com Droguet:', n);"
```
Expected: dezenas (antes: ~0, pois não aparecia).

- [ ] **Step 5: Commit**

```bash
git add pipeline/matches.js web/matches.json
git commit -m "feat(scouting): incluir Challenger no matches.json (canonicalizado)"
```

---

## Task 5: Selo "Challenger" no dossiê

**Files:**
- Modify: `web/app.js` (dentro de `openDossier`/`draw`, a linha do `.dos-elo`, ~1083)

- [ ] **Step 1: Editar a linha do `.dos-elo`**

Trocar a linha atual:
```js
            <div class="dos-elo">Elo ${player.elo}${player.matches ? ` · ${player.matches} jogos` : ''}</div>
```
por:
```js
            <div class="dos-elo">Elo ${player.elo}${player.matches ? ` · ${player.matches} jogos` : ''}${player.level === 'challenger' ? ' <span class="pill pill-muted">Challenger</span>' : ''}</div>
            ${player.level === 'challenger' ? '<div class="field-hint" style="margin-top:2px">Base Challenger/125 — Elo menos calibrado que o do tour.</div>' : ''}
```

- [ ] **Step 2: Verificação visual no app real**

Servir e abrir o app (não só um módulo):
Run: `npm run dev` → abrir `http://localhost:5173/` → aba **Análise** → ATP → tocar num jogador
de Challenger (ex.: buscar "Droguet") → o dossiê mostra o selo **Challenger** e a nota.
Um jogador de tour (ex.: Alcaraz) **não** mostra o selo.

> Se o browser-pane estiver instável (ver memória), verificar via `get_page_text` + JS no DOM.

- [ ] **Step 3: Commit**

```bash
git add web/app.js
git commit -m "feat(dossie): selo Challenger + nota de Elo menos calibrado"
```

---

## Task 6: Verificação integrada e fechamento

**Files:** nenhum novo — gera artefatos e valida ponta a ponta.

- [ ] **Step 1: Regenerar todos os artefatos na ordem do robô**

Run:
```bash
node pipeline/train.js ATP
node pipeline/train.js WTA
node pipeline/serve-stats.js
node pipeline/matches.js
```
Expected: sem erros; `model-atp.json`, `model-wta.json`, `matches.json` atualizados.

- [ ] **Step 2: Rodar a suíte completa**

Run: `npm test`
Expected: PASS (todos — os ~128+ testes anteriores + os novos de `ingest-sackmann` e `match-names`).

- [ ] **Step 3: Conferir invariantes finais**

Run:
```bash
node -e "for (const t of ['atp','wta']){const m=require('./web/model-'+t+'.json'); console.log(t.toUpperCase(), 'total='+m.playerCount, 'ativos='+m.activeCount, 'challenger='+m.challengerCount);}"
```
Expected: ATP ativos ~700–900; WTA ativos ~350–450; `challengerCount` > 0 nos dois.

- [ ] **Step 4: Commit dos artefatos regenerados (se mudaram)**

```bash
git add web/model-atp.json web/model-wta.json web/matches.json
git commit -m "chore: regenerar modelos e scouting com Challenger" || echo "nada a commitar"
```

- [ ] **Step 5: Revisão de código (requesting-code-review) + finishing-a-development-branch**

Usar a skill `superpowers:requesting-code-review` para revisão adversarial do diff da branch.
Depois `superpowers:finishing-a-development-branch` para decidir merge no `main` (que re-deploya
o Pages) — só com testes verdes e verificação visual feita.

---

## Cobertura da spec (self-check)

- Fonte Challenger/125 (level C) → Task 2. ✅
- Base tour = tennis-data, Sackmann só Challenger → Task 3 (combina, tour primeiro). ✅
- Reconciliação de nomes (transita→modelo; puro→fullName; irmãos separados; nome-do-meio) → Task 1. ✅
- Campo `level` + selo no dossiê → Task 3 e 5. ✅
- Scouting inclui Challenger + peso medido/mitigado → Task 4. ✅
- Sem odds (CLV/backtest fora) → nada a fazer (train não usa odds do Challenger; `closings.js`/backtest intocados). ✅
- Workflow → sem mudança (já chama os 3 scripts). ✅
- Testes: `match-names` (canonicalName, nome-do-meio, irmãos), `ingest-sackmann` (level C, formato) → Tasks 1–2. ✅
- Verificação por execução (Droguet ~169 jogos/level challenger; Tsitsipas separados; contagens) → Tasks 3 e 6. ✅
