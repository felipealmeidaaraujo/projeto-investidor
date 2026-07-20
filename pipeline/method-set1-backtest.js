// Backtest do MÉTODO #1: "favorito pré-jogo perdeu o 1º set" → back no favorito tem edge?
// Pergunta: quando o favorito (definido pela ODD do mercado) larga o 1º set, ele VIRA
// mais do que o modelo de Markov projeta? Se sim, o mercado subvaloriza a virada = edge em back.
//
// Honesto: força vem da odd pré-jogo (visão do mercado, sem vazamento); o desfecho é o resultado.
// Etapa 1 (isto aqui): virada REAL × virada JUSTA do nosso modelo. Filtra método morto.
// Etapa 2 (fora daqui): ROI no preço AO VIVO real (Betfair histórica), que não temos.
//
// Uso: node pipeline/method-set1-backtest.js [anoInicio] [anoFim]
import { loadTennisData } from './ingest-tennisdata.js';
import { impliedServeProbs, winProbFromState } from '../web/src/inplay.js';

const FROM = Number(process.argv[2]) || 2013;
const TO = Number(process.argv[3]) || 2024;

const BANDS = [
  { lo: 0.50, hi: 0.60, label: '50–60%' },
  { lo: 0.60, hi: 0.70, label: '60–70%' },
  { lo: 0.70, hi: 0.80, label: '70–80%' },
  { lo: 0.80, hi: 0.90, label: '80–90%' },
  { lo: 0.90, hi: 1.01, label: '90%+ ' },
];
const SURFS = ['Hard', 'Clay', 'Grass'];

// Prob JUSTA de o favorito (A) virar, dado que perdeu o 1º set (0-1 em sets), pelo modelo.
// Média sobre quem saca no começo do 2º set.
function fairComebackProb(favPreProb, bestOf, base) {
  const { pA, pB } = impliedServeProbs(favPreProb, { base, bestOf });
  const s1 = winProbFromState({ setsA: 0, setsB: 1, gamesA: 0, gamesB: 0, serverIsA: true }, pA, pB, bestOf);
  const s2 = winProbFromState({ setsA: 0, setsB: 1, gamesA: 0, gamesB: 0, serverIsA: false }, pA, pB, bestOf);
  return (s1 + s2) / 2;
}

async function runTour(tour, base) {
  const matches = await loadTennisData(FROM, TO, tour);
  const rows = []; // { favPreProb, fairProb, favWon, surface }
  let total = 0;
  for (const m of matches) {
    total++;
    // odds de fechamento: Pinnacle preferido, senão a média do mercado
    let oW = m.psw, oL = m.psl;
    if (!oW || !oL) { oW = m.avgw; oL = m.avgl; }
    if (!oW || !oL || oW <= 1 || oL <= 1) continue;
    if (m.w1 == null || m.l1 == null || m.w1 === m.l1) continue; // sem 1º set válido
    const favIsWinner = oW < oL;                       // o favorito era o vencedor da partida?
    const oddFav = Math.min(oW, oL), oddDog = Math.max(oW, oL);
    const pf = 1 / oddFav, pd = 1 / oddDog;
    const favPreProb = pf / (pf + pd);                 // de-vig
    const set1ToMatchWinner = m.w1 > m.l1;             // vencedor da partida levou o 1º set?
    const favWonSet1 = favIsWinner ? set1ToMatchWinner : !set1ToMatchWinner;
    if (favWonSet1) continue;                          // SÓ interessa: favorito PERDEU o 1º set
    const bestOf = m.bestOf || 3;
    rows.push({ favPreProb, fairProb: fairComebackProb(favPreProb, bestOf, base), favWon: favIsWinner, surface: m.surface });
  }
  return { tour, total, rows };
}

function summarize(rows) {
  const n = rows.length;
  if (!n) return null;
  let wins = 0, fairSum = 0, profit = 0;
  for (const r of rows) {
    fairSum += r.fairProb;
    if (r.favWon) { wins++; profit += 1 / r.fairProb - 1; } else { profit -= 1; }
  }
  return { n, actual: wins / n, fair: fairSum / n, roi: profit / n };
}

function fmtPct(x) { return (x * 100).toFixed(1).padStart(5) + '%'; }
function fmtRow(label, s) {
  if (!s) return `${label.padEnd(10)}  ${'—'.padStart(6)}`;
  const dif = (s.actual - s.fair) * 100;
  const roi = s.roi * 100;
  return `${label.padEnd(10)}  ${String(s.n).padStart(6)}   ${fmtPct(s.actual)}   ${fmtPct(s.fair)}   ${(dif >= 0 ? '+' : '') + dif.toFixed(1).padStart(4)}pp   ${(roi >= 0 ? '+' : '') + roi.toFixed(1)}%`;
}

async function main() {
  for (const [tour, base] of [['ATP', 0.64], ['WTA', 0.56]]) {
    console.log(`\nBaixando ${tour} ${FROM}–${TO} (com odds e placar do 1º set)...`);
    const { total, rows } = await runTour(tour, base);
    const freq = total ? (rows.length / total) * 100 : 0;
    console.log(`${total} partidas · ${rows.length} com o favorito perdendo o 1º set (${freq.toFixed(1)}% dos jogos).\n`);

    console.log(`=== MÉTODO #1 — ${tour}: favorito perdeu o 1º set → back nele ===`);
    console.log('segmento        n      virada  modelo   dif      ROI@justa');
    console.log(fmtRow('GERAL', summarize(rows)));
    console.log('  · por força do favorito (odd pré-jogo):');
    for (const b of BANDS) console.log('  ' + fmtRow(b.label, summarize(rows.filter((r) => r.favPreProb >= b.lo && r.favPreProb < b.hi))));
    console.log('  · por superfície:');
    for (const s of SURFS) console.log('  ' + fmtRow(s, summarize(rows.filter((r) => r.surface && r.surface.toLowerCase() === s.toLowerCase()))));
  }
  console.log(`\nLeitura: "virada" = % real de vitória do favorito depois de perder o 1º set.`);
  console.log(`"modelo" = o que o nosso Markov projeta pra esse mesmo favorito. dif>0 e ROI@justa>0`);
  console.log(`significam que o favorito vira MAIS do que o justo → sinal de que o mercado subvaloriza a`);
  console.log(`virada (edge em back). ROI@justa aposta no favorito pela odd JUSTA (proxy do mercado); o`);
  console.log(`teste definitivo exige a odd AO VIVO real da Betfair, que só teremos operando.`);
}

main();
