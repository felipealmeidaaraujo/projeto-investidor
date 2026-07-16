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

/** AAAAMMDD -> Date.
 *  Construído no fuso horário local de propósito: as duas pontas de cada
 *  subtração (minus12Months, nearestDate, ageFrom) usam essa mesma função,
 *  então o fuso se cancela e não afeta o resultado. */
const toDate = (int) => new Date(Math.floor(int / 10000), (Math.floor(int / 100) % 100) - 1, int % 100);
/** Date -> AAAAMMDD. */
const toInt = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

/** Data do snapshot mais recente (ou null). */
export function latestDate(rows) {
  let max = 0;
  for (const r of rows) if (r.date > max) max = r.date;
  return max || null;
}

/** Mesma data, um ano antes (ou null se `dateInt` for nulo/zero).
 *  Caso especial: 29/fev de ano bissexto não existe um ano antes/depois em
 *  anos não bissextos, então `setFullYear` rola para 1/mar (ex: 20240229 ->
 *  20230301). Não há resposta certa aqui; o `nearestDate` absorve esse 1 dia
 *  de desvio ao procurar o snapshot mais próximo. */
export function minus12Months(dateInt) {
  if (!dateInt) return null;
  const d = toDate(dateInt);
  d.setFullYear(d.getFullYear() - 1);
  return toInt(d);
}

/** A data disponível mais próxima do alvo (qualquer direção).
 *  Devolve null se `dates` estiver vazio ou `target` for nulo.
 *  Em caso de empate (mesma distância para duas datas), fica com a mais
 *  recente — mais perto do presente do jogador, que é o que interessa. */
export function nearestDate(dates, target) {
  if (!target) return null;
  let best = null;
  let bestDist = Infinity;
  const t = toDate(target);
  for (const d of dates) {
    const dist = Math.abs(toDate(d) - t);
    if (dist < bestDist || (dist === bestDist && d > best)) { bestDist = dist; best = d; }
  }
  return best;
}

/** Idade em anos (1 decimal) na data `whenInt`, a partir do dob AAAAMMDD.
 *  Rejeita o lixo do CSV: dob vazio, `19000000`, dob com mes/dia fora do
 *  intervalo válido (ex: `19450000`, mes 0 e dia 0), e qualquer idade fora
 *  de (0, 120). */
export function ageFrom(dobInt, whenInt) {
  if (!dobInt || !whenInt) return null;
  const dobMonth = Math.floor(dobInt / 100) % 100;
  const dobDay = dobInt % 100;
  if (dobMonth < 1 || dobMonth > 12 || dobDay < 1 || dobDay > 31) return null;
  const dob = toDate(dobInt);
  const when = toDate(whenInt);
  const years = (when - dob) / (365.2425 * 86400000); // 365.2425: dias do ano gregoriano médio
  if (!(years > 0 && years < 120)) return null;
  return Math.round(years * 10) / 10;
}
