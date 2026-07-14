// Busca os jogos de tênis do dia (The Odds API), casa com o modelo e gera web/today.json.
// Chave via process.env.ODDS_API_KEY (rode com: node --env-file=.env pipeline/fixtures.js).
// The Odds API só cobre torneios grandes e só enquanto ativos — dias sem torneio → lista vazia.
import { readFile, writeFile } from 'node:fs/promises';
import { matchPlayer } from '../web/src/match-names.js';
import { analyzeMatch } from '../web/src/analysis.js';

const KEY = process.env.ODDS_API_KEY;
const BASE = 'https://api.the-odds-api.com/v4';

// Superfície por torneio (o resto → dura).
const SURFACE = {
  tennis_atp_french_open: 'clay', tennis_atp_monte_carlo_masters: 'clay', tennis_atp_madrid_open: 'clay',
  tennis_atp_italian_open: 'clay', tennis_atp_barcelona_open: 'clay', tennis_atp_hamburg_open: 'clay', tennis_atp_munich: 'clay',
  tennis_atp_wimbledon: 'grass', tennis_atp_halle_open: 'grass', tennis_atp_queens_club_champ: 'grass',
  tennis_wta_french_open: 'clay', tennis_wta_madrid_open: 'clay', tennis_wta_italian_open: 'clay',
  tennis_wta_charleston_open: 'clay', tennis_wta_strasbourg: 'clay', tennis_wta_stuttgart_open: 'clay',
  tennis_wta_wimbledon: 'grass', tennis_wta_german_open: 'grass', tennis_wta_bad_homburg_open: 'grass', tennis_wta_queens_club_champ: 'grass',
};
const surfaceFor = (k) => SURFACE[k] || 'hard';
const tourFor = (k) => (k.startsWith('tennis_wta') ? 'WTA' : 'ATP');

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

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

export async function buildToday() {
  const out = { generatedAt: new Date().toISOString(), count: 0, matches: [], unmatched: [] };

  if (!KEY) {
    console.warn('Sem ODDS_API_KEY — gerando today.json vazio.');
    await writeFile(new URL('../web/today.json', import.meta.url), JSON.stringify(out));
    return;
  }

  const models = {
    ATP: JSON.parse(await readFile(new URL('../web/model-atp.json', import.meta.url))),
    WTA: JSON.parse(await readFile(new URL('../web/model-wta.json', import.meta.url))),
  };

  const sports = await fetchJson(`${BASE}/sports/?apiKey=${KEY}`);
  const keys = sports.filter((s) => /^tennis_/.test(s.key) && s.active).map((s) => s.key);
  console.log(`Torneios de tênis ativos: ${keys.length ? keys.join(', ') : '(nenhum)'}`);

  for (const key of keys) {
    const tour = tourFor(key);
    const surface = surfaceFor(key);
    const model = models[tour];
    let events;
    try {
      events = await fetchJson(`${BASE}/sports/${key}/odds/?regions=eu&markets=h2h&oddsFormat=decimal&apiKey=${KEY}`);
    } catch (e) {
      console.warn(`falha nas odds de ${key}: ${e.message}`);
      continue;
    }
    for (const ev of events) {
      const pa = matchPlayer(ev.home_team, model.players);
      const pb = matchPlayer(ev.away_team, model.players);
      if (!pa || !pb) {
        out.unmatched.push(`${ev.home_team} / ${ev.away_team} [${key}]`);
        continue;
      }
      const r = analyzeMatch(pa, pb, surface, model);
      const odds = avgH2H(ev);
      out.matches.push({
        tour,
        tournament: key.replace(/^tennis_(atp|wta)_/, '').replace(/_/g, ' '),
        surface,
        commence: ev.commence_time,
        a: pa.name,
        b: pb.name,
        probA: r.probA,
        favorite: r.favorite,
        favoriteProb: r.favoriteProb,
        marginLabel: r.marginLabel,
        confidence: r.confidence.level,
        fairOddA: Math.round(r.fairOddA * 100) / 100,
        fairOddB: Math.round(r.fairOddB * 100) / 100,
        marketOddA: odds.home,
        marketOddB: odds.away,
      });
    }
  }

  out.matches.sort((a, b) => (a.commence || '').localeCompare(b.commence || ''));
  out.count = out.matches.length;
  await writeFile(new URL('../web/today.json', import.meta.url), JSON.stringify(out));
  console.log(`today.json: ${out.count} jogos casados, ${out.unmatched.length} não-casados`);
  if (out.unmatched.length) console.log('não-casados:', out.unmatched.slice(0, 10).join(' | '));
}

buildToday();
