// Agrega estatísticas de saque/devolução do espelho TML (Sackmann, ATP) e enriquece
// web/model-atp.json com um "perfil de saque" por jogador. Uso: node pipeline/serve-stats.js
import { readFile, writeFile } from 'node:fs/promises';
import { parseCsv } from './ingest.js';
import { matchPlayer } from './match-names.js';

const TML = 'https://raw.githubusercontent.com/Tennismylife/TML-Database/master';
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

function accumulate(map, row) {
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

async function main() {
  const modelUrl = new URL('../web/model-atp.json', import.meta.url);
  const model = JSON.parse(await readFile(modelUrl));
  const to = new Date().getFullYear();
  const from = to - 3;

  console.log(`Agregando saque ATP ${from}–${to} (TML)...`);
  const byFull = new Map();
  for (let y = from; y <= to; y++) {
    try {
      const text = await (await fetch(`${TML}/${y}.csv`)).text();
      for (const row of parseCsv(text)) accumulate(byFull, row);
    } catch (e) {
      console.warn(`${y}: ${e.message}`);
    }
  }

  // casa nomes completos (TML) → jogador do modelo ("Sobrenome I."), guardando o nome completo dominante
  const byPlayer = new Map();
  for (const [full, t] of byFull) {
    const p = matchPlayer(full, model.players);
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
    if (e && e.t.svpt > 500) {
      const sp = serveProfile(e.t);
      p.serve = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, rnd(v)]));
      p.fullName = e.fullName;
      enriched++;
    }
  }

  await writeFile(modelUrl, JSON.stringify(model));
  console.log(`model-atp.json enriquecido: ${enriched} jogadores com perfil de saque.`);
  const sinner = model.players.find((x) => x.name.startsWith('Sinner'));
  if (sinner?.serve) console.log('ex. Sinner:', JSON.stringify(sinner.serve));
}

main();
