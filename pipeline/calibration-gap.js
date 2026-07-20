// Mede o quão LONGE a nossa odd justa (pré-jogo) está da linha afiada do mercado.
// Compara, na mesma base: nosso modelo (Elo calibrado) × Pinnacle/média × Betfair Exchange.
// Métrica: Brier (erro; menor = mais afiado) + distância média entre a nossa prob e a do mercado.
// Walk-forward, sem vazamento: aquece o Elo, ajusta T em anos de treino, mede no teste.
// Uso: node pipeline/calibration-gap.js
import { EloEngine } from './elo-engine.js';
import { loadTennisData } from './ingest-tennisdata.js';
import { fitTemperature, calibrate } from './calibrate.js';
import { brier } from './metrics.js';

const FROM = 2013, TO = 2026;
const FIT_FROM = 2020, TEST_FROM = 2023;
const fitInt = FIT_FROM * 10000, testInt = TEST_FROM * 10000;

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const devig = (oRef, oOther) => { const a = 1 / oRef, b = 1 / oOther; return a / (a + b); };

async function run(tour) {
  const matches = await loadTennisData(FROM, TO, tour);
  const engine = new EloEngine();
  const fitPreds = [];
  let T = null;
  const test = []; // { our, market, betfair|null, outcome, diff }
  for (const m of matches) {
    const { winner, loser, surface } = m;
    let oW = m.psw, oL = m.psl; if (!oW || !oL) { oW = m.avgw; oL = m.avgl; }
    const pRawW = engine.predict(winner, loser, surface); // prob (crua) do vencedor vencer
    if (oW && oL && oW > 1 && oL > 1) {
      const favIsWinner = oW < oL;                 // favorito do mercado = menor odd
      const ourFav = favIsWinner ? pRawW : 1 - pRawW;
      const outcome = favIsWinner ? 1 : 0;         // o favorito do mercado venceu?
      const marketFav = devig(Math.min(oW, oL), Math.max(oW, oL));
      if (m.dateInt >= fitInt && m.dateInt < testInt) fitPreds.push({ p: ourFav, outcome });
      if (m.dateInt >= testInt) {
        if (T === null) T = fitTemperature(fitPreds);
        const our = calibrate(ourFav, T);
        let bf = null;
        const favBf = favIsWinner ? m.bfew : m.bfel;
        const dogBf = favIsWinner ? m.bfel : m.bfew;
        if (favBf && dogBf && favBf > 1 && dogBf > 1) bf = devig(favBf, dogBf);
        test.push({ our, market: marketFav, betfair: bf, outcome, diff: Math.abs(our - marketFav) });
      }
    }
    engine.processMatch({ winner, loser, surface });
  }
  return { tour, T, test };
}

function brierOf(rows, key) { return brier(rows.map((r) => ({ p: r[key], outcome: r.outcome }))); }

async function main() {
  for (const tour of ['ATP', 'WTA']) {
    console.log(`\nPuxando ${tour} ${FROM}–${TO}...`);
    const { T, test } = await run(tour);
    const bf = test.filter((r) => r.betfair != null);

    console.log(`\n=== ${tour} — calibração pré-jogo (teste ${TEST_FROM}–${TO}, n=${test.length}) ===`);
    console.log(`Temperatura de calibração: T=${T.toFixed(3)}`);
    console.log(`Brier  ·  nosso ${brierOf(test, 'our').toFixed(4)}   mercado ${brierOf(test, 'market').toFixed(4)}   (quanto menor, mais afiado)`);
    console.log(`Distância média |nossa prob − mercado|: ${(mean(test.map((r) => r.diff)) * 100).toFixed(2)} pontos percentuais`);
    if (bf.length) {
      console.log(`\n  Subconjunto com Betfair Exchange (n=${bf.length}, ~2026):`);
      console.log(`  Brier  ·  nosso ${brierOf(bf, 'our').toFixed(4)}   mercado ${brierOf(bf, 'market').toFixed(4)}   Betfair ${brierOf(bf, 'betfair').toFixed(4)}`);
    }
  }
  console.log(`\nLeitura: Brier menor = previsão mais certeira. Se o nosso Brier > mercado, a nossa justa é`);
  console.log(`menos afiada (esperado — o mercado é o teto). A "distância média" diz, na prática, quantos pontos`);
  console.log(`percentuais a nossa probabilidade costuma diferir da linha do mercado.`);
}

main();
