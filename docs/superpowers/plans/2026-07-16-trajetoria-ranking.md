# Trajetória de Ranking e Momento de Carreira — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar no card do jogador se ele está em ascensão, no auge, estável ou em declínio — e, de brinde, consertar o ranking e a idade que hoje são exibidos congelados na data do último jogo.

**Architecture:** Um 4º script de enriquecimento (`rankings-ingest.js`) entra no cron depois do `patterns-ingest.js` e acrescenta `p.career` ao `model-*.json`, seguindo o par IO/puro que o projeto já usa. O pico histórico de 2010–2019 é imutável: calculado uma vez por um script one-shot e versionado como `data/peak-2010-2019.json` (238 KB), fora do cron. A classificação e o texto ficam em `web/src/career.js` (puro), porque o padrão do projeto é o pipeline guardar números crus e o `web/src/` gerar a leitura.

**Tech Stack:** Node 20, ES modules, zero dependências novas. `node:test` + `node:assert/strict` (`npm test` = `node --test`). JS puro no front — sem framework.

**Spec:** [docs/superpowers/specs/2026-07-16-trajetoria-ranking-design.md](../specs/2026-07-16-trajetoria-ranking-design.md)

## Global Constraints

- **Português do Brasil** em toda string de UI, nome de teste e mensagem de commit.
- **Regra de clareza (`clareza-zero-duvida`):** o número vai **sempre** embutido no texto. Sem gíria, sem abreviação enigmática, sem selo abstrato. Se precisa ser explicado, está errado.
- **Zero dependências novas.** `package.json` só tem `exceljs` (usado pelo pipeline).
- **Módulos em `web/src/` são puros:** sem DOM, sem import do app. `web/app.js` é o único arquivo que toca DOM.
- **Funções com `fetch` não são testadas** (não há mock no repo). Mantenha o IO fino e a lógica pura.
- **Todo módulo puro trata o caso nulo** e é testado nele (`bioText(null, 'ATP') === ''` é o precedente).
- **Nunca há fallback silencioso.** Ausência de dado vira estado próprio com motivo, nunca "Estável" por acidente.
- **Mirror:** `https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main`
- **Commits:** conventional commits em pt-BR, no padrão do repo (`feat(jogadores):`, `fix(robo):`).

---

### Task 1: Parse dos CSVs de ranking

O CSV da ATP tem 4 colunas e o da WTA tem 5 (`tours` a mais). Indexação posicional funciona nos dois — um parser que valide `length === 4` quebra na WTA.

**Files:**
- Create: `pipeline/rankings.js`
- Test: `tests/rankings.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `parseRankingRows(text) -> Array<{date: number, rank: number, id: string, points: number}>`

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/rankings.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRankingRows } from '../pipeline/rankings.js';

// ATP: ranking_date,rank,player,points
const CSV_ATP = [
  'ranking_date,rank,player,points',
  '20260608,1,207989,12050',
  '20260608,2,206173,11500',
  '20250609,1,206173,11000',
].join('\n');

// WTA: ranking_date,rank,player,points,tours  <- coluna EXTRA no fim
const CSV_WTA = [
  'ranking_date,rank,player,points,tours',
  '20260608,1,214544,10490,0',
  '20260608,2,216347,8178,0',
].join('\n');

test('parseRankingRows: lê o formato da ATP (4 colunas)', () => {
  const rows = parseRankingRows(CSV_ATP);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { date: 20260608, rank: 1, id: '207989', points: 12050 });
});

test('parseRankingRows: lê o formato da WTA (5 colunas, tours extra)', () => {
  const rows = parseRankingRows(CSV_WTA);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { date: 20260608, rank: 1, id: '214544', points: 10490 });
});

test('parseRankingRows: ignora cabeçalho, linhas vazias e lixo', () => {
  const rows = parseRankingRows(['ranking_date,rank,player,points', '', '20260608,1,207989,12050', ',,,', '20260608,,999,50'].join('\n'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, '207989');
});

test('parseRankingRows: pontos ausentes viram 0, não NaN', () => {
  const rows = parseRankingRows(['ranking_date,rank,player,points', '20260608,500,123456,'].join('\n'));
  assert.equal(rows[0].points, 0);
});

test('parseRankingRows: texto vazio devolve lista vazia', () => {
  assert.deepEqual(parseRankingRows(''), []);
  assert.deepEqual(parseRankingRows('ranking_date,rank,player,points'), []);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- tests/rankings.test.js`
Expected: FAIL — `Cannot find module '../pipeline/rankings.js'`

- [ ] **Step 3: Implementar o mínimo**

Crie `pipeline/rankings.js`:

```js
// Trajetória de ranking: parse dos CSVs do Sackmann, snapshots, pico e spike.
// Funções puras. O IO fica em rankings-ingest.js.
//
// NÃO use o parseCsv de ingest.js aqui: o arquivo dos anos 2020 tem 516 mil linhas
// e viraria 516 mil objetos. Estes CSVs são 4-5 colunas, sem aspas — split(',') basta.

/** Uma linha do CSV de ranking -> {date, rank, id, points}.
 *  ATP: ranking_date,rank,player,points | WTA: +coluna `tours` no fim (ignorada). */
export function parseRankingRows(text) {
  const rows = [];
  const lines = (text || '').split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) { // i=1: pula o cabeçalho
    const line = lines[i];
    if (!line) continue;
    const c = line.split(',');
    const date = Number(c[0]);
    const rank = Number(c[1]);
    const id = c[2];
    const points = Number(c[3]);
    if (!date || !rank || !id) continue;
    rows.push({ date, rank, id, points: Number.isFinite(points) ? points : 0 });
  }
  return rows;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- tests/rankings.test.js`
Expected: PASS — 5 testes

- [ ] **Step 5: Commit**

```bash
git add pipeline/rankings.js tests/rankings.test.js
git commit -m "feat(ranking): parse dos CSVs de ranking (ATP 4 col, WTA 5 col)"
```

---

### Task 2: Datas — snapshot mais recente e "12 meses atrás"

O snapshot mais recente é 20260608; o de 12 meses atrás precisa ser o **mais próximo disponível** (o ranking não sai toda semana — 2020 teve 27 semanas em vez de 47).

**Files:**
- Modify: `pipeline/rankings.js`
- Test: `tests/rankings.test.js`

**Interfaces:**
- Consumes: `parseRankingRows` (Task 1).
- Produces: `latestDate(rows) -> number|null`, `minus12Months(dateInt) -> number`, `nearestDate(dates, target) -> number|null`, `ageFrom(dobInt, whenInt) -> number|null`

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao fim de `tests/rankings.test.js`:

