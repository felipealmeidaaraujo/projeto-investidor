// Mede o VIÉS do motor de Markov em cada fronteira de set, contra o que acontece de verdade.
//
// Em cada estado (favorito 1-0, 0-1, 1-1 em sets), compara:
//   - o que o modelo projeta de vitória do favorito;
//   - a taxa REAL observada.
// A diferença é a correção que a odd justa ao vivo precisa aplicar.
//
// Força vem da odd de FECHAMENTO (visão do mercado, sem vazamento); estado e desfecho
// vêm do placar set a set. Só melhor-de-3 (bo5 é só Slam, amostra pequena por célula).
//
// Uso: node pipeline/live-calibration.js [anoInicio] [anoFim]
import { loadTennisData } from './ingest-tennisdata.js';
import { impliedServeProbs, winProbFromState } from '../web/src/inplay.js';

const FROM = Number(process.argv[2]) || 2013;
const TO = Number(process.argv[3]) || 2026;
const MIN_N = 300; // abaixo disso a célula é ruído — não vira correção

const BANDS = [
  { lo: 0.50, hi: 0.60, label: '50–60%' },
  { lo: 0.60, hi: 0.70, label: '60–70%' },
  { lo: 0.70, hi: 0.80, label: '70–80%' },
  { lo: 0.80, hi: 0.90, label: '80–90%' },
  { lo: 0.90, hi: 1.01, label: '90%+ ' },
];
// Estados de fronteira de set em melhor-de-3, pela ótica do FAVORITO.
const STATES = [
  { key: '1-0', sa: 1, sb: 0, label: 'favorito 1-0 (ganhou o 1º set)' },
  { key: '0-1', sa: 0, sb: 1, label: 'favorito 0-1 (perdeu o 1º set)' },
  { key: '1-1', sa: 1, sb: 1, label: 'favorito 1-1 (vai pro set decisivo)' },
];

/** Prob do favorito (A) vencer a partida a partir de um placar de sets, pelo modelo. */
function modelProb(favPreProb, sa, sb, base) {
  const { pA, pB } = impliedServeProbs(favPreProb, { base, bestOf: 3 });
  const s = (serverIsA) => winProbFromState({ setsA: sa, setsB: sb, gamesA: 0, gamesB: 0, serverIsA }, pA, pB, 3);
  return (s(true) + s(false)) / 2;
}

/** Vencedores de cada set, na ótica do VENCEDOR da partida. null quando o set não existe/é inválido. */
function setWinners(m) {
  const pares = [[m.w1, m.l1], [m.w2, m.l2], [m.w3, m.l3]];
  const out = [];
  for (const [w, l] of pares) {
    if (w == null || l == null || w === l) break;
    out.push(w > l); // true = vencedor da partida levou o set
  }
  return out;
}

async function run(tour, base) {
  const matches = await loadTennisData(FROM, TO, tour);
  // buckets[state][band] = { n, realWins, modelSum }
  const buckets = {};
  for (const s of STATES) buckets[s.key] = BANDS.map(() => ({ n: 0, real: 0, model: 0 }));
  let usados = 0;

  for (const m of matches) {
    if ((m.bestOf || 3) !== 3) continue;
    let oW = m.psw, oL = m.psl;
    if (!oW || !oL) { oW = m.avgw; oL = m.avgl; }
    if (!oW || !oL || oW <= 1 || oL <= 1) continue;
    const sets = setWinners(m);
    if (sets.length < 2) continue; // precisa de pelo menos 2 sets pra ter fronteira útil

    const favIsWinner = oW < oL;
    const pf = 1 / Math.min(oW, oL), pd = 1 / Math.max(oW, oL);
    const favPreProb = pf / (pf + pd);
    const bandIdx = BANDS.findIndex((b) => favPreProb >= b.lo && favPreProb < b.hi);
    if (bandIdx < 0) continue;
    const favWonMatch = favIsWinner;
    // set levado pelo favorito?
    const favTook = (i) => (favIsWinner ? sets[i] : !sets[i]);
    usados++;

    // Depois do 1º set: estado 1-0 ou 0-1
    const apos1 = favTook(0) ? '1-0' : '0-1';
    const b1 = buckets[apos1][bandIdx];
    b1.n++; b1.real += favWonMatch ? 1 : 0;
    b1.model += modelProb(favPreProb, apos1 === '1-0' ? 1 : 0, apos1 === '1-0' ? 0 : 1, base);

    // Depois do 2º set: só interessa quando ficou 1-1 (foi pro decisivo)
    if (sets.length >= 3 && favTook(0) !== favTook(1)) {
      const b2 = buckets['1-1'][bandIdx];
      b2.n++; b2.real += favWonMatch ? 1 : 0;
      b2.model += modelProb(favPreProb, 1, 1, base);
    }
  }
  return { buckets, usados };
}

const pct = (x) => `${(x * 100).toFixed(1).padStart(5)}%`;

async function main() {
  const tabela = {};
  for (const [tour, base] of [['ATP', 0.64], ['WTA', 0.56]]) {
    console.log(`\nPuxando ${tour} ${FROM}–${TO}...`);
    const { buckets, usados } = await run(tour, base);
    console.log(`${usados} partidas melhor-de-3 utilizáveis.\n`);
    tabela[tour] = {};

    for (const st of STATES) {
      console.log(`=== ${tour} · ${st.label} ===`);
      console.log('faixa do favorito     n      real    modelo    viés      correção?');
      tabela[tour][st.key] = [];
      for (let i = 0; i < BANDS.length; i++) {
        const b = buckets[st.key][i];
        if (!b.n) { console.log(`${BANDS[i].label.padEnd(16)}  ${'0'.padStart(6)}   —`); tabela[tour][st.key].push(null); continue; }
        const real = b.real / b.n;
        const model = b.model / b.n;
        const vies = (real - model) * 100;
        const usa = b.n >= MIN_N;
        console.log(
          `${BANDS[i].label.padEnd(16)}  ${String(b.n).padStart(6)}  ${pct(real)}  ${pct(model)}  ${(vies >= 0 ? '+' : '') + vies.toFixed(1).padStart(5)}pp   ${usa ? 'sim' : `não (n<${MIN_N})`}`
        );
        tabela[tour][st.key].push(usa ? { band: BANDS[i].label.trim(), n: b.n, real: Number(real.toFixed(4)), model: Number(model.toFixed(4)) } : null);
      }
      console.log('');
    }
  }
  console.log('\n=== TABELA (pra colar no módulo de correção) ===');
  console.log(JSON.stringify(tabela, null, 2));
  console.log(`\nviés = real − modelo. Negativo: o modelo é otimista demais com o favorito naquele estado.`);
  console.log(`Só vira correção com n ≥ ${MIN_N}; abaixo disso a célula é ruído e fica sem correção.`);
}

main();
