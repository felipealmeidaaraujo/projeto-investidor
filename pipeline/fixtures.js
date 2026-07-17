// Monta web/today.json: a grade de jogos do dia (Flashscore — ATP/WTA/Challenger, com superfície),
// com a leitura Elo de cada confronto. Fallback: ESPN (só tour) se o Flashscore falhar.
// Uso: node pipeline/fixtures.js
import { writeFile, readFile } from 'node:fs/promises';
import { findModelPlayer } from '../web/src/match-names.js';
import { analyzeMatch } from '../web/src/analysis.js';
import { fetchGrid } from './flashscore.js';
import { fetchDayFixtures } from './espn.js';

const STATUS_RANK = { IN_PROGRESS: 0, SUSPENDED: 1, SCHEDULED: 2 };
const ymdUTC = (d) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

/** Grade crua {tour,tournament,surface,status,commence,a,b} de Flashscore, com ESPN de fallback. */
async function loadGrid() {
  try {
    const jogos = await fetchGrid();
    console.log(`Flashscore: ${jogos.length} jogos de simples.`);
    return { source: 'flashscore', jogos };
  } catch (e) {
    console.warn(`Flashscore indisponível (${e.message}) — caindo pra ESPN.`);
  }
  const ymd = ymdUTC(new Date());
  let jogos = [];
  for (const endpoint of ['atp', 'wta']) {
    try {
      const g = await fetchDayFixtures(endpoint, ymd);
      jogos = jogos.concat(g.map((x) => ({ ...x, a: x.aFull, b: x.bFull })));
    } catch (e) {
      console.warn(`ESPN ${endpoint}: ${e.message}`);
    }
  }
  console.log(`ESPN (fallback): ${jogos.length} jogos.`);
  return { source: 'espn', jogos };
}

async function buildToday() {
  const models = {
    ATP: JSON.parse(await readFile(new URL('../web/model-atp.json', import.meta.url))),
    WTA: JSON.parse(await readFile(new URL('../web/model-wta.json', import.meta.url))),
  };
  const out = { generatedAt: new Date().toISOString(), source: null, count: 0, matches: [], unmatched: [] };

  const { source, jogos } = await loadGrid();
  out.source = source;
  if (!jogos.length) {
    console.warn('Nenhuma fonte trouxe jogos — mantendo o today.json anterior.');
    return;
  }

  const seen = new Set();
  for (const g of jogos) {
    const key = `${g.tour}|${g.a}|${g.b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const model = models[g.tour];
    if (!model) continue;
    const pa = findModelPlayer(g.a, model.players);
    const pb = findModelPlayer(g.b, model.players);
    if (!pa || !pb) {
      out.unmatched.push(`${g.a} / ${g.b} [${g.tour} ${g.tournament}]`);
      continue;
    }
    const r = analyzeMatch(pa, pb, g.surface, model);
    out.matches.push({
      tour: g.tour,
      tournament: g.tournament,
      surface: g.surface,
      status: g.status,
      commence: g.commence,
      a: pa.name,
      b: pb.name,
      probA: r.probA,
      // Só quando houve ajuste — evita um campo null em todo jogo do JSON que o
      // celular baixa. O card da grade sinaliza o ajuste (selo) e o card do
      // confronto explica em detalhe (ver ageAdjustText em web/src/age-curve.js).
      ...(r.ageAdjust?.adjusted ? { ageAdjust: r.ageAdjust } : {}),
      favorite: r.favorite,
      favoriteProb: r.favoriteProb,
      marginLabel: r.marginLabel,
      confidence: r.confidence.level,
      fairOddA: Math.round(r.fairOddA * 100) / 100,
      fairOddB: Math.round(r.fairOddB * 100) / 100,
      marketOddA: null,
      marketOddB: null,
    });
  }

  out.matches.sort(
    (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || (a.commence || '').localeCompare(b.commence || '')
  );
  out.count = out.matches.length;
  await writeFile(new URL('../web/today.json', import.meta.url), JSON.stringify(out));
  console.log(`today.json (${source}): ${out.count} jogos casados, ${out.unmatched.length} não-casados.`);
  if (out.unmatched.length) console.log('não-casados:', out.unmatched.slice(0, 15).join(' | '));
}

buildToday();
