// Grade de jogos do dia via ESPN (API pública não-oficial do site es+pn.com).
// Cobre ATP + WTA do tour principal (Slam/Masters/500/250); NÃO cobre Challenger/ITF, nem odds.
// A superfície não vem no feed — é inferida pela cidade (venue). Funções puras testadas em tests/espn.test.js.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Só estas contam como "jogo de hoje" pra trade pré-jogo/ao vivo (encerrados/W.O. saem).
const ACTIVE_STATUS = new Set(['SCHEDULED', 'IN_PROGRESS', 'SUSPENDED']);

/** Cidade do venue → chave normalizada (sem acento, só letras). "Båstad, Sweden" → "bastad". */
function cityKey(displayName) {
  return (displayName || '')
    .split(',')[0]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

// A superfície de cada torneio é fixa por edição; mapeamos as exceções (clay/grass) por cidade.
// O resto do circuito é quadra dura → default 'hard'. Cidades não-mapeadas são logadas no pipeline.
const CLAY = new Set([
  'bastad', 'gstaad', 'umag', 'hamburg', 'kitzbuhel', 'iasi', 'bucharest', 'palermo', 'munich',
  'madrid', 'rome', 'roma', 'barcelona', 'estoril', 'houston', 'marrakech', 'geneva', 'geneve',
  'lyon', 'santiago', 'buenosaires', 'riodejaneiro', 'cordoba', 'saopaulo', 'paris', 'bordeaux',
  'warsaw', 'warszawa', 'cluj', 'clujnapoca', 'prague', 'praha', 'bogota', 'charleston', 'rabat',
  'parma', 'belgrade', 'marbella', 'cagliari', 'oeiras', 'montecarlo', 'monaco', 'florianopolis',
]);
const GRASS = new Set([
  'wimbledon', 'london', 'halle', 'shertogenbosch', 'denbosch', 'eastbourne', 'mallorca', 'majorca',
  'newport', 'badhomburg', 'birmingham', 'nottingham', 'berlin', 'surbiton', 'ilkley',
]);
// Mesma cidade, superfície diferente por circuito/época.
const AMBIGUOUS = { stuttgart: { ATP: 'grass', WTA: 'clay' } };

/** Infere a superfície pela cidade do venue (default 'hard'); resolve casos por circuito. */
export function surfaceForVenue(displayName, tour = 'ATP') {
  const city = cityKey(displayName);
  if (AMBIGUOUS[city]) return AMBIGUOUS[city][tour] || 'hard';
  if (CLAY.has(city)) return 'clay';
  if (GRASS.has(city)) return 'grass';
  return 'hard';
}

/** Circuito a partir do rótulo do grouping — o endpoint /atp da ESPN também traz jogos femininos,
 *  então o gênero manda, não o endpoint. "Women's/Ladies" → WTA; senão ATP. */
function tourFromGrouping(label) {
  return /women|ladies/i.test(label) ? 'WTA' : 'ATP';
}

/** JSON do scoreboard da ESPN → jogos de SIMPLES do dia informado, não-encerrados.
 *  dayYMD no formato 'YYYY-MM-DD'. O param `tour` é só o fallback do endpoint. Puro (testável). */
export function parseScoreboard(json, tour, dayYMD) {
  const out = [];
  for (const ev of json.events || []) {
    for (const g of ev.groupings || []) {
      const label = g.grouping?.displayName || '';
      if (!/singles/i.test(label)) continue; // só simples (fora duplas)
      const gTour = tourFromGrouping(label);
      const surface = surfaceForVenue(ev.venue?.displayName, gTour);
      for (const c of g.competitions || []) {
        const cs = c.competitors || [];
        if (cs.length !== 2) continue;
        if (!(c.date || '').startsWith(dayYMD)) continue; // só os de hoje
        const status = (c.status?.type?.name || '').replace('STATUS_', '');
        if (!ACTIVE_STATUS.has(status)) continue;
        const aFull = cs[0]?.athlete?.displayName;
        const bFull = cs[1]?.athlete?.displayName;
        if (!aFull || !bFull) continue;
        out.push({ tour: gTour, tournament: ev.name, venue: ev.venue?.displayName || null, surface, status, commence: c.date, aFull, bFull });
      }
    }
  }
  return out;
}

/** Baixa a grade de um circuito num dia (IO). ymd no formato '20260715'. */
export async function fetchDayFixtures(tour, ymd) {
  const dayYMD = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  const url = `https://site.api.espn.com/apis/site/v2/sports/tennis/${tour.toLowerCase()}/scoreboard?dates=${ymd}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`ESPN ${tour} HTTP ${r.status}`);
  return parseScoreboard(await r.json(), tour, dayYMD);
}
