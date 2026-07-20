// Valida o MODELO DE PONTO contra os pontos reais dos Grand Slams (Sackmann).
//
// A PERGUNTA: saber o placar de pontos (15-40, deuce…) melhora de fato a previsão, ou é
// enfeite? Este é o defeito crítico nº 1 do painel — a nossa justa só valia ENTRE games,
// enquanto o preço da Betfair já embute o ponto.
//
// O TESTE: para cada ponto real, calcula a probabilidade de vitória de dois jeitos —
//   CEGO   = winProbFromState sem os pontos (o que o app fazia até agora)
//   PONTO  = winProbFromState com os pontos (o modelo novo)
// e compara o Brier dos dois contra o desfecho real da partida.
//
// Por que a comparação é justa: os DOIS usam exatamente o mesmo pA/pB. Qualquer erro na
// estimativa de força atinge os dois igualmente, então a diferença isola o efeito do ponto.
//
// Uso: node pipeline/point-model-validate.js [arquivo1 arquivo2 ...]
import { winProbFromState } from '../web/src/inplay.js';

const BASE = 'https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main/slam_pointbypoint';
const PADRAO = ['2023-usopen', '2023-wimbledon', '2022-ausopen'];

const PONTOS = { '0': 0, '15': 1, '30': 2, '40': 3, 'AD': 4 };

