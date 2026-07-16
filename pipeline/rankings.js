// Trajetória de ranking: parse dos CSVs do Sackmann, snapshots, pico e spike.
// Funções puras. O IO fica em rankings-ingest.js.
//
// NÃO use o parseCsv de ingest.js aqui: o arquivo dos anos 2020 tem 516 mil linhas
// e viraria 516 mil objetos. Estes CSVs são 4-5 colunas, sem aspas — split(',') basta.

/** Uma linha do CSV de ranking -> {date, rank, id, points}.
 *  ATP: ranking_date,rank,player,points | WTA: +coluna `tours` no fim (ignorada). */
export function parseRankingRows(text) {
  const rows = [];
  const lines = (text || '').split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) { // i=1: pula o cabeçalho
    const line = lines[i];
    if (!line) continue;
    const c = line.split(',');
    const date = Number(c[0]);
    const rank = Number(c[1]);
    const id = c[2];
    const points = Number(c[3]);
    if (!date || !rank || !id) continue;
    rows.push({ date, rank, id, points: Number.isFinite(points) ? points : 0 });
  }
  return rows;
}

/** AAAAMMDD -> Date. */
const toDate = (int) => new Date(Math.floor(int / 10000), (Math.floor(int / 100) % 100) - 1, int % 100);
/** Date -> AAAAMMDD. */
const toInt = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

/** Data do snapshot mais recente (ou null). */
export function latestDate(rows) {
  let max = 0;
  for (const r of rows) if (r.date > max) max = r.date;
  return max || null;
}

/** Mesma data, um ano antes. */
export function minus12Months(dateInt) {
  const d = toDate(dateInt);
  d.setFullYear(d.getFullYear() - 1);
  return toInt(d);
}

/** A data disponível mais próxima do alvo (qualquer direção). */
export function nearestDate(dates, target) {
  let best = null;
  let bestDist = Infinity;
  const t = toDate(target);
  for (const d of dates) {
    const dist = Math.abs(toDate(d) - t);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return best;
}

/** Idade em anos (1 decimal) na data `whenInt`, a partir do dob AAAAMMDD.
 *  Rejeita o lixo do CSV: dob vazio, `19000000`, e qualquer idade fora de (0, 120). */
export function ageFrom(dobInt, whenInt) {
  if (!dobInt || !whenInt) return null;
  const dob = toDate(dobInt);
  const when = toDate(whenInt);
  if (Number.isNaN(dob.getTime()) || Number.isNaN(when.getTime())) return null;
  const anos = (when - dob) / (365.2425 * 86400000);
  if (!(anos > 0 && anos < 120)) return null;
  return Math.round(anos * 10) / 10;
}
