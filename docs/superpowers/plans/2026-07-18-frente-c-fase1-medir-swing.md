# Frente C — Fase 1: Medir o swing — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Medir, sem vazamento, se algum sinal pré-jogo (jogo quebra-quebra, mismatch de piso, melhor-de-5, azarão que começa forte) prevê "o favorito perdeu ≥1 set" ALÉM do equilíbrio — e decidir o go/no-go da Shortlist.

**Architecture:** Duas funções/classes puras e testáveis (`score.js` parseia o placar; `swing-signals.js` acumula stats correntes por jogador) e um runner (`swing-measure.js`) que clona o walk-forward do `value-backtest.js`: caminha pelas partidas ATP em ordem, tira prob do favorito + delta de piso do `EloEngine` ANTES de processar, lê o placar, e no fim estratifica por faixa de prob do favorito e imprime um relatório + salva um resumo markdown.

**Tech Stack:** Node.js ESM, `node --test`, `fetch` nativo. Reusa `pipeline/elo-engine.js`, `pipeline/ingest.js` (`parseCsv`, `toMatch`).

**Spec:** [docs/superpowers/specs/2026-07-18-frente-c-fase1-medir-swing-design.md](../specs/2026-07-18-frente-c-fase1-medir-swing-design.md)

**Nota:** trabalho só no `pipeline/` e `tests/` — **não toca a UI, o `today.json` nem o `app.js`.**

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `pipeline/score.js` | Criar | Parser puro do `score` Sackmann → sets por lado; trata tie-break e exclui RET/W/O |
| `tests/score.test.js` | Criar | Casos do parser |
| `pipeline/swing-signals.js` | Criar | `SwingStats`: acumuladores correntes por jogador (saque/devolução, 1º set) + leituras |
| `tests/swing-signals.test.js` | Criar | Acumulação e leituras |
| `pipeline/swing-measure.js` | Criar | Runner walk-forward: Elo + sinais → estratificação → relatório + markdown |
| `docs/superpowers/findings/` | Criar (dir) | Onde o runner grava o resumo durável |

Reusa sem tocar: `elo-engine.js`, `ingest.js`, `metrics.js`.

---

## Task 1: `pipeline/score.js` — parser do placar

**Files:**
- Create: `pipeline/score.js`
- Create: `tests/score.test.js`

- [ ] **Step 1: Escrever os testes**

Criar `tests/score.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScore } from '../pipeline/score.js';

test('sets diretos', () => {
  const r = parseScore('6-4 6-3');
  assert.equal(r.valid, true);
  assert.equal(r.winnerSets, 2);
  assert.equal(r.loserSets, 0);
});

test('perdeu um set no meio', () => {
  const r = parseScore('6-4 3-6 7-5');
  assert.equal(r.winnerSets, 2);
  assert.equal(r.loserSets, 1);
  assert.deepEqual(r.sets[0], [6, 4]);
});

test('tie-break com placar entre parênteses', () => {
  const r = parseScore('7-6(5) 6-7(4) 6-4');
  assert.equal(r.valid, true);
  assert.equal(r.winnerSets, 2);
  assert.equal(r.loserSets, 1);
});

test('tie-break longo (10-8)', () => {
  const r = parseScore('6-4 7-6(10-8)');
  assert.equal(r.valid, true);
  assert.equal(r.winnerSets, 2);
});

test('abandono e W.O. são inválidos', () => {
  assert.equal(parseScore('6-4 2-1 RET').valid, false);
  assert.equal(parseScore('W/O').valid, false);
  assert.equal(parseScore('6-2 DEF').valid, false);
  assert.equal(parseScore('').valid, false);
  assert.equal(parseScore(undefined).valid, false);
});

test('lixo não parseia', () => {
  assert.equal(parseScore('foo bar').valid, false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/score.test.js`
Expected: FALHA (módulo `pipeline/score.js` não existe).

- [ ] **Step 3: Implementar `pipeline/score.js`**

```js
// Parser do placar formato Sackmann (ex.: "6-4 3-6 7-5", "7-6(5) 6-4").
// Retorna sets por lado (perspectiva do vencedor). Exclui abandonos/W.O.
// Puro. Testado em tests/score.test.js.

/** @returns {{valid:boolean, sets:number[][], winnerSets:number, loserSets:number}} */
export function parseScore(scoreStr) {
  const bad = { valid: false, sets: [], winnerSets: 0, loserSets: 0 };
  const s = (scoreStr || '').trim();
  if (!s || /\b(RET|W\/O|DEF|ABN|ABD|UNK|Walkover|Default)\b/i.test(s)) return bad;
  const sets = [];
  for (const tk of s.split(/\s+/)) {
    const m = tk.match(/^(\d+)-(\d+)(?:\([^)]*\))?$/);
    if (!m) return bad;
    sets.push([Number(m[1]), Number(m[2])]);
  }
  if (!sets.length) return bad;
  let winnerSets = 0, loserSets = 0;
  for (const [a, b] of sets) { if (a > b) winnerSets++; else if (b > a) loserSets++; }
  return { valid: true, sets, winnerSets, loserSets };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/score.test.js`
