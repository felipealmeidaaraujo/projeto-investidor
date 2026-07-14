// Ingestão de partidas de tênis (ATP) do espelho TML-Database (formato Sackmann), CSV.
// Sem dependências: usa fetch nativo do Node.
const BASE = 'https://raw.githubusercontent.com/Tennismylife/TML-Database/master';

// Ordem cronológica aproximada das rodadas dentro de um torneio.
const ROUND_ORDER = {
  Q1: 0, Q2: 0, Q3: 0, RR: 1, R128: 1, R64: 2, R32: 3, R16: 4, QF: 5, BR: 6, SF: 6, F: 7,
};

/** Parser de uma linha CSV (respeita campos entre aspas). */
export function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Texto CSV → array de objetos (chaveado pelo cabeçalho). */
export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const row = {};
    header.forEach((h, j) => (row[h] = cells[j]));
    rows.push(row);
  }
  return rows;
}

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

/** Normaliza uma linha Sackmann para o registro de partida do projeto. */
export function toMatch(row) {
  return {
    dateInt: toInt(row.tourney_date), // YYYYMMDD
    matchNum: toInt(row.match_num) ?? 0,
    roundOrder: ROUND_ORDER[row.round] ?? 3,
    surface: (row.surface || '').toLowerCase() || null, // hard/clay/grass/carpet
    indoor: row.indoor === 'I',
    tourney: row.tourney_name,
    round: row.round,
    bestOf: toInt(row.best_of) ?? 3,
    winner: row.winner_name || null,
    loser: row.loser_name || null,
    winnerRank: toInt(row.winner_rank),
    loserRank: toInt(row.loser_rank),
  };
}

/** Ordena as partidas cronologicamente (data → rodada → nº do jogo). */
export function sortMatches(matches) {
  return matches.sort(
    (a, b) => a.dateInt - b.dateInt || a.roundOrder - b.roundOrder || a.matchNum - b.matchNum
  );
}

/** Baixa e normaliza um ano de partidas. */
export async function fetchYear(year) {
  const res = await fetch(`${BASE}/${year}.csv`);
  if (!res.ok) throw new Error(`Falha ao baixar ${year}: HTTP ${res.status}`);
  const text = await res.text();
  return parseCsv(text).map(toMatch).filter((m) => m.winner && m.loser);
}

/** Carrega um intervalo de anos, já ordenado. */
export async function loadYears(from, to) {
  const years = [];
  for (let y = from; y <= to; y++) years.push(y);
  const chunks = await Promise.all(years.map(fetchYear));
  return sortMatches(chunks.flat());
}
