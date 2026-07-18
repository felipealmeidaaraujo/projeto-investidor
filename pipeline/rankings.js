// Trajetória de ranking: parse dos CSVs do Sackmann, snapshots, pico e spike.
// Funções puras. O IO fica em rankings-ingest.js.
//
// NÃO use o parseCsv de ingest.js aqui: o arquivo dos anos 2020 tem 516 mil linhas
// e viraria 516 mil objetos. Estes CSVs são 4-5 colunas, sem aspas — split(',') basta.
import { findModelPlayer, normName } from '../web/src/match-names.js';

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

/** Dias entre duas datas AAAAMMDD (valor absoluto). Usa o mesmo `toDate` do resto
 *  do arquivo, então o fuso se cancela. */
const daysBetween = (a, b) => Math.abs(toDate(a) - toDate(b)) / 86400000;

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

/** A maior fatia do ganho de pontos do período vinda de uma única semana.
 *  null se não houve ganho (quem caiu não tem "subida concentrada").
 *  `pct` é capado em 100 com `Math.min`: se uma única semana ganhar mais
 *  pontos que o ganho líquido do período inteiro (porque o resto do período
 *  foi negativo, defendendo pontos), a fração bruta passa de 100% e vira um
 *  número sem sentido pro usuário (ex: "240% da subida veio de uma semana
 *  só"). Capar em 100 mantém a frase verdadeira: "a subida veio toda de uma
 *  semana" — regra de UX "clareza zero dúvida" do projeto.
 *  PRÉ-CONDIÇÃO: `serie` deve vir ordenada por data crescente. Esta função
 *  NÃO ordena — quem chama (`buildTrajectories`) já ordena antes de invocar;
 *  ordenar aqui seria redundante e mascararia bug de quem chamar fora de ordem. */
export function spikeOf(serie, from, to) {
  const win = serie.filter((s) => s.date >= from && s.date <= to);
  if (win.length < 2) return null;
  const total = win[win.length - 1].points - win[0].points;
  if (total <= 0) return null;
  let maior = 0;
  let quando = null;
  for (let i = 1; i < win.length; i++) {
    const d = win[i].points - win[i - 1].points;
    if (d > maior) { maior = d; quando = win[i].date; }
  }
  if (!quando) return null;
  return { pct: Math.min(100, Math.round((100 * maior) / total)), date: quando, ganho: maior, total };
}

const MAX_STALE_DAYS = 120; // fora do snapshot global, quão velho pode ser o último ranking do jogador

/** Rows -> trajetória por player_id. Ancorada no snapshot global quando o jogador está
 *  nele (saída IDÊNTICA à âncora global de antes); senão no ranking mais recente DELE,
 *  desde que dentro do portão de recência — rotular dado velho como se fosse de hoje
 *  seria mentira. A mudança é aditiva: quem já tinha trajetória não muda. */
export function buildTrajectories(rows, { maxStaleDays = MAX_STALE_DAYS } = {}) {
  if (!rows) return new Map(); // guarda: null/undefined não estoura em latestDate
  const snapshotDate = latestDate(rows);
  if (!snapshotDate) return new Map();
  const dates = [...new Set(rows.map((r) => r.date))];

  const byId = new Map();
  for (const r of rows) {
    let s = byId.get(r.id);
    if (!s) { s = []; byId.set(r.id, s); }
    s.push(r);
  }

  const out = new Map();
  for (const [id, serie] of byId) {
    serie.sort((a, b) => a.date - b.date); // peak/spikeOf dependem da ordem; e precisamos do último
    // Âncora: o snapshot global se o jogador está nele; senão o ranking mais recente
    // DELE, se não estiver velho demais. Para quem está no snapshot, anchorDate ===
    // snapshotDate e o date12m é o mesmo global -> saída idêntica à versão anterior.
    let anchorRow = serie.find((s) => s.date === snapshotDate);
    if (!anchorRow) {
      const ultimo = serie[serie.length - 1];
      if (daysBetween(snapshotDate, ultimo.date) > maxStaleDays) continue;
      anchorRow = ultimo;
    }
    const anchorDate = anchorRow.date;
    const date12m = nearestDate(dates, minus12Months(anchorDate));
    const antes = serie.find((s) => s.date === date12m) || null;
    let peak = Infinity;
    let peakDate = null;
    for (const s of serie) if (s.rank < peak) { peak = s.rank; peakDate = s.date; }
    const spike = antes ? spikeOf(serie, date12m, anchorDate) : null;
    out.set(id, {
      rank: anchorRow.rank,
      points: anchorRow.points,
      rank12m: antes ? antes.rank : null,
      points12m: antes ? antes.points : null,
      peak: peak === Infinity ? null : peak,
      peakDate,
      // snapshotDate agora é a data da ÂNCORA do jogador (global para quem está no
      // snapshot; o próprio último ranking para os recuperados). O careerText já publica
      // isso como 'as of DD/MM/AAAA'.
      snapshotDate: anchorDate,
      date12m,
      spikePct: spike ? spike.pct : null,
      spikeDate: spike ? spike.date : null,
      spikeGanho: spike ? spike.ganho : null,
      spikeTotal: spike ? spike.total : null,
    });
  }
  return out;
}

