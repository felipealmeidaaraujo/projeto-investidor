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

function baseline() {
  const out = [];
  for (const [lo, hi] of BANDS) {
    const test = records.filter((r) => r.test && r.favProb >= lo && r.favProb < hi);
    out.push({ band: `${(lo * 100) | 0}-${(hi * 100) | 0}`, n: test.length, rate: rate(test) });
  }
  return out;
}

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

function verdict(rows) {
  const valid = rows.filter((r) => r.diff != null && r.nHi >= MIN_CELL && r.nLo >= MIN_CELL);
  if (valid.length < 2) return 'INCONCLUSIVO (amostra insuficiente)';
  const pos = valid.filter((r) => r.diff >= 0.05).length;
  const neg = valid.filter((r) => r.diff <= -0.05).length;
  const strong = Math.max(pos, neg);
  return strong >= Math.ceil(valid.length / 2) ? `PASSA (${strong}/${valid.length} celulas >=5pp)` : `NAO PASSA (${strong}/${valid.length} celulas >=5pp)`;
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