Expected: todos PASSAM.

- [ ] **Step 5: Commit**

```bash
git add pipeline/score.js tests/score.test.js
git commit -m "$(cat <<'EOF'
feat(pipeline): parser de placar (score.js) para a medição de swing

Parseia "6-4 3-6 7-5"/tie-breaks em sets por lado; exclui RET/W-O/DEF.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `pipeline/swing-signals.js` — acumuladores correntes

**Files:**
- Create: `pipeline/swing-signals.js`
- Create: `tests/swing-signals.test.js`

- [ ] **Step 1: Escrever os testes**

Criar `tests/swing-signals.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SwingStats } from '../pipeline/swing-signals.js';

test('acumula devolução e 1º set, ponto a ponto', () => {
  const s = new SwingStats();
  assert.equal(s.ready('A', 1), false);
  s.update('A', { svpt: 80, spWon: 55, retPts: 70, retWon: 28, wonFirstSet: true });
  s.update('A', { svpt: 90, spWon: 60, retPts: 80, retWon: 24, wonFirstSet: false });
  assert.equal(s.ready('A', 2), true);
  assert.equal(s.ready('A', 3), false);
  assert.ok(Math.abs(s.returnWonPct('A') - (52 / 150)) < 1e-9);
  assert.ok(Math.abs(s.serveWonPct('A') - (115 / 170)) < 1e-9);
  assert.ok(Math.abs(s.firstSetPct('A') - 0.5) < 1e-9);
});

test('sem dados de saque → pct null, mas conta a partida e o 1º set', () => {
  const s = new SwingStats();
  s.update('B', { svpt: 0, spWon: 0, retPts: 0, retWon: 0, wonFirstSet: true });
  assert.equal(s.returnWonPct('B'), null);
  assert.equal(s.serveWonPct('B'), null);
  assert.equal(s.firstSetPct('B'), 1);
  assert.equal(s.ready('B', 1), true);
});