const MAX_AGE_GAP_YEARS = 2; // anos de tolerância entre o dob do Sackmann e o bio.age do modelo

/** player_id -> jogador do modelo.
 *  1. bio.id quando existir (é o player_id do Sackmann — bate em 98,8% ATP / 97,7% WTA)
 *  2. cai para o nome via findModelPlayer
 *  3. guarda-corpo: idade calculada do dob NA DATA DO ÚLTIMO JOGO vs bio.age
 *  4. colisão (2+ ids no mesmo jogador) -> exclui os dois. Ambíguo não se chuta.
 *  `meta`: Map<player_id, {fullName, dob}>. */
export function resolvePlayers(ids, players, meta) {
  if (!ids || !players || !meta) return { resolved: new Map(), excluded: [] }; // guarda: nulo não estoura

  const byBioId = new Map();
  for (const p of players) if (p.bio && p.bio.id) byBioId.set(String(p.bio.id), p);

  const resolved = new Map();
  const hits = new Map(); // nome do modelo -> [ids que casaram nele]

  for (const id of ids) {
    const m = meta.get(id);
    if (!m) continue;
    const p = byBioId.get(String(id)) || findModelPlayer(m.fullName, players);
    if (!p) continue;
    // guarda-corpo de bio contaminado: p.fullName (do serve-stats) e p.bio.name (do
    // patterns-ingest) são duas fontes independentes do mesmo dado. Quando discordam, o
    // bio inteiro foi colado da pessoa errada (bug pré-existente do patterns-ingest) — e
    // isso vale para TODO o bio, inclusive bio.id (por isso o match acima pode ter
    // "confirmado" o impostor) e bio.age (por isso o guarda-corpo de idade logo abaixo
    // NÃO pega esse caso: a idade bate, só que com a idade do impostor). As duas fontes
    // de nome discordando são a única evidência disponível de que nada no bio é
    // confiável aqui. Não resolve, não registra em `hits`: cai em "sem trajetória", o
    // desfecho seguro que a regra de clareza do projeto exige.
    if (p.bio && p.bio.name && p.fullName && normName(p.bio.name) !== normName(p.fullName)) continue;
    // guarda-corpo de identidade: bio.age é congelada em p.lastDate, então compare LÁ.
    // `> 0` (não `!= null`): bio.age igual a 0 é dado faltante virado zero, não uma
    // idade real — com `!= null` ele entraria na conta e um gap de ~idade-0 sempre
    // estouraria MAX_AGE_GAP_YEARS, barrando até o jogador certo.
    if (p.bio && p.bio.age > 0 && m.dob && p.lastDate) {
      const idade = ageFrom(m.dob, p.lastDate);
      if (idade != null && Math.abs(idade - p.bio.age) > MAX_AGE_GAP_YEARS) continue;
    }
    // Registra em `hits` só DEPOIS do guarda-corpo, de propósito: o guarda-corpo
    // desambigua ANTES da detecção de colisão. Ser barrado por idade é evidência
    // de que aquele id NÃO é aquele jogador. Quem casa por bio.id normalmente passa
    // aqui (o dob e o bio.age vêm do mesmo jogador), mas nem sempre: há 2 casos ATP
    // e 9 WTA em que o próprio bio do modelo é de outra pessoa (matching fraco do
    // patterns-ingest, pré-existente). Nesses, recusar é o certo: melhor ficar sem
    // trajetória do que colar o ranking de um no Elo de outro. Então esse id não deve
    // sobrar como candidato "ambíguo" pra colisão abaixo.
    if (!hits.has(p.name)) hits.set(p.name, []);
    hits.get(p.name).push(id);
    resolved.set(id, p);
  }

  const excluded = [];
  for (const [name, idList] of hits) {
    if (idList.length > 1) {
      for (const id of idList) resolved.delete(id);
      excluded.push(name);
    }
  }
  return { resolved, excluded };
}
