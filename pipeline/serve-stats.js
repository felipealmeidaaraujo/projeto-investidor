// Agrega estatísticas de saque/devolução e enriquece os modelos (ATP: mirror TML;
// WTA: espelho Sackmann via jsDelivr). Uso: node pipeline/serve-stats.js
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseCsv } from './ingest.js';
import { matchPlayer } from '../web/src/match-names.js';

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