test('jogador desconhecido → leituras nulas/seguras', () => {
  const s = new SwingStats();
  assert.equal(s.ready('Z', 1), false);
  assert.equal(s.returnWonPct('Z'), null);
  assert.equal(s.firstSetPct('Z'), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/swing-signals.test.js`
Expected: FALHA (módulo não existe).

- [ ] **Step 3: Implementar `pipeline/swing-signals.js`**

```js
// Acumuladores correntes (point-in-time) por jogador: saque, devolução e 1º set.
// Atualizado APÓS capturar o estado pré-jogo (o runner garante a ordem).
// Puro/determinístico. Testado em tests/swing-signals.test.js.
export class SwingStats {
  constructor() { this.p = new Map(); }

  _get(name) {
    let s = this.p.get(name);
    if (!s) { s = { matches: 0, svpt: 0, spWon: 0, retPts: 0, retWon: 0, firstPlayed: 0, firstWon: 0 }; this.p.set(name, s); }
    return s;
  }

  ready(name, minMatches) { return (this.p.get(name)?.matches ?? 0) >= minMatches; }
  returnWonPct(name) { const s = this.p.get(name); return s && s.retPts > 0 ? s.retWon / s.retPts : null; }
  serveWonPct(name) { const s = this.p.get(name); return s && s.svpt > 0 ? s.spWon / s.svpt : null; }
  firstSetPct(name) { const s = this.p.get(name); return s && s.firstPlayed > 0 ? s.firstWon / s.firstPlayed : null; }

  update(name, { svpt = 0, spWon = 0, retPts = 0, retWon = 0, wonFirstSet = false } = {}) {
    const s = this._get(name);
    s.matches++;
    s.firstPlayed++;
    if (wonFirstSet) s.firstWon++;
    if (svpt > 0) { s.svpt += svpt; s.spWon += spWon; }
    if (retPts > 0) { s.retPts += retPts; s.retWon += retWon; }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/swing-signals.test.js`
Expected: todos PASSAM.

- [ ] **Step 5: Suíte completa + commit**

Run: `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"` → `fail 0`.

```bash
git add pipeline/swing-signals.js tests/swing-signals.test.js
git commit -m "$(cat <<'EOF'
feat(pipeline): SwingStats — acumuladores correntes por jogador

Saque/devolução/1º set point-in-time, atualizados após o estado pré-jogo.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `pipeline/swing-measure.js` — o runner

**Files:**
- Create: `pipeline/swing-measure.js`

- [ ] **Step 1: Criar o diretório de findings**

```bash
mkdir -p docs/superpowers/findings
```

- [ ] **Step 2: Escrever `pipeline/swing-measure.js`**

```js
// Frente C, Fase 1 — mede se algum sinal pré-jogo prevê "o favorito perdeu >=1 set"
// ALÉM do equilíbrio. Walk-forward sem vazamento (clona value-backtest.js).
// Uso: node pipeline/swing-measure.js [de] [ate] [split]
import { writeFile } from 'node:fs/promises';
import { parseCsv, toMatch } from './ingest.js';
import { EloEngine } from './elo-engine.js';
import { parseScore } from './score.js';
import { SwingStats } from './swing-signals.js';

const FROM = Number(process.argv[2]) || 2011;
const TO = Number(process.argv[3]) || 2025;
const SPLIT = Number(process.argv[4]) || TO - 3; // teste = SPLIT..TO
const MEASURE_FROM = FROM + 3;                   // aquece o Elo antes de medir
const WARMUP = 25;                               // partidas mínimas por jogador
const MIN_CELL = 300;                            // amostra mínima por célula (teste) p/ contar como prova
const TML = 'https://raw.githubusercontent.com/Tennismylife/TML-Database/master';
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

async function loadYear(y) {
  const res = await fetch(`${TML}/${y}.csv`);
  if (!res.ok) { console.warn(`ATP ${y}: HTTP ${res.status}`); return []; }
  return parseCsv(await res.text())
    .map((row) => ({ ...toMatch(row), score: row.score, raw: row }))
    .filter((m) => m.winner && m.loser && m.surface);
}

console.log(`Baixando ATP ${FROM}-${TO} (TML)...`);
const chunks = await Promise.all(Array.from({ length: TO - FROM + 1 }, (_, i) => loadYear(FROM + i)));
const matches = chunks.flat().sort((a, b) => a.dateInt - b.dateInt || a.roundOrder - b.roundOrder || a.matchNum - b.matchNum);
console.log(`${matches.length} partidas. Medindo ${MEASURE_FROM}-${TO}; teste ${SPLIT}-${TO}.\n`);

const engine = new EloEngine();
const stats = new SwingStats();
const records = [];
let skipped = 0;

for (const m of matches) {
  const parsed = parseScore(m.score);
  const { winner, loser, surface, bestOf, dateInt } = m;
  const pW = engine.predict(winner, loser, surface);
  const favIsWinner = pW >= 0.5;
  const fav = favIsWinner ? winner : loser;
  const und = favIsWinner ? loser : winner;
  const favProb = favIsWinner ? pW : 1 - pW;

  if (parsed.valid && dateInt >= MEASURE_FROM * 10000 && stats.ready(fav, WARMUP) && stats.ready(und, WARMUP)) {
    const undSets = favIsWinner ? parsed.loserSets : parsed.winnerSets;
    const retF = stats.returnWonPct(fav), retU = stats.returnWonPct(und);
    const sF = engine.getState(fav), sU = engine.getState(und);
    const mismatch = (sF.overall - (sF.surfaces[surface] ?? 1500)) + ((sU.surfaces[surface] ?? 1500) - sU.overall);
    records.push({
      test: dateInt >= SPLIT * 10000,
      favProb,
      target: undSets >= 1 ? 1 : 0,
      bestOf,
      breakProne: retF != null && retU != null ? retF + retU : null,
      mismatch,
      undFirstSet: stats.firstSetPct(und),
    });
  }
  if (!parsed.valid) { skipped++; }

  if (parsed.valid) {
    const r = m.raw;
    const winnerWonSet1 = parsed.sets.length ? parsed.sets[0][0] > parsed.sets[0][1] : true;
    stats.update(winner, { svpt: num(r.w_svpt), spWon: num(r.w_1stWon) + num(r.w_2ndWon), retPts: num(r.l_svpt), retWon: num(r.l_svpt) - (num(r.l_1stWon) + num(r.l_2ndWon)), wonFirstSet: winnerWonSet1 });
    stats.update(loser, { svpt: num(r.l_svpt), spWon: num(r.l_1stWon) + num(r.l_2ndWon), retPts: num(r.w_svpt), retWon: num(r.w_svpt) - (num(r.w_1stWon) + num(r.w_2ndWon)), wonFirstSet: !winnerWonSet1 });
  }
  engine.processMatch({ winner, loser, surface, dateInt });
}

const BANDS = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.01]];
const pct = (x) => x == null ? '  —  ' : (x * 100).toFixed(1).padStart(5);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const rate = (a) => a.length ? a.reduce((s, r) => s + r.target, 0) / a.length : null;

// Sanidade: taxa base de "favorito perdeu set" por faixa (deve cair quando o favorito é mais forte).
function baseline() {
  const out = [];
  for (const [lo, hi] of BANDS) {
    const test = records.filter((r) => r.test && r.favProb >= lo && r.favProb < hi);
    out.push({ band: `${(lo * 100) | 0}-${(hi * 100) | 0}`, n: test.length, rate: rate(test) });
  }
  return out;
}

// Sinal contínuo: corte na mediana do FIT (por faixa), efeito medido no TESTE.
function analyzeContinuous(key) {
  const rows = [];
  for (const [lo, hi] of BANDS) {
    const inBand = (r) => r.favProb >= lo && r.favProb < hi && r[key] != null;
    const fit = records.filter((r) => !r.test && inBand(r));
    const test = records.filter((r) => r.test && inBand(r));
    if (fit.length < 50) { rows.push({ band: `${(lo * 100) | 0}-${(hi * 100) | 0}`, note: 'fit baixo' }); continue; }
    const thr = median(fit.map((r) => r[key]));
    const hiG = test.filter((r) => r[key] >= thr), loG = test.filter((r) => r[key] < thr);
    const rHi = rate(hiG), rLo = rate(loG);
    rows.push({ band: `${(lo * 100) | 0}-${(hi * 100) | 0}`, thr, nHi: hiG.length, nLo: loG.length, rHi, rLo, diff: rHi != null && rLo != null ? rHi - rLo : null });
  }
  return rows;
}

// best_of: 5 vs 3 direto, por faixa (só faixas com BO5).
function analyzeBestOf() {
  const rows = [];
  for (const [lo, hi] of BANDS) {
    const test = records.filter((r) => r.test && r.favProb >= lo && r.favProb < hi);
    const b5 = test.filter((r) => r.bestOf === 5), b3 = test.filter((r) => r.bestOf === 3);
    if (b5.length < 30) continue;
    rows.push({ band: `${(lo * 100) | 0}-${(hi * 100) | 0}`, n5: b5.length, n3: b3.length, r5: rate(b5), r3: rate(b3), diff: rate(b5) - rate(b3) });
  }
  return rows;
}

// Veredito: passa se >= metade das células com amostra separam >= 5pp na mesma direção.
function verdict(rows) {
  const valid = rows.filter((r) => r.diff != null && r.nHi >= MIN_CELL && r.nLo >= MIN_CELL);
  if (valid.length < 2) return 'INCONCLUSIVO (amostra insuficiente)';
  const pos = valid.filter((r) => r.diff >= 0.05).length;
  const neg = valid.filter((r) => r.diff <= -0.05).length;
  const strong = Math.max(pos, neg);
  return strong >= Math.ceil(valid.length / 2) ? `PASSA (${strong}/${valid.length} células ≥5pp)` : `NÃO PASSA (${strong}/${valid.length} células ≥5pp)`;
}

let out = `# Medição de swing (Frente C, Fase 1) — ATP\n\n`;
out += `Amostra: ${records.length} partidas medidas (${records.filter((r) => r.test).length} no teste). `;
out += `Placar inválido/abandono ignorado: ${skipped}. Anos ${FROM}-${TO}, teste ${SPLIT}-${TO}.\n\n`;
out += `Alvo: **favorito perdeu ≥1 set**. Proxy de placar (não é preço nem lucro).\n\n`;

out += `## Sanidade — taxa base por faixa de prob do favorito (teste)\n\n`;
out += `| Faixa | n | taxa |\n|---|---|---|\n`;
for (const r of baseline()) out += `| ${r.band}% | ${r.n} | ${pct(r.rate)}% |\n`;
out += `\n(Esperado: a taxa CAI conforme o favorito fica mais forte.)\n\n`;

const SIGS = [
  ['breakProne', 'Jogo quebra-quebra (devolução combinada)'],
  ['mismatch', 'Mismatch de piso (delta de Elo por superfície)'],
  ['undFirstSet', 'Azarão começa forte (taxa de 1º set do azarão)'],
];
for (const [key, label] of SIGS) {
  const rows = analyzeContinuous(key);
  out += `## ${label}\n\n`;
  out += `| Faixa | corte | n(alto) | n(baixo) | taxa alto | taxa baixo | dif (pp) |\n|---|---|---|---|---|---|---|\n`;
  for (const r of rows) {
    if (r.note) { out += `| ${r.band}% | ${r.note} | | | | | |\n`; continue; }
    out += `| ${r.band}% | ${r.thr.toFixed(3)} | ${r.nHi} | ${r.nLo} | ${pct(r.rHi)}% | ${pct(r.rLo)}% | ${r.diff == null ? '—' : (r.diff * 100).toFixed(1)} |\n`;
  }
  out += `\n**Veredito:** ${verdict(rows)}\n\n`;
}

const bo = analyzeBestOf();
out += `## Melhor-de-5 vs melhor-de-3\n\n`;
out += `| Faixa | n(BO5) | n(BO3) | taxa BO5 | taxa BO3 | dif (pp) |\n|---|---|---|---|---|---|\n`;
for (const r of bo) out += `| ${r.band}% | ${r.n5} | ${r.n3} | ${pct(r.r5)}% | ${pct(r.r3)}% | ${(r.diff * 100).toFixed(1)} |\n`;
out += `\n`;

console.log(out);
await writeFile(new URL('../docs/superpowers/findings/2026-07-18-swing-medicao.md', import.meta.url), out);
console.log('Resumo salvo em docs/superpowers/findings/2026-07-18-swing-medicao.md');
```

- [ ] **Step 3: Checar sintaxe**

Run: `node --check pipeline/swing-measure.js`
Expected: exit 0.

- [ ] **Step 4: Commit do runner**

```bash
git add pipeline/swing-measure.js
git commit -m "$(cat <<'EOF'
feat(pipeline): runner da medição de swing (Frente C, Fase 1)

Walk-forward ATP (TML) sem vazamento: prob do favorito + delta de piso do
Elo, sinais correntes, alvo "favorito perdeu set"; estratifica por faixa e
imprime relatório + salva markdown. Sem UI.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Rodar, ler o resultado e decidir o go/no-go

**Files:**
- Create (gerado): `docs/superpowers/findings/2026-07-18-swing-medicao.md`

- [ ] **Step 1: Rodar a medição**

Run: `node pipeline/swing-measure.js`
Expected: baixa os anos, imprime o relatório e grava o markdown. (Rede + ~40k partidas; pode levar ~1 min.)

- [ ] **Step 2: Sanidade do resultado**

Conferir no relatório:
- A **taxa base** de "favorito perdeu set" **cai** conforme a faixa de prob sobe (ex.: ~55–65% perde set muito mais que 85%+). Se NÃO cair, há bug no alvo/parse — parar e investigar antes de confiar nos sinais.
- As amostras por célula no teste são plausíveis (milhares no total).

- [ ] **Step 3: Ler os vereditos**

Anotar, por sinal, o veredito (PASSA / NÃO PASSA / INCONCLUSIVO) e a magnitude típica da diferença.

- [ ] **Step 4: Commit do resumo**

```bash
git add docs/superpowers/findings/2026-07-18-swing-medicao.md
git commit -m "$(cat <<'EOF'
docs(frente-c): resultado da medição de swing (ATP)

Relatório do walk-forward: taxa base por faixa + veredito por sinal.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Decisão com o Felipe**

Levar o resultado ao Felipe:
- **Se algum sinal PASSA:** propor a Fase 2 (Shortlist) sobre ele(s) — e antes, confirmar no WTA.
- **Se nenhum passa:** registrar honestamente "a Shortlist não tem base medida — não construir agora", e discutir alternativas (outro alvo? outro sinal?). É um resultado válido.

---

## Verificação final

- [ ] `npm test` verde (`fail 0`) com os testes novos de `score` e `swing-signals`.
- [ ] `node --check pipeline/swing-measure.js` exit 0.
- [ ] `node pipeline/swing-measure.js` roda, a taxa base cai por faixa (sanidade), e o markdown é gravado.
- [ ] Resultado lido e go/no-go decidido com o Felipe (esta fase NÃO publica nada na UI).

## Notas
- Só `pipeline/` + `tests/` + `docs/` — nenhuma mudança na UI, no `today.json` ou no deploy.
- Se a taxa base não cair por faixa, o alvo/parse está errado — é o primeiro sinal de bug.
- Sinal contínuo cortado na mediana do FIT (sem olhar o teste); efeito medido no teste — evita escolher o corte que favorece o resultado.
