// Parser do feed proprietário do Flashscore (grade de tênis do dia) + fetch.
// Cobre ATP + WTA + Challenger e traz a superfície. Puro testado em tests/flashscore.test.js.

const SURFACE = { clay: 'clay', hard: 'hard', grass: 'grass', carpet: 'hard' };

/** "CHALLENGER MEN - SINGLES: Bunschoten (Netherlands), clay"
 *  -> { tour, singles, surface, tournament }. */
export function parseTournamentHeader(za) {
  const colon = za.indexOf(':');
  const cat = colon >= 0 ? za.slice(0, colon) : za;
  const rest = colon >= 0 ? za.slice(colon + 1).trim() : '';
  const singles = /singles/i.test(cat);
  const tour = /women|wta|girls|ladies/i.test(cat) ? 'WTA' : 'ATP';
  let surface = 'hard';
  let tournament = rest;
  const comma = rest.lastIndexOf(',');
  if (comma >= 0) {
    const word = rest.slice(comma + 1).trim().toLowerCase();
    if (SURFACE[word]) {
      surface = SURFACE[word];
      tournament = rest.slice(0, comma).trim();
    }
  }
  return { tour, singles, surface, tournament };
}

/** Código de status do Flashscore -> rótulo. */
export function statusFromCode(ab) {
  if (ab === '1') return 'SCHEDULED';
  if (ab === '2') return 'IN_PROGRESS';
  if (ab === '3') return 'FINISHED';
  return 'OTHER';
}

const ACTIVE = new Set(['SCHEDULED', 'IN_PROGRESS']);

/** Feed cru do Flashscore -> jogos de simples não-encerrados. */
export function parseFeed(text) {
  const out = [];
  let th = null;   // cabeçalho de torneio atual
  let cur = null;  // jogo atual
  const flush = () => {
    if (cur && th && th.singles && ACTIVE.has(cur.status) && cur.a && cur.b) {
      out.push({
        tour: th.tour, tournament: th.tournament, surface: th.surface,
        status: cur.status, commence: cur.commence, a: cur.a, b: cur.b,
      });
    }
  };
  for (const reg of text.split('¬')) {
    const i = reg.indexOf('÷');
    if (i < 0) continue;
    const key = reg.slice(0, i).replace(/^~/, '');
    const val = reg.slice(i + 1);
    if (key === 'ZA') { flush(); cur = null; th = parseTournamentHeader(val); }
    else if (key === 'AA') { flush(); cur = { status: null, commence: null, a: null, b: null }; }
    else if (cur) {
      if (key === 'AB' && cur.status == null) cur.status = statusFromCode(val);
      else if (key === 'AD' && cur.commence == null) cur.commence = new Date(Number(val) * 1000).toISOString();
      else if (key === 'AE' && cur.a == null) cur.a = val;
      else if (key === 'AF' && cur.b == null) cur.b = val;
    }
  }
  flush();
  return out;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Baixa e parseia a grade de tênis do dia do Flashscore (IO). Lança se o feed vier vazio. */
export async function fetchGrid() {
  const r = await fetch('https://www.flashscore.com/x/feed/f_2_0_3_en_1', {
    headers: { 'x-fsign': 'SW9D1eZo', Referer: 'https://www.flashscore.com/', 'User-Agent': UA },
  });
  if (!r.ok) throw new Error(`Flashscore HTTP ${r.status}`);
  const text = await r.text();
  const jogos = parseFeed(text);
  if (!jogos.length) throw new Error('Flashscore: feed sem jogos (formato mudou?)');
  return jogos;
}