/** Divide uma linha de CSV respeitando aspas. */
function linhaCSV(l) {
  const out = [];
  let cur = '';
  let dentro = false;
  for (const c of l) {
    if (c === '"') dentro = !dentro;
    else if (c === ',' && !dentro) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function baixar(slug) {
  const r = await fetch(`${BASE}/${slug}-points.csv`);
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${slug}`);
  const txt = await r.text();
  const linhas = txt.split('\n').filter((l) => l.trim());
  const cols = linhaCSV(linhas[0]);
  const idx = Object.fromEntries(cols.map((c, i) => [c.trim(), i]));
  return { linhas: linhas.slice(1), idx };
}

/** Converte o placar de pontos em contagem. No tiebreak os campos já vêm numéricos. */
function ponto(v, tiebreak) {
  const s = String(v ?? '').trim();
  if (tiebreak) { const n = Number(s); return Number.isFinite(n) ? n : 0; }
  return PONTOS[s] ?? 0;
}

const brier = (arr) => arr.reduce((s, x) => s + (x.p - x.o) ** 2, 0) / (arr.length || 1);

async function main() {
  const slugs = process.argv.slice(2).length ? process.argv.slice(2) : PADRAO;
  const cego = [];
  const comPonto = [];
  const noBreakPoint = { cego: [], ponto: [] };
  // Melhor-de-3 é o formato que o Felipe opera (Challenger/WTA). Em melhor-de-5 um game
  // pesa menos, então misturar os dois esconderia o efeito real pra ele.
  const porFormato = { 3: { cego: [], ponto: [], desloc: [] }, 5: { cego: [], ponto: [], desloc: [] } };
  let partidas = 0;
  let pontosUsados = 0;

  for (const slug of slugs) {
    console.log(`Baixando ${slug}...`);
    const { linhas, idx } = await baixar(slug);

    // agrupa por partida
    const porPartida = new Map();
    for (const l of linhas) {
      const c = linhaCSV(l);
      const id = c[idx.match_id];
      if (!id) continue;
      if (!porPartida.has(id)) porPartida.set(id, []);
      porPartida.get(id).push(c);
    }

    for (const [, pts] of porPartida) {
      // desfecho: quem levou mais sets (o último estado manda)
      let s1 = 0;
      let s2 = 0;
      for (const c of pts) {
        const sw = Number(c[idx.SetWinner]);
        if (sw === 1) s1++; else if (sw === 2) s2++;
      }
      if (s1 === s2) continue;                 // partida incompleta/abandonada
      const bestOf = s1 + s2 >= 4 || Math.max(s1, s2) === 3 ? 5 : 3;
      const p1Venceu = s1 > s2 ? 1 : 0;

      // força de saque observada NA PARTIDA (igual pros dois modelos → comparação justa)
      let sv1 = 0, sv1w = 0, sv2 = 0, sv2w = 0;
      for (const c of pts) {
        const srv = Number(c[idx.PointServer]);
        const w = Number(c[idx.PointWinner]);
        if (w !== 1 && w !== 2) continue;
        if (srv === 1) { sv1++; if (w === 1) sv1w++; }
        else if (srv === 2) { sv2++; if (w === 2) sv2w++; }
      }
      if (sv1 < 30 || sv2 < 30) continue;      // amostra fina demais
      const pA = Math.min(0.9, Math.max(0.4, sv1w / sv1));
      const pB = Math.min(0.9, Math.max(0.4, sv2w / sv2));
      partidas++;

      // caminha a partida ponto a ponto
      let setsA = 0, setsB = 0;
      let setAtual = Number(pts[0][idx.SetNo]) || 1;
      for (const c of pts) {
        const setNo = Number(c[idx.SetNo]);
        if (setNo !== setAtual) {
          const anterior = pts.find((x) => Number(x[idx.SetNo]) === setAtual && Number(x[idx.SetWinner]) > 0);
          const venc = anterior ? Number(anterior[idx.SetWinner]) : 0;
          if (venc === 1) setsA++; else if (venc === 2) setsB++;
          setAtual = setNo;
        }
        const gA = Number(c[idx.P1GamesWon]) || 0;
        const gB = Number(c[idx.P2GamesWon]) || 0;
        const srv = Number(c[idx.PointServer]);
        if (srv !== 1 && srv !== 2) continue;
        const tb = gA === 6 && gB === 6;
        const ptsA = ponto(c[idx.P1Score], tb);
        const ptsB = ponto(c[idx.P2Score], tb);
        if (ptsA + ptsB === 0) continue;       // 0-0: os dois modelos coincidem, não informa nada
        if (setsA >= (bestOf === 5 ? 3 : 2) || setsB >= (bestOf === 5 ? 3 : 2)) continue;

        const base = { setsA, setsB, gamesA: gA, gamesB: gB, serverIsA: srv === 1 };
        const pc = winProbFromState(base, pA, pB, bestOf);
        const pp = winProbFromState({ ...base, ptsA, ptsB }, pA, pB, bestOf);
        if (!Number.isFinite(pc) || !Number.isFinite(pp)) continue;
        cego.push({ p: pc, o: p1Venceu });
        comPonto.push({ p: pp, o: p1Venceu });
        const f = porFormato[bestOf];
        if (f) { f.cego.push({ p: pc, o: p1Venceu }); f.ponto.push({ p: pp, o: p1Venceu }); f.desloc.push(Math.abs(pp - pc)); }
        pontosUsados++;

        // recorte: break point (devolvedor com 3+ pontos e à frente, fora do tiebreak)
        const devolvedorPts = srv === 1 ? ptsB : ptsA;
        const sacadorPts = srv === 1 ? ptsA : ptsB;
        if (!tb && devolvedorPts >= 3 && devolvedorPts > sacadorPts) {
          noBreakPoint.cego.push({ p: pc, o: p1Venceu });
          noBreakPoint.ponto.push({ p: pp, o: p1Venceu });
        }
      }
    }
  }

  const bc = brier(cego);
  const bp = brier(comPonto);
  const melhora = ((bc - bp) / bc) * 100;
  console.log(`\n${partidas} partidas · ${pontosUsados.toLocaleString('pt-BR')} pontos avaliados\n`);
  console.log('=== O PLACAR DE PONTOS MELHORA A PREVISÃO? ===');
  console.log(`Brier CEGO  (sem pontos, como o app fazia): ${bc.toFixed(5)}`);
  console.log(`Brier PONTO (modelo novo):                  ${bp.toFixed(5)}`);
  console.log(`→ ${melhora >= 0 ? 'melhora' : 'PIORA'} de ${Math.abs(melhora).toFixed(2)}%`);

  if (noBreakPoint.cego.length) {
    const nbc = brier(noBreakPoint.cego);
    const nbp = brier(noBreakPoint.ponto);
    const m2 = ((nbc - nbp) / nbc) * 100;
    console.log(`\n=== SÓ EM BREAK POINT (n=${noBreakPoint.cego.length.toLocaleString('pt-BR')}) ===`);
    console.log(`Brier cego ${nbc.toFixed(5)} · com ponto ${nbp.toFixed(5)} → ${m2 >= 0 ? 'melhora' : 'PIORA'} de ${Math.abs(m2).toFixed(2)}%`);
    const desloc = noBreakPoint.ponto.reduce((s, x, i) => s + Math.abs(x.p - noBreakPoint.cego[i].p), 0) / noBreakPoint.cego.length;
    console.log(`Deslocamento médio da probabilidade no break point: ${(desloc * 100).toFixed(1)} pontos percentuais`);
  }
  console.log('\n=== POR FORMATO (o que muda pra quem opera melhor-de-3) ===');
  for (const bo of [3, 5]) {
    const f = porFormato[bo];
    if (!f.cego.length) continue;
    const c = brier(f.cego);
    const p = brier(f.ponto);
    const d = (f.desloc.reduce((s, x) => s + x, 0) / f.desloc.length) * 100;
    const max = Math.max(...f.desloc) * 100;
    console.log(
      `melhor-de-${bo}: n=${String(f.cego.length.toLocaleString('pt-BR')).padStart(7)} · Brier ${c.toFixed(5)} → ${p.toFixed(5)} ` +
      `(${(((c - p) / c) * 100).toFixed(2)}%) · deslocamento médio ${d.toFixed(1)}pp, máximo ${max.toFixed(1)}pp`
    );
  }
  console.log(`\nObs.: os dois modelos usam o MESMO pA/pB (saque observado na partida), então a`);
  console.log(`diferença isola o efeito de conhecer o ponto. População: Grand Slam.`);
}

main();