```js
import { latestDate, minus12Months, nearestDate, ageFrom } from '../pipeline/rankings.js';

test('latestDate: acha o snapshot mais recente', () => {
  assert.equal(latestDate(parseRankingRows(CSV_ATP)), 20260608);
  assert.equal(latestDate([]), null);
});

test('minus12Months: volta um ano no calendário', () => {
  assert.equal(minus12Months(20260608), 20250608);
  assert.equal(minus12Months(20260101), 20250101);
});

test('nearestDate: pega a data disponível mais próxima do alvo', () => {
  const dates = [20250602, 20250609, 20250616];
  assert.equal(nearestDate(dates, 20250608), 20250609); // 1 dia de distância
  assert.equal(nearestDate([], 20250608), null);
});

test('ageFrom: idade na data pedida, não hoje', () => {
  // Djokovic: dob 22/05/1987. Em 08/06/2026 tem 39,0.
  assert.equal(ageFrom(19870522, 20260608), 39);
});

test('ageFrom: rejeita o lixo do CSV (dob vazio, 19000000)', () => {
  assert.equal(ageFrom(0, 20260608), null);
  assert.equal(ageFrom(null, 20260608), null);
  assert.equal(ageFrom(19000000, 20260608), null); // daria 126 anos
  assert.equal(ageFrom(19870522, null), null);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- tests/rankings.test.js`
Expected: FAIL — `latestDate is not a function`

- [ ] **Step 3: Implementar o mínimo**

Adicione a `pipeline/rankings.js`:

```js
/** AAAAMMDD -> Date. */
const toDate = (int) => new Date(Math.floor(int / 10000), (Math.floor(int / 100) % 100) - 1, int % 100);
/** Date -> AAAAMMDD. */
const toInt = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

/** Data do snapshot mais recente (ou null). */
export function latestDate(rows) {
  let max = 0;
  for (const r of rows) if (r.date > max) max = r.date;
  return max || null;
}

/** Mesma data, um ano antes. */
export function minus12Months(dateInt) {
  const d = toDate(dateInt);
  d.setFullYear(d.getFullYear() - 1);
  return toInt(d);
}

/** A data disponível mais próxima do alvo (qualquer direção). */
export function nearestDate(dates, target) {
  let best = null;
  let bestDist = Infinity;
  const t = toDate(target);
  for (const d of dates) {
    const dist = Math.abs(toDate(d) - t);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return best;
}

/** Idade em anos (1 decimal) na data `whenInt`, a partir do dob AAAAMMDD.
 *  Rejeita o lixo do CSV: dob vazio, `19000000`, e qualquer idade fora de (0, 120). */
export function ageFrom(dobInt, whenInt) {
  if (!dobInt || !whenInt) return null;
  const dob = toDate(dobInt);
  const when = toDate(whenInt);
  if (Number.isNaN(dob.getTime()) || Number.isNaN(when.getTime())) return null;
  const anos = (when - dob) / (365.2425 * 86400000);
  if (!(anos > 0 && anos < 120)) return null;
  return Math.round(anos * 10) / 10;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- tests/rankings.test.js`
Expected: PASS — 10 testes

- [ ] **Step 5: Commit**

```bash
git add pipeline/rankings.js tests/rankings.test.js
git commit -m "feat(ranking): datas dos snapshots e idade a partir do dob"
```

---

### Task 3: Trajetórias — rank/pontos hoje, há 12 meses, pico e spike

