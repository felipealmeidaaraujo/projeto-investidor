// Monta web/today.json: a grade de jogos do dia (ESPN — todos os torneios de tour ATP/WTA)
// com a leitura Elo de cada confronto. Odds de mercado (The Odds API) entram só onde há
// cobertura (Grand Slams/Masters); no resto o card mostra só a análise do modelo.
// Uso: node --env-file=.env pipeline/fixtures.js   (ODDS_API_KEY é opcional).
import { readFile, writeFile } from 'node:fs/promises';
import { matchPlayer, normName } from '../web/src/match-names.js';
import { analyzeMatch } from '../web/src/analysis.js';
import { fetchDayFixtures } from './espn.js';

const KEY = process.env.ODDS_API_KEY;
const ODDS_BASE = 'https://api.the-odds-api.com/v4';

const ymdUTC = (d) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

// Chave de par independente da ordem, pra deduplicar e casar odds↔grade.
const pairKey = (a, b) => [normName(a), normName(b)].sort().join('|');

// Ordena a lista: ao vivo → suspenso → agendado; dentro do grupo, por horário.
const STATUS_RANK = { IN_PROGRESS: 0, SUSPENDED: 1, SCHEDULED: 2 };

/** Média das odds h2h das casas (por lado), a partir de um evento da The Odds API. */
function avgH2H(ev) {
  const home = [];
  const away = [];
  for (const bm of ev.bookmakers || []) {
    const h2h = bm.markets?.find((m) => m.key === 'h2h');
    if (!h2h) continue;
    const oh = h2h.outcomes.find((o) => o.name === ev.home_team);
    const oa = h2h.outcomes.find((o) => o.name === ev.away_team);
    if (oh) home.push(oh.price);
    if (oa) away.push(oa.price);
  }
  const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 100) / 100 : null);
  return { home: avg(home), away: avg(away) };
}

/** Odds de mercado por par canônico (só torneios que a The Odds API cobre). Map: "TOUR|par" → {nome:odd}. */
async function fetchOdds(models) {
  const byPair = new Map();
  if (!KEY) return byPair;
  let sports;
  try {
    const r = await fetch(`${ODDS_BASE}/sports/?apiKey=${KEY}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    sports = await r.json();
  } catch (e) {
    console.warn(`The Odds API indisponível (${e.message}) — grade sem odds de mercado.`);
    return byPair;
  }
  const keys = (sports || []).filter((s) => /^tennis_/.test(s.key) && s.active).map((s) => s.key);
  if (keys.length) console.log(`The Odds API cobre hoje: ${keys.join(', ')}`);
  for (const k of keys) {
    const tour = k.startsWith('tennis_wta') ? 'WTA' : 'ATP';
    const model = models[tour];
    let events;
    try {
      const r = await fetch(`${ODDS_BASE}/sports/${k}/odds/?regions=eu&markets=h2h&oddsFormat=decimal&apiKey=${KEY}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      events = await r.json();
    } catch (e) {
      console.warn(`odds de ${k}: ${e.message}`);
      continue;
    }
    for (const ev of events || []) {
      const pa = matchPlayer(ev.home_team, model.players);
      const pb = matchPlayer(ev.away_team, model.players);
      if (!pa || !pb) continue;
      const odds = avgH2H(ev);
      byPair.set(`${tour}|${pairKey(pa.name, pb.name)}`, { [pa.name]: odds.home, [pb.name]: odds.away });
    }
  }
  return byPair;
}

async function buildToday() {
  const models = {
    ATP: JSON.parse(await readFile(new URL('../web/model-atp.json', import.meta.url))),
    WTA: JSON.parse(await readFile(new URL('../web/model-wta.json', import.meta.url))),
  };
  const ymd = ymdUTC(new Date());
  const out = { generatedAt: new Date().toISOString(), source: 'espn', count: 0, matches: [], unmatched: [] };

  // 1) grade ESPN — os dois endpoints trazem ambos os gêneros; juntamos e deduplicamos por par.
  let raw = [];
  let espnOk = 0;
  for (const endpoint of ['atp', 'wta']) {
    try {
      raw = raw.concat(await fetchDayFixtures(endpoint, ymd));
      espnOk++;
    } catch (e) {
      console.warn(`ESPN ${endpoint}: ${e.message}`);
    }
  }
  if (espnOk === 0) {
    console.warn('ESPN indisponível nos dois endpoints — mantendo o today.json anterior.');
    return;
  }
  const seen = new Set();
  const games = [];
  for (const g of raw) {
    const dk = `${g.tour}|${pairKey(g.aFull, g.bFull)}`;
    if (seen.has(dk)) continue;
    seen.add(dk);
    games.push(g);
  }
  console.log(`ESPN: ${games.length} jogos de simples hoje (${ymd}).`);

  // 2) odds de mercado (opcionais)
  const oddsByPair = await fetchOdds(models);

  // 3) casar cada jogo ao modelo do seu circuito e gerar a leitura
  const surfacesVistas = new Set();
  for (const g of games) {
    if (g.surface === 'hard') surfacesVistas.add(`(hard?) ${g.venue}`);
    const model = models[g.tour];
    const pa = matchPlayer(g.aFull, model.players);
    const pb = matchPlayer(g.bFull, model.players);
    if (!pa || !pb) {
      out.unmatched.push(`${g.aFull} / ${g.bFull} [${g.tour} ${g.tournament}]`);
      continue;
    }
    const r = analyzeMatch(pa, pb, g.surface, model);
    const odds = oddsByPair.get(`${g.tour}|${pairKey(pa.name, pb.name)}`) || {};
    out.matches.push({
      tour: g.tour,
      tournament: g.tournament,
      surface: g.surface,
      status: g.status,
      commence: g.commence,
      a: pa.name,
      b: pb.name,
      probA: r.probA,
      favorite: r.favorite,
      favoriteProb: r.favoriteProb,
      marginLabel: r.marginLabel,
      confidence: r.confidence.level,
      fairOddA: Math.round(r.fairOddA * 100) / 100,
      fairOddB: Math.round(r.fairOddB * 100) / 100,
      marketOddA: odds[pa.name] ?? null,
      marketOddB: odds[pb.name] ?? null,
    });
  }

  // 4) ordenar (ao vivo primeiro) e gravar
  out.matches.sort(
    (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || (a.commence || '').localeCompare(b.commence || '')
  );
  out.count = out.matches.length;

  await writeFile(new URL('../web/today.json', import.meta.url), JSON.stringify(out));
  console.log(`today.json: ${out.count} jogos casados, ${out.unmatched.length} não-casados.`);
  if (out.unmatched.length) console.log('não-casados:', out.unmatched.slice(0, 15).join(' | '));
  if (surfacesVistas.size) console.log(`venues assumidos como quadra dura (confira o mapa): ${[...surfacesVistas].slice(0, 12).join(' · ')}`);
}

buildToday();
