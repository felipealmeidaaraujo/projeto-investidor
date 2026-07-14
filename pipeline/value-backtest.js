// Backtest de VALOR: modelo calibrado vs. odds reais. Aposta quando EV > limiar e mede ROI.
// Honesto: walk-forward (sem vazamento), calibração treinada em anos antigos, apostas só no teste.
// Uso: node pipeline/value-backtest.js [anoInicio] [anoFim] [anoPontuacao] [anoSplitTeste]
import { EloEngine } from './elo-engine.js';
import { loadTennisData } from './ingest-tennisdata.js';
import { fitTemperature, calibrate } from './calibrate.js';
import { brier, accuracy } from './metrics.js';

const FROM = Number(process.argv[2]) || 2010;
const TO = Number(process.argv[3]) || 2024;
const SCORE_FROM = Number(process.argv[4]) || FROM + 3;
const SPLIT = Number(process.argv[5]) || TO - 3;
const scoreFromInt = SCORE_FROM * 10000;
const splitInt = SPLIT * 10000;

const THRESHOLDS = [0, 0.02, 0.05, 0.1];
const SOURCES = [
  { key: 'Pinnacle', w: 'psw', l: 'psl' },
  { key: 'Max (melhor preço)', w: 'maxw', l: 'maxl' },
];

console.log(`Baixando ATP ${FROM}–${TO} (tennis-data.co.uk, com odds)...`);
const matches = await loadTennisData(FROM, TO, 'ATP');
console.log(`${matches.length} partidas. Aquecimento até ${SCORE_FROM - 1}; treino calibração ${SCORE_FROM}–${SPLIT - 1}; TESTE ${SPLIT}–${TO}.\n`);

const engine = new EloEngine();
const fitPreds = [];
let T = null;
const testEval = []; // {p, outcome} calibrado, referência favorito (sanidade)
const acc = {};
for (const s of SOURCES) for (const t of THRESHOLDS) acc[`${s.key}@${t}`] = { staked: 0, profit: 0, bets: 0, wins: 0 };

for (const m of matches) {
  const { surface, winner, loser } = m;
  const rW = engine.rating(winner, surface);
  const rL = engine.rating(loser, surface);
  const pW_raw = engine.predict(winner, loser, surface);

  // referência favorito (para treinar/medir calibração sem viés)
  let favP, favOut;
  if (rW > rL) { favP = pW_raw; favOut = 1; }
  else if (rL > rW) { favP = 1 - pW_raw; favOut = 0; }
  else if (winner < loser) { favP = pW_raw; favOut = 1; }
  else { favP = 1 - pW_raw; favOut = 0; }

  if (m.dateInt >= scoreFromInt && m.dateInt < splitInt) fitPreds.push({ p: favP, outcome: favOut });

  if (m.dateInt >= splitInt) {
    if (T === null) T = fitTemperature(fitPreds);
    const pW = calibrate(pW_raw, T);
    const pL = 1 - pW;
    testEval.push({ p: calibrate(favP, T), outcome: favOut });

    for (const s of SOURCES) {
      const oW = m[s.w];
      const oL = m[s.l];
      if (!oW || !oL) continue;
      const evW = pW * oW - 1;
      const evL = pL * oL - 1;
      for (const t of THRESHOLDS) {
        const a = acc[`${s.key}@${t}`];
        if (evW > t) { a.staked += 1; a.bets += 1; a.profit += oW - 1; a.wins += 1; }
        else if (evL > t) { a.staked += 1; a.bets += 1; a.profit += -1; }
      }
    }
  }

  engine.processMatch({ winner, loser, surface });
}

console.log(`Temperatura de calibração: T=${T}`);
console.log(`Sanidade no teste — Brier ${brier(testEval).toFixed(4)} · acurácia ${(accuracy(testEval) * 100).toFixed(1)}% (n=${testEval.length})\n`);

console.log('=== ROI DA ESTRATÉGIA DE VALOR (conjunto de teste) ===');
console.log('fonte de odds        limiar   apostas   ROI       acerto');
for (const s of SOURCES) {
  for (const t of THRESHOLDS) {
    const a = acc[`${s.key}@${t}`];
    const roi = a.staked ? (a.profit / a.staked) * 100 : 0;
    const hit = a.bets ? (a.wins / a.bets) * 100 : 0;
    console.log(
      `${s.key.padEnd(20)} EV>${(t * 100).toFixed(0).padStart(2)}%  ${String(a.bets).padStart(7)}   ${(roi >= 0 ? '+' : '') + roi.toFixed(2)}%`.padEnd(52) + `  ${hit.toFixed(1)}%`
    );
  }
  console.log('');
}
console.log('Nota: ROI positivo aqui é sinal promissor, mas o teste real é CLV ao vivo (odds de abertura→fechamento),');
console.log('que exige dados que só teremos operando. Trate ROI de backtest com ceticismo até validar ao vivo.');