O **spike** existe porque 26,3% dos "Em ascensão" da ATP tiram ≥50% da subida de **uma única semana** — Cobolli (#10) tirou 76%. "Em ascensão" sugere tendência; para 1 em cada 4, é um torneio.

**Files:**
- Modify: `pipeline/rankings.js`
- Test: `tests/rankings.test.js`

**Interfaces:**
- Consumes: `parseRankingRows`, `latestDate`, `minus12Months`, `nearestDate` (Tasks 1-2).
- Produces: `spikeOf(serie, from, to) -> {pct, date, ganho, total}|null`, `buildTrajectories(rows) -> Map<string, {rank, points, rank12m, points12m, peak, peakDate, snapshotDate, date12m, spikePct, spikeDate}>`

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao fim de `tests/rankings.test.js`:

```js
import { spikeOf, buildTrajectories } from '../pipeline/rankings.js';

test('spikeOf: acha a maior fatia do ganho vinda de uma semana só', () => {
  // ganho total 100 -> 1.670; a semana de 08/06 sozinha deu 1.200 (76%)
  const serie = [
    { date: 20250609, points: 100 },
    { date: 20260601, points: 470 },
    { date: 20260608, points: 1670 },
  ];
  const s = spikeOf(serie, 20250609, 20260608);
  assert.equal(s.pct, 76);
  assert.equal(s.date, 20260608);
});

test('spikeOf: sem ganho no período devolve null', () => {
  const serie = [{ date: 20250609, points: 500 }, { date: 20260608, points: 300 }];
  assert.equal(spikeOf(serie, 20250609, 20260608), null);
});

test('buildTrajectories: monta hoje, 12m, pico e a data do snapshot', () => {
  const csv = [
    'ranking_date,rank,player,points',
    '20240610,50,111,800',   // pico do 111: #50
    '20250609,47,111,900',
    '20260608,12,111,2000',
    '20250609,3,222,6000',
    '20260608,4,222,5800',   // pico do 222: #3
  ].join('\n');
  const t = buildTrajectories(parseRankingRows(csv));
  const a = t.get('111');
  assert.equal(a.rank, 12);
  assert.equal(a.points, 2000);
  assert.equal(a.rank12m, 47);
  assert.equal(a.points12m, 900);
  assert.equal(a.peak, 12);          // o melhor de sempre é o de hoje
  assert.equal(a.peakDate, 20260608);
  assert.equal(a.snapshotDate, 20260608);
  assert.equal(a.date12m, 20250609);
  const b = t.get('222');
  assert.equal(b.peak, 3);
  assert.equal(b.peakDate, 20250609);
});

test('buildTrajectories: quem não tem snapshot de 12m fica com rank12m null (não com 2000)', () => {
  // caso Venus Williams: está no ranking hoje, não estava há 12 meses
  const csv = ['ranking_date,rank,player,points', '20250609,3,222,6000', '20260608,465,999,123'].join('\n');
  const t = buildTrajectories(parseRankingRows(csv));
  const v = t.get('999');
  assert.equal(v.rank, 465);
  assert.equal(v.rank12m, null);
  assert.equal(v.points12m, null);
});

test('buildTrajectories: quem não está no snapshot de hoje fica fora', () => {
  const csv = ['ranking_date,rank,player,points', '20250609,3,222,6000', '20260608,1,111,9000'].join('\n');
  const t = buildTrajectories(parseRankingRows(csv));
  assert.equal(t.has('222'), false); // sumiu do ranking
  assert.equal(t.has('111'), true);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- tests/rankings.test.js`
Expected: FAIL — `spikeOf is not a function`

- [ ] **Step 3: Implementar o mínimo**

Adicione a `pipeline/rankings.js`:

```js
/** A maior fatia do ganho de pontos do período vinda de uma única semana.
 *  null se não houve ganho (quem caiu não tem "subida concentrada"). */
export function spikeOf(serie, from, to) {
  const win = serie.filter((s) => s.date >= from && s.date <= to);
  if (win.length < 2) return null;
  const total = win[win.length - 1].points - win[0].points;
  if (total <= 0) return null;
  let maior = 0;
  let quando = null;
  for (let i = 1; i < win.length; i++) {
    const d = win[i].points - win[i - 1].points;
    if (d > maior) { maior = d; quando = win[i].date; }
  }
  if (!quando) return null;
  return { pct: Math.round((100 * maior) / total), date: quando, ganho: maior, total };
}

/** Rows -> trajetória por player_id. Só quem está no snapshot mais recente. */
export function buildTrajectories(rows) {
  const snapshotDate = latestDate(rows);
  if (!snapshotDate) return new Map();
  const dates = [...new Set(rows.map((r) => r.date))];
  const date12m = nearestDate(dates, minus12Months(snapshotDate));

  const byId = new Map();
  for (const r of rows) {
    let s = byId.get(r.id);
    if (!s) { s = []; byId.set(r.id, s); }
    s.push(r);
  }

  const out = new Map();
  for (const [id, serie] of byId) {
    serie.sort((a, b) => a.date - b.date);
    const hoje = serie.find((s) => s.date === snapshotDate);
    if (!hoje) continue; // não está no ranking hoje
    const antes = serie.find((s) => s.date === date12m) || null;
    let peak = Infinity;
    let peakDate = null;
    for (const s of serie) if (s.rank < peak) { peak = s.rank; peakDate = s.date; }
    const spike = antes ? spikeOf(serie, date12m, snapshotDate) : null;
    out.set(id, {
      rank: hoje.rank,
      points: hoje.points,
      rank12m: antes ? antes.rank : null,
      points12m: antes ? antes.points : null,
      peak: peak === Infinity ? null : peak,
      peakDate,
      snapshotDate,
      date12m: antes ? date12m : null,
      spikePct: spike ? spike.pct : null,
      spikeDate: spike ? spike.date : null,
    });
  }
  return out;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- tests/rankings.test.js`
Expected: PASS — 15 testes

- [ ] **Step 5: Commit**

```bash
git add pipeline/rankings.js tests/rankings.test.js
git commit -m "feat(ranking): trajetorias — hoje, 12 meses, pico e subida concentrada"
```

---

### Task 4: Cache do pico histórico (2010–2019)

O pico de 2010–2019 é história: não muda desde 2019. Rebaixar 37 MB por dia para recalculá-lo é desperdício — 56% do download original. Este script roda **uma vez** e o resultado é versionado.

**Atenção ao `.gitignore`:** ele tem `data/*`, então o arquivo seria ignorado silenciosamente e o cron quebraria. A exceção é parte desta task.

**Files:**
- Create: `pipeline/peak-cache-build.js`
- Modify: `.gitignore`
- Create (gerado): `data/peak-2010-2019.json`

**Interfaces:**
- Consumes: `parseRankingRows` (Task 1).
- Produces: `data/peak-2010-2019.json` no formato `{ atp: { [player_id]: [rank, dateInt] }, wta: {...} }`

- [ ] **Step 1: Abrir a exceção no `.gitignore`**

Em `.gitignore`, troque o bloco:

```
# Dados brutos baixados (grandes / não versionar)
data/*
!data/.gitkeep
```

por:

```
# Dados brutos baixados (grandes / não versionar)
data/*
!data/.gitkeep
# Exceção: pico de ranking 2010-2019 é dado DERIVADO, pequeno (238 KB) e imutável
# (essa história não muda mais). Versionado de propósito: evita rebaixar 37 MB/dia
# no cron só para recalcular um número congelado desde 2019. Gerado por
# pipeline/peak-cache-build.js, que roda uma vez e NÃO entra no cron.
!data/peak-2010-2019.json
```

- [ ] **Step 2: Escrever o script one-shot**

Crie `pipeline/peak-cache-build.js`:

```js
// Gera data/peak-2010-2019.json — o melhor ranking de cada jogador entre 2010 e 2019.
// RODA UMA VEZ, à mão. NÃO entra no cron: essa história não muda mais.
// Uso: node pipeline/peak-cache-build.js
import { writeFile } from 'node:fs/promises';
import { parseRankingRows } from './rankings.js';

const BASE = 'https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main';

async function peakOf(tour) {
  const t = tour.toLowerCase();
  const res = await fetch(`${BASE}/${t}/${t}_rankings_10s.csv`);
  if (!res.ok) throw new Error(`${t}_rankings_10s.csv: HTTP ${res.status}`);
  const rows = parseRankingRows(await res.text());
  const peak = {};
  for (const r of rows) {
    const cur = peak[r.id];
    if (cur === undefined || r.rank < cur[0]) peak[r.id] = [r.rank, r.date];
  }
  console.log(`${t}: ${rows.length} linhas -> ${Object.keys(peak).length} jogadores com pico em 2010-2019`);
  return peak;
}

async function main() {
  // Sem filtrar por "quem está ativo hoje": filtrar economizaria 152 KB e criaria
  // um bug — quem sumir e voltar em 2027 ficaria sem pico.
  const out = { atp: await peakOf('ATP'), wta: await peakOf('WTA') };
  const url = new URL('../data/peak-2010-2019.json', import.meta.url);
  const json = JSON.stringify(out);
  await writeFile(url, json);
  console.log(`\ndata/peak-2010-2019.json salvo: ${(json.length / 1024).toFixed(0)} KB`);
}

main();
```

- [ ] **Step 3: Rodar e conferir a saída**

Run: `node pipeline/peak-cache-build.js`
Expected (baixa ~37 MB, leva ~30s):
```
atp: ... linhas -> 6180 jogadores com pico em 2010-2019
wta: ... linhas -> 3835 jogadores com pico em 2010-2019

data/peak-2010-2019.json salvo: 238 KB
```

- [ ] **Step 4: Conferir que o git NÃO está ignorando o arquivo**

Run: `git check-ignore -v data/peak-2010-2019.json; echo "exit=$?"`
Expected: `exit=1` (nenhuma regra bate — o arquivo será versionado).
Se sair `exit=0`, a regra do Step 1 não pegou. **Não siga** — o cron quebraria em produção.

- [ ] **Step 5: Conferir um pico conhecido**

Run:
```bash
node -e "const p=require('./data/peak-2010-2019.json'); console.log('Djokovic (104925):', p.atp['104925']); console.log('Wawrinka (104527):', p.atp['104527']);"
```
Expected: Djokovic `[ 1, <data de 2011> ]`; Wawrinka `[ 3, <data de 2014> ]`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore pipeline/peak-cache-build.js data/peak-2010-2019.json
git commit -m "feat(ranking): cache do pico historico 2010-2019 (238 KB, fora do cron)"
```

---

### Task 5: Join — resolver player_id contra o modelo

**Este é o bloqueante da spec.** Brandon Nakashima (#32) e Bryce Nakashima (#1483) disputam o slot `Nakashima B.`. Hoje `Wang Xin.` já mostra o ranking da pessoa errada. Sem desempate, o rótulo do #32 do mundo é sorteio.

**Files:**
- Modify: `pipeline/rankings.js`
- Test: `tests/rankings.test.js`

**Interfaces:**
- Consumes: `ageFrom` (Task 2); `findModelPlayer(name, players)` de `web/src/match-names.js:64`.
- Produces: `resolvePlayers(ids, players, meta) -> { resolved: Map<string, object>, excluded: string[] }` — `meta` é `Map<player_id, {fullName, dob}>`.

**Por que `findModelPlayer` e não `matchPlayer`:** o `matchPlayer` sozinho falha em nomes completos. Para `"Tomas Barrios Vera"`, o `parseModelName` ([match-names.js:13](../../../web/src/match-names.js)) lê `initial="v"`, `surname="tomasbarrios"` — nunca casa. O `findModelPlayer` tenta `normName` exato antes.

**Por que o guarda-corpo compara na data do último jogo:** `p.bio.age` é a idade **congelada na data do último jogo** ([patterns.js:82](../../../pipeline/patterns.js) — `bio: recent ? recent.bio : null`). Comparar com a idade de hoje excluiria todo aposentado por engano (o Nadal tem `bio.age: 38.4` e 40 anos reais). Compare em `p.lastDate`.

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao fim de `tests/rankings.test.js`:

```js
import { resolvePlayers } from '../pipeline/rankings.js';

const PLAYERS = [
  { name: 'Sinner J.', lastDate: 20260712, bio: { id: '206173', age: 24.7 } },
  { name: 'Nakashima B.', lastDate: 20260701, bio: { id: '206909', age: 24.8 } },
  { name: 'Tomas Barrios Vera', lastDate: 20260601, bio: null }, // challenger, nome cru, sem bio
];

test('resolvePlayers: casa por bio.id quando existe', () => {
  const meta = new Map([['206173', { fullName: 'Jannik Sinner', dob: 20010816 }]]);
  const { resolved } = resolvePlayers(['206173'], PLAYERS, meta);
  assert.equal(resolved.get('206173').name, 'Sinner J.');
});

test('resolvePlayers: cai para o nome quando não há bio.id', () => {
  const meta = new Map([['999001', { fullName: 'Tomas Barrios Vera', dob: 19950101 }]]);
  const { resolved } = resolvePlayers(['999001'], PLAYERS, meta);
  assert.equal(resolved.get('999001').name, 'Tomas Barrios Vera');
});

test('resolvePlayers: colisão de nome exclui os dois — não sorteia', () => {
  // Brandon Nakashima (#32) e Bryce Nakashima (#1483) casam no mesmo 'Nakashima B.'
  const meta = new Map([
    ['206909', { fullName: 'Brandon Nakashima', dob: 20010803 }],
    ['210416', { fullName: 'Bryce Nakashima', dob: 20040101 }],
  ]);
  const { resolved, excluded } = resolvePlayers(['206909', '210416'], PLAYERS, meta);
  assert.equal(resolved.has('206909'), false);
  assert.equal(resolved.has('210416'), false);
  assert.deepEqual(excluded, ['Nakashima B.']);
});

test('resolvePlayers: guarda-corpo do dob compara na data do ÚLTIMO JOGO, não hoje', () => {
  // Aposentado: bio.age 38.4 congelada em 2024; hoje teria 40. Não pode ser excluído.
  const players = [{ name: 'Nadal R.', lastDate: 20240721, bio: { id: null, age: 38.4 } }];
  const meta = new Map([['104745', { fullName: 'Rafael Nadal', dob: 19860603 }]]);
  const { resolved } = resolvePlayers(['104745'], players, meta);
  assert.equal(resolved.get('104745').name, 'Nadal R.');
});

test('resolvePlayers: idade incompatível é recusada (identidade errada)', () => {
  // 'Wang Xin.' recebendo o id de outra Wang: gap de idade grande -> recusa
  const players = [{ name: 'Wang Xin.', lastDate: 20260601, bio: { id: null, age: 22.2 } }];
  const meta = new Map([['888', { fullName: 'Xin Wang', dob: 19900101 }]]); // teria ~36
  const { resolved } = resolvePlayers(['888'], players, meta);
  assert.equal(resolved.has('888'), false);
});

test('resolvePlayers: id sem meta ou sem jogador no modelo é ignorado', () => {
  const { resolved } = resolvePlayers(['000'], PLAYERS, new Map());
  assert.equal(resolved.size, 0);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- tests/rankings.test.js`
Expected: FAIL — `resolvePlayers is not a function`

- [ ] **Step 3: Implementar o mínimo**

Adicione a `pipeline/rankings.js` (o import vai no topo do arquivo, junto dos outros):

```js
import { findModelPlayer } from '../web/src/match-names.js';
```

```js
const GAP_IDADE_MAX = 2; // anos de tolerância entre o dob do Sackmann e o bio.age do modelo

/** player_id -> jogador do modelo.
 *  1. bio.id quando existir (é o player_id do Sackmann — bate em 98,8% ATP / 97,7% WTA)
 *  2. cai para o nome via findModelPlayer
 *  3. guarda-corpo: idade calculada do dob NA DATA DO ÚLTIMO JOGO vs bio.age
 *  4. colisão (2+ ids no mesmo jogador) -> exclui os dois. Ambíguo não se chuta.
 *  `meta`: Map<player_id, {fullName, dob}>. */
export function resolvePlayers(ids, players, meta) {
  const byBioId = new Map();
  for (const p of players) if (p.bio && p.bio.id) byBioId.set(String(p.bio.id), p);

  const resolved = new Map();
  const hits = new Map(); // nome do modelo -> [ids que casaram nele]

  for (const id of ids) {
    const m = meta.get(id);
    if (!m) continue;
    const p = byBioId.get(String(id)) || findModelPlayer(m.fullName, players);
    if (!p) continue;
    // guarda-corpo de identidade: bio.age é congelada em p.lastDate, então compare LÁ.
    if (p.bio && p.bio.age != null && m.dob && p.lastDate) {
      const idade = ageFrom(m.dob, p.lastDate);
      if (idade != null && Math.abs(idade - p.bio.age) > GAP_IDADE_MAX) continue;
    }
    resolved.set(id, p);
    if (!hits.has(p.name)) hits.set(p.name, []);
    hits.get(p.name).push(id);
  }

  const excluded = [];
  for (const [name, idList] of hits) {
    if (idList.length > 1) {
      for (const id of idList) resolved.delete(id);
      excluded.push(name);
    }
  }
  return { resolved, excluded };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- tests/rankings.test.js`
Expected: PASS — 21 testes

- [ ] **Step 5: Commit**

```bash
git add pipeline/rankings.js tests/rankings.test.js
git commit -m "feat(ranking): join por bio.id com guarda-corpo de idade; colisao exclui"
```

---

### Task 6: O ingest — grava `p.career` e conserta `bio.rank`/`bio.age`

Espelha o `patterns-ingest.js`: lê o `model-*.json`, acrescenta campos, regrava. Entra no cron **depois** do `patterns-ingest.js` — os scripts reescrevem o mesmo arquivo em cadeia, a ordem é load-bearing.

Os dois bugs que somem aqui: `bio.rank` mostra o Djokovic como #4 (é #7) e `bio.age` mostra o Nadal com 38 (tem 40) — ambos congelados na data do último jogo.

**Files:**
- Create: `pipeline/rankings-ingest.js`
- Modify: `.github/workflows/update-model.yml:37-38`

**Interfaces:**
- Consumes: tudo de `pipeline/rankings.js` (Tasks 1-5); `data/peak-2010-2019.json` (Task 4).
- Produces: `p.career = {rank, points, rank12m, points12m, peak, peakDate, snapshotDate, date12m, spikePct, spikeDate}` (ou ausente) e `p.bio.rank`/`p.bio.age` corrigidos no `web/model-{atp,wta}.json`.

- [ ] **Step 1: Escrever o script**

Crie `pipeline/rankings-ingest.js`:

```js
// Enriquece os modelos (ATP/WTA) com a trajetória de ranking (p.career) e conserta
// bio.rank / bio.age, que hoje ficam congelados na data do último jogo do jogador.
// Uso: node pipeline/rankings-ingest.js
import { readFile, writeFile } from 'node:fs/promises';
import { parseRankingRows, buildTrajectories, resolvePlayers, ageFrom } from './rankings.js';

const BASE = 'https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main';

/** players.csv -> Map<player_id, {fullName, dob}>. */
function parsePlayers(text) {
  const meta = new Map();
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = lines[i].split(',');
    const id = c[0];
    if (!id) continue;
    const fullName = `${c[1] || ''} ${c[2] || ''}`.trim();
    if (!fullName) continue;
    meta.set(id, { fullName, dob: Number(c[4]) || null });
  }
  return meta;
}

async function get(path) {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

async function enrich(modelFile, tour) {
  const t = tour.toLowerCase();
  const url = new URL(modelFile, import.meta.url);
  const model = JSON.parse(await readFile(url));
  console.log(`Trajetória de ranking ${tour}...`);

  // O 10s NÃO é baixado: o pico de 2010-2019 é história e vem do cache versionado.
  const [current, s20, playersCsv, peakCache] = await Promise.all([
    get(`${t}/${t}_rankings_current.csv`),
    get(`${t}/${t}_rankings_20s.csv`),
    get(`${t}/${t}_players.csv`),
    readFile(new URL('../data/peak-2010-2019.json', import.meta.url)).then((b) => JSON.parse(b)),
  ]);

  const rows = [...parseRankingRows(s20), ...parseRankingRows(current)];
  const traj = buildTrajectories(rows);
  const meta = parsePlayers(playersCsv);
  const { resolved, excluded } = resolvePlayers([...traj.keys()], model.players, meta);

  const antigo = peakCache[t] || {};
  let n = 0;
  for (const [id, p] of resolved) {
    const c = { ...traj.get(id) };
    // pico final = o melhor entre a janela viva e a história de 2010-2019
    const velho = antigo[id];
    if (velho && (c.peak == null || velho[0] < c.peak)) { c.peak = velho[0]; c.peakDate = velho[1]; }
    p.career = c;
    // conserta o que hoje fica congelado na data do último jogo
    if (p.bio) {
      p.bio.rank = c.rank;
      const m = meta.get(id);
      const idade = m ? ageFrom(m.dob, c.snapshotDate) : null;
      if (idade != null) p.bio.age = idade;
    }
    n++;
  }

  await writeFile(url, JSON.stringify(model));
  const ativos = model.players.filter((p) => p.active);
  const comCareer = ativos.filter((p) => p.career).length;
  console.log(
    `${modelFile}: ${n} jogadores com trajetória — ${comCareer}/${ativos.length} ativos ` +
    `(${((100 * comCareer) / ativos.length).toFixed(1)}%). ${excluded.length} excluídos por ambiguidade` +
    `${excluded.length ? `: ${excluded.join(', ')}` : ''}.`
  );
  if (comCareer / ativos.length < 0.8) {
    throw new Error(`Cobertura caiu para ${((100 * comCareer) / ativos.length).toFixed(1)}% dos ativos (esperado ~92% ATP / ~96% WTA). O join quebrou.`);
  }
}

async function main() {
  await enrich('../web/model-atp.json', 'ATP');
  await enrich('../web/model-wta.json', 'WTA');
}

main();
```

**Sobre o `throw` de cobertura:** o `EloEngine._get` cria jogador silenciosamente ([elo-engine.js:13-18](../../../pipeline/elo-engine.js)) e o join é por nome — errar a chave é falha **silenciosa**. Sem esse gate, o campo sumiria em produção sem ninguém notar. É o mesmo espírito do `patterns-ingest.js:64`.

**Limitação conhecida, de propósito:** `bio.rank` e `bio.age` só são corrigidos para quem **está no ranking de hoje**. Quem saiu (aposentado como o Nadal, ou fora do ranking) mantém os valores congelados na data do último jogo. Isso é aceitável porque esses jogadores são `active: false` e nenhuma lista do app os mostra ([player-search.js:7](../../../web/src/player-search.js), [app.js:1030](../../../web/app.js), :1353, :1402) — os 88 jogadores com idade errada que importam são ativos e estão no ranking, então a correção os alcança. Se um dia os inativos passarem a aparecer, isto vira bug.

- [ ] **Step 2: Rodar de verdade e conferir a cobertura**

Run: `node pipeline/rankings-ingest.js`
Expected (baixa ~29,5 MB, leva ~30s):
```
Trajetória de ranking ATP...
../web/model-atp.json: ... jogadores com trajetória — 813/879 ativos (92,5%). ... excluídos por ambiguidade: Nakashima B., ...
Trajetória de ranking WTA...
../web/model-wta.json: ... jogadores com trajetória — 366/381 ativos (96,1%). ...
```
Se a cobertura vier abaixo de 80%, o script falha de propósito — o join quebrou.

- [ ] **Step 3: Conferir os dois bugs consertados**

Run:
```bash
node -e "
const m = require('./web/model-atp.json');
const d = m.players.find(p => /Djokovic/.test(p.name));
console.log('Djokovic  bio.rank:', d.bio.rank, '(era 4, congelado) | career.rank:', d.career.rank);
console.log('          bio.age :', d.bio.age, '| pico #' + d.career.peak, 'em', String(d.career.peakDate).slice(0,4));
"
```
Expected: `bio.rank: 7`, `career.rank: 7`, `pico #1 em 2011` (o pico veio do cache — prova que o cache está sendo lido).

- [ ] **Step 4: Colocar no cron**

Em `.github/workflows/update-model.yml`, insira **entre** o passo de padrões (`:36-37`) e o de fixtures (`:38-39`):

```yaml
      - name: Enriquecer com a trajetória de ranking (momento de carreira)
        run: node pipeline/rankings-ingest.js
```

O `git add` de `update-model.yml:50` já cobre `web/model-*.json` — nada a mudar ali. O `peak-cache-build.js` **não** entra no cron.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — os 198 testes que já existiam + os 21 novos.

- [ ] **Step 6: Commit**

```bash
git add pipeline/rankings-ingest.js .github/workflows/update-model.yml web/model-atp.json web/model-wta.json
git commit -m "feat(ranking): ingest da trajetoria + conserta bio.rank e bio.age congelados"
```

---

### Task 7: A regra de classificação

Calibrada em 813 ativos ATP e 366 WTA — cada constante aqui tem um nome por trás e um teste que a defende.

**Files:**
- Create: `web/src/career.js`
- Test: `tests/career.test.js`

**Interfaces:**
- Consumes: `p.career` (Task 6).
- Produces: `noAuge(rank, peak) -> boolean`, `careerMoment(career) -> {moment: 'ascensao'|'auge'|'estavel'|'declinio'|null, reason: string|null, ratio: number|null}`

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/career.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { careerMoment, noAuge } from '../web/src/career.js';

const c = (o) => ({ rank: 10, points: 3000, rank12m: 10, points12m: 3000, peak: 10, peakDate: 20260608, snapshotDate: 20260608, date12m: 20250609, spikePct: null, spikeDate: null, ...o });

test('careerMoment: pontos multiplicados por 1,5 ou mais é ascensão', () => {
  // Auger-Aliassime: 1.685 -> 4.440 (x2,64), do #29 ao #4
  const m = careerMoment(c({ rank: 4, points: 4440, rank12m: 29, points12m: 1685 }));
  assert.equal(m.moment, 'ascensao');
});

test('careerMoment: perder um terço dos pontos ou mais é declínio', () => {
  // Gauff: 8.083 -> 4.879 (x0,60), do #2 ao #7
  const m = careerMoment(c({ rank: 7, points: 4879, rank12m: 2, points12m: 8083, peak: 2, peakDate: 20250101 }));
  assert.equal(m.moment, 'declinio');
});

test('careerMoment: parado no pico da carreira é auge', () => {
  // Sinner #1, pico #1
  const m = careerMoment(c({ rank: 1, points: 13500, rank12m: 1, points12m: 10880, peak: 1 }));
  assert.equal(m.moment, 'auge');
});

test('careerMoment: parado longe do pico é estável', () => {
  // Djokovic: #7 hoje, era #5; pico #1 em 2011. Não está caindo, mas não está no auge.
  const m = careerMoment(c({ rank: 7, points: 3760, rank12m: 5, points12m: 4630, peak: 1, peakDate: 20110704 }));
  assert.equal(m.moment, 'estavel');
});

test('careerMoment: Alcaraz #2 com pico #1 é auge, não estável (a régua aditiva)', () => {
  // peak*1.25 puniria quem foi bom: floor(1*1.25) = 1, folga zero.
  const m = careerMoment(c({ rank: 2, points: 11500, rank12m: 3, points12m: 10200, peak: 1, peakDate: 20220101 }));
  assert.equal(m.moment, 'auge');
});

test('careerMoment: Sabalenka #1->#1 (razão 0,787) NÃO é declínio — a defesa do T=1,5', () => {
  // Em T=1,3 o corte seria 0,769 e ela ficaria a 0,018 de ser publicada como "Em declínio".
  const m = careerMoment(c({ rank: 1, points: 8260, rank12m: 1, points12m: 10490, peak: 1 }));
  assert.equal(m.moment, 'auge');
});

test('careerMoment: sem ranking há 12 meses NÃO vira estável — vira sem-histórico', () => {
  // Venus Williams: #465 hoje, não estava no ranking há um ano. Ausência não é declínio.
  const m = careerMoment(c({ rank: 465, points: 123, rank12m: null, points12m: null, peak: 2 }));
  assert.equal(m.moment, null);
  assert.equal(m.reason, 'sem-historico');
});

test('careerMoment: pouco tênis no período NÃO vira estável nem ascensão', () => {
  // Darian King: 1 -> 7 pontos. Sem o portão, sairia "Em ascensão" (x7).
  const m = careerMoment(c({ rank: 900, points: 7, rank12m: 1100, points12m: 1, peak: 900 }));
  assert.equal(m.moment, null);
  assert.equal(m.reason, 'pouco-tenis');
});

test('careerMoment: rank == peak com pico ruim não vira auge sem base', () => {
  // Jang S.J. #1235, pico 1235: rank == peak, mas sem histórico não há rótulo.
  const m = careerMoment(c({ rank: 1235, points: 8, rank12m: null, points12m: null, peak: 1235 }));
  assert.equal(m.reason, 'sem-historico');
});

test('careerMoment: quem não tinha nenhum ponto há 12 meses é ascensão, sem dividir por zero', () => {
  const m = careerMoment(c({ rank: 187, points: 400, rank12m: 1324, points12m: 0, peak: 187 }));
  assert.equal(m.moment, 'ascensao');
  assert.equal(Number.isFinite(m.ratio), false);
});

test('careerMoment: career nulo ou vazio não estoura', () => {
  assert.equal(careerMoment(null).moment, null);
  assert.equal(careerMoment(undefined).moment, null);
  assert.equal(careerMoment({}).moment, null);
});

test('noAuge: folga de 25% do pico, entre 3 e 20 posições', () => {
  assert.equal(noAuge(1, 1), true);    // no topo
  assert.equal(noAuge(4, 1), true);    // 1 + piso 3
  assert.equal(noAuge(5, 1), false);
  assert.equal(noAuge(9, 7), true);    // 7 + piso 3 = 10
  assert.equal(noAuge(120, 100), true);  // 100 + teto 20
  assert.equal(noAuge(121, 100), false);
  assert.equal(noAuge(1010, 1000), true); // teto 20 segura a cauda
  assert.equal(noAuge(1021, 1000), false);
  assert.equal(noAuge(null, 1), false);
  assert.equal(noAuge(1, null), false);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- tests/career.test.js`
Expected: FAIL — `Cannot find module '../web/src/career.js'`

- [ ] **Step 3: Implementar o mínimo**

Crie `web/src/career.js`:

```js
// Momento de carreira: em ascensão / no auge / estável / em declínio.
// Funções puras. Regra de clareza: o número vai sempre embutido no texto (ver careerText).
//
// A regra foi calibrada em 813 ativos ATP e 366 WTA — cada constante tem um motivo:
//
// PONTOS e não posição no ranking: a razão de posição é estruturalmente incapaz no topo.
//   Partindo do #5, a razão máxima possível é 5,0 e a mínima 0,005 — quem começa o ano no
//   top 10 tem 0% de chance de sair "Em ascensão" e 40% de sair "Em declínio". Por posição,
//   Pegula #3->#4 saía "Em declínio" e Swiatek #7->#3 saía "Em ascensão".
// T = 1,5: em 1,3 a Sabalenka (#1->#1, razão 0,787) fica a 0,018 de ser publicada como
//   "Em declínio"; em 2,0 quem caiu pela metade (Musetti, Gauff) sairia "Estável".
// PORTÃO de 50 pontos: sem ele, Darian King (1 -> 7 pontos) sai "Em ascensão".
//   Um piso de ganho absoluto criaria absurdo pior (162 casos de queda >=100 posições
//   virando "parado").
// RÉGUA ADITIVA do auge: peak*1.25 pune quem foi bom — para o Alcaraz (pico #1) a folga
//   vira zero e ele sairia "Estável" sendo #2 do mundo.
//
// IMPORTANTE: isto DESCREVE os últimos 12 meses. Medido em 118.214 partidas: o rótulo
// não antecipa vitórias além do que o Elo já sabe. Não é previsão.

const T = 1.5;              // razão de pontos que separa ascensão/declínio
const PONTOS_MIN = 50;      // portão: abaixo disso não jogou tênis suficiente
const FOLGA_PCT = 0.25;     // folga do auge, como fração do pico
const FOLGA_MIN = 3;
const FOLGA_MAX = 20;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** Está no pico da carreira, ou perto o bastante? Folga de 25% do pico, entre 3 e 20 posições. */
export function noAuge(rank, peak) {
  if (rank == null || peak == null) return false;
  return rank <= peak + clamp(Math.round(FOLGA_PCT * peak), FOLGA_MIN, FOLGA_MAX);
}

/** Classifica o momento. Nunca lança; ausência de dado vira `reason`, nunca "estável". */
export function careerMoment(career) {
  if (!career || career.rank == null) return { moment: null, reason: 'sem-dados', ratio: null };
  if (career.rank12m == null || career.points12m == null) return { moment: null, reason: 'sem-historico', ratio: null };
  if (Math.max(career.points, career.points12m) < PONTOS_MIN) return { moment: null, reason: 'pouco-tenis', ratio: null };

  // points12m === 0 dá Infinity de propósito: quem saiu do zero subiu mesmo.
  // O texto trata esse caso à parte para não escrever "subiu Infinityx".
  const ratio = career.points / career.points12m;
  if (ratio >= T) return { moment: 'ascensao', reason: null, ratio };
  if (ratio <= 1 / T) return { moment: 'declinio', reason: null, ratio };
  if (noAuge(career.rank, career.peak)) return { moment: 'auge', reason: null, ratio };
  return { moment: 'estavel', reason: null, ratio };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- tests/career.test.js`
Expected: PASS — 12 testes

Nota: `1 / 1.5 = 0.6667`, então o corte de declínio é `<= 0,667` como na spec.

- [ ] **Step 5: Commit**

```bash
git add web/src/career.js tests/career.test.js
git commit -m "feat(jogadores): regra do momento de carreira (4 rotulos, por pontos)"
```

---

### Task 8: Os textos do card

O número vai **sempre** embutido. O ano do pico é obrigatório: *"No auge — #8, melhor foi #3, em 2017"* é uma frase muito diferente de *"No auge — #6, seu melhor de sempre, em 2024"*.

**Files:**
- Modify: `web/src/career.js`
- Test: `tests/career.test.js`

**Interfaces:**
- Consumes: `careerMoment` (Task 7).
- Produces: `careerText(career) -> {label: string, detail: string, warn: string|null} | null`

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao fim de `tests/career.test.js`:

```js
import { careerText } from '../web/src/career.js';

test('careerText: ascensão traz o multiplicador e o movimento de rank', () => {
  const t = careerText(c({ rank: 4, points: 4440, rank12m: 29, points12m: 1685 }));
  assert.equal(t.label, 'Em ascensão');
  assert.equal(t.detail, 'os pontos subiram 2,6x em 12 meses (1.685 → 4.440). Saiu do #29 e está no #4.');
});

test('careerText: declínio traz a perda em % e o movimento', () => {
  const t = careerText(c({ rank: 7, points: 4879, rank12m: 2, points12m: 8083, peak: 2, peakDate: 20250101 }));
  assert.equal(t.label, 'Em declínio');
  assert.equal(t.detail, 'perdeu 40% dos pontos em 12 meses (8.083 → 4.879). Era #2, está no #7.');
});

test('careerText: auge no pico exato diz "o melhor da carreira" e o ano', () => {
  const t = careerText(c({ rank: 1, points: 13500, rank12m: 1, points12m: 10880, peak: 1, peakDate: 20240610 }));
  assert.equal(t.label, 'No auge');
  assert.equal(t.detail, 'está no #1, o melhor ranking da carreira, alcançado em 2024.');
});

test('careerText: auge perto do pico mostra a distância e o ano', () => {
  const t = careerText(c({ rank: 4, points: 6056, rank12m: 3, points12m: 6483, peak: 3, peakDate: 20220307 }));
  assert.equal(t.label, 'No auge');
  assert.ok(t.detail.includes('está no #4'), t.detail);
  assert.ok(t.detail.includes('#3, em 2022'), t.detail);
  assert.ok(t.detail.includes('-7%'), t.detail);
});

test('careerText: estável diz que está longe do melhor, com o ano', () => {
  const t = careerText(c({ rank: 7, points: 3760, rank12m: 5, points12m: 4630, peak: 1, peakDate: 20110704 }));
  assert.equal(t.label, 'Estável');
  assert.ok(t.detail.includes('-19%'), t.detail);
  assert.ok(t.detail.includes('longe do melhor da carreira (#1, em 2011)'), t.detail);
});

test('careerText: sem histórico diz o mês e que não dá para saber', () => {
  const t = careerText(c({ rank: 465, points: 123, rank12m: null, points12m: null, peak: 2, date12m: null }));
  assert.equal(t.label, 'Sem histórico');
  assert.ok(t.detail.includes('junho de 2025'), t.detail);
  assert.ok(t.detail.includes('#465'), t.detail);
});

test('careerText: pouco tênis diz o número de pontos', () => {
  const t = careerText(c({ rank: 900, points: 7, rank12m: 1100, points12m: 1 }));
  assert.equal(t.label, 'Pouco tênis no período');
  assert.ok(t.detail.includes('7 pontos'), t.detail);
});

test('careerText: quem saiu do zero não escreve "Infinityx"', () => {
  const t = careerText(c({ rank: 187, points: 400, rank12m: 1324, points12m: 0 }));
  assert.equal(t.label, 'Em ascensão');
  assert.ok(!/Infinity|NaN/.test(t.detail), t.detail);
  assert.ok(t.detail.includes('não tinha pontos'), t.detail);
});

test('careerText: aviso de subida concentrada dispara em 60% e não em 59%', () => {
  const base = { rank: 10, points: 1670, rank12m: 40, points12m: 100, peak: 10, spikeDate: 20260608 };
  const com = careerText(c({ ...base, spikePct: 76 }));
  assert.ok(com.warn.includes('76% da subida'), com.warn);
  assert.ok(com.warn.includes('08/06/2026'), com.warn);
  assert.equal(careerText(c({ ...base, spikePct: 60 })).warn !== null, true);
  assert.equal(careerText(c({ ...base, spikePct: 59 })).warn, null);
});

test('careerText: o aviso de subida só vale para quem subiu', () => {
  const t = careerText(c({ rank: 7, points: 4879, rank12m: 2, points12m: 8083, spikePct: 90, spikeDate: 20260608 }));
  assert.equal(t.label, 'Em declínio');
  assert.equal(t.warn, null);
});

test('careerText: career nulo devolve null', () => {
  assert.equal(careerText(null), null);
  assert.equal(careerText(undefined), null);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- tests/career.test.js`
Expected: FAIL — `careerText is not a function`

- [ ] **Step 3: Implementar o mínimo**

Adicione a `web/src/career.js`:

```js
const SPIKE_MIN = 60; // % do ganho de 12 meses vindo de uma semana só

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** 1685 -> "1.685" (separador de milhar do pt-BR, sem depender de locale). */
const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
/** 20260608 -> "08/06/2026" */
const dia = (d) => `${String(d % 100).padStart(2, '0')}/${String(Math.floor(d / 100) % 100).padStart(2, '0')}/${Math.floor(d / 10000)}`;
/** 20250609 -> "junho de 2025" */
const mesAno = (d) => `${MESES[(Math.floor(d / 100) % 100) - 1]} de ${Math.floor(d / 10000)}`;
const ano = (d) => Math.floor(d / 10000);
/** 2.6 -> "2,6" */
const dec = (x) => x.toFixed(1).replace('.', ',');

/** Momento de carreira -> {label, detail, warn} para o card. null se não há dado.
 *  O número vai sempre embutido — nenhum rótulo aparece nu. */
export function careerText(career) {
  if (!career) return null;
  const m = careerMoment(career);
  const { rank, points, rank12m, points12m, peak, peakDate, date12m, spikePct, spikeDate } = career;

  if (m.reason === 'sem-dados') return null;
  if (m.reason === 'sem-historico') {
    const quando = date12m ? mesAno(date12m) : 'um ano atrás';
    return { label: 'Sem histórico', warn: null,
      detail: `não tinha ranking em ${quando}, então não dá para dizer o momento. Hoje está no #${rank}.` };
  }
  if (m.reason === 'pouco-tenis') {
    return { label: 'Pouco tênis no período', warn: null,
      detail: `não passou de ${num(Math.max(points, points12m))} pontos nos últimos 12 meses; não dá para falar em momento de carreira.` };
  }

  // aviso de subida concentrada: só para quem subiu (quem caiu não tem "subida")
  const warn = m.moment === 'ascensao' && spikePct != null && spikePct >= SPIKE_MIN && spikeDate
    ? `Cuidado: ${spikePct}% da subida veio de uma semana só — em ${dia(spikeDate)}.`
    : null;

  if (m.moment === 'ascensao') {
    const detail = points12m === 0
      ? `não tinha pontos em ${date12m ? mesAno(date12m) : 'um ano atrás'}; hoje tem ${num(points)}. Saiu do #${rank12m} e está no #${rank}.`
      : `os pontos subiram ${dec(m.ratio)}x em 12 meses (${num(points12m)} → ${num(points)}). Saiu do #${rank12m} e está no #${rank}.`;
    return { label: 'Em ascensão', detail, warn };
  }

  if (m.moment === 'declinio') {
    return { label: 'Em declínio', warn: null,
      detail: `perdeu ${Math.round((1 - m.ratio) * 100)}% dos pontos em 12 meses (${num(points12m)} → ${num(points)}). Era #${rank12m}, está no #${rank}.` };
  }

  // auge e estável citam o pico — e o ANO do pico é obrigatório
  const delta = Math.round((m.ratio - 1) * 100);
  const variacao = `Os pontos mudaram ${delta >= 0 ? '+' : ''}${delta}% em 12 meses (${num(points12m)} → ${num(points)}).`;

  if (m.moment === 'auge') {
    if (rank === peak) {
      return { label: 'No auge', warn: null,
        detail: `está no #${rank}, o melhor ranking da carreira, alcançado em ${ano(peakDate)}.` };
    }
    return { label: 'No auge', warn: null,
      detail: `está no #${rank}; seu melhor foi #${peak}, em ${ano(peakDate)}. ${variacao}` };
  }

  return { label: 'Estável', warn: null,
    detail: `os pontos mudaram ${delta >= 0 ? '+' : ''}${delta}% em 12 meses (${num(points12m)} → ${num(points)}); está no #${rank}, longe do melhor da carreira (#${peak}, em ${ano(peakDate)}).` };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- tests/career.test.js`
Expected: PASS — 23 testes

- [ ] **Step 5: Commit**

```bash
git add web/src/career.js tests/career.test.js
git commit -m "feat(jogadores): textos do momento de carreira, com o numero embutido"
```

---

### Task 9: A linha no card

Entra entre a linha de identidade (`bioText`, [app.js:1107](../../../web/app.js)) e o aviso de Challenger (`:1108`) — as posições 3-6 do dossiê são o bloco de identidade, 7-11 são séries numéricas. Momento de carreira é identidade.

**Não enfie dentro do `bioText`:** [patterns-view.test.js:47](../../../tests/patterns-view.test.js) faz `assert.equal` da string inteira e quebraria.

**Files:**
- Modify: `web/app.js:1-14` (import), `web/app.js:1107-1108` (a linha)
- Modify: `web/styles.css` (2 classes)

**Interfaces:**
- Consumes: `careerText(career) -> {label, detail, warn}|null` (Task 8).
- Produces: nada (ponta da cadeia).

- [ ] **Step 1: Importar o módulo**

Em `web/app.js`, junto dos outros imports do topo (linhas 1-14), adicione:

```js
import { careerText } from './src/career.js';
```

- [ ] **Step 2: Inserir a linha no dossiê**

Em `web/app.js`, logo **depois** da linha do `bioText` (`:1107`) e **antes** do aviso de Challenger (`:1108`), insira:

```js
            ${(() => {
              const ct = careerText(player.career);
              if (!ct) return '';
              return `<div class="dos-career"><strong>${ct.label}</strong> — ${ct.detail}</div>
                ${ct.warn ? `<div class="explain-warn" style="margin:6px 0 0">${ct.warn}</div>` : ''}
                <div class="field-hint" style="margin-top:4px">Descreve o que já aconteceu nos últimos 12 meses — medimos que não antecipa o próximo jogo.</div>`;
            })()}
```

A ressalva final segue o precedente de [app.js:935](../../../web/app.js) (*"O modelo não bate o mercado; use como preparação"*): o rótulo foi medido em 118.214 partidas e não antecipa vitórias além do que o Elo já sabe. Sem ela, "Em ascensão" parece previsão.

- [ ] **Step 3: Adicionar o CSS**

Em `web/styles.css`, logo depois de `.dos-bio` (linha 384):

```css
.dos-career { font-size: 12.5px; color: var(--text-1); margin-top: 6px; line-height: 1.45; }
```

`.explain-warn` (âmbar) e `.field-hint` já existem — reuse.

- [ ] **Step 4: Ver funcionando no app de verdade**

Não basta o teste passar — carregue o app real (memória `verificar-app-real-nao-so-modulos`).

Run: `npm run dev`

Depois, no navegador: abra `http://localhost:5173/index.html`, vá em **Jogadores**, busque **Djokovic** e abra o card. Confira:
- a linha aparece **abaixo** da identidade e **acima** das tags;
- diz `Estável — os pontos mudaram -19% ... longe do melhor da carreira (#1, em 2011).`;
- o `Ranking #7 ATP` da linha de identidade agora bate com a realidade (era `#4`);
- a ressalva cinza aparece embaixo.

Depois busque **Sinner** (deve dizer `No auge`) e um jogador em ascensão do top-30 (deve trazer o multiplicador, e talvez o aviso âmbar de subida concentrada).

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — os 198 originais + 23 (career) + 21 (rankings) = 242.

- [ ] **Step 6: Commit**

```bash
git add web/app.js web/styles.css
git commit -m "feat(jogadores): momento de carreira no card do jogador"
```

---

## Verificação final

- [ ] `npm test` — 242 testes passando
- [ ] `node pipeline/rankings-ingest.js` — cobertura ~92,5% (ATP) e ~96,1% (WTA)
- [ ] O card do Djokovic mostra `Ranking #7 ATP` (era `#4`) e a idade certa
- [ ] `git check-ignore data/peak-2010-2019.json` não retorna nada (o arquivo está versionado)
- [ ] O `peak-cache-build.js` **não** está no `update-model.yml`
- [ ] `rankings-ingest.js` roda **depois** do `patterns-ingest.js` no workflow

## O que este plano NÃO faz (registrado na spec)

- Aviso de "Elo defasado" — medido em 118.214 partidas, a premissa estava invertida (z=+9,28 na direção oposta).
- Curva de idade no motor (+6pp, z=−16,96) e bug de ordenação cronológica (37% das partidas ATP fora de ordem desde 2024) — reais, mas são correção de modelo, que a spec-mãe põe fora de escopo.
- Podar os 672 inativos do JSON publicado — decidido "deixar quieto"; o problema-raiz é o `activeCutoff` frouxo.
