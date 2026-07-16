import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRankingRows } from '../pipeline/rankings.js';

// ATP: ranking_date,rank,player,points
const CSV_ATP = [
  'ranking_date,rank,player,points',
  '20260608,1,207989,12050',
  '20260608,2,206173,11500',
  '20250609,1,206173,11000',
].join('\n');

// WTA: ranking_date,rank,player,points,tours  <- coluna EXTRA no fim
const CSV_WTA = [
  'ranking_date,rank,player,points,tours',
  '20260608,1,214544,10490,0',
  '20260608,2,216347,8178,0',
].join('\n');

test('parseRankingRows: lê o formato da ATP (4 colunas)', () => {
  const rows = parseRankingRows(CSV_ATP);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { date: 20260608, rank: 1, id: '207989', points: 12050 });
});

test('parseRankingRows: lê o formato da WTA (5 colunas, tours extra)', () => {
  const rows = parseRankingRows(CSV_WTA);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { date: 20260608, rank: 1, id: '214544', points: 10490 });
});

test('parseRankingRows: ignora cabeçalho, linhas vazias e lixo', () => {
  const rows = parseRankingRows(['ranking_date,rank,player,points', '', '20260608,1,207989,12050', ',,,', '20260608,,999,50'].join('\n'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, '207989');
});

test('parseRankingRows: pontos ausentes viram 0, não NaN', () => {
  const rows = parseRankingRows(['ranking_date,rank,player,points', '20260608,500,123456,'].join('\n'));
  assert.equal(rows[0].points, 0);
});

test('parseRankingRows: texto vazio, nulo ou ausente devolve lista vazia', () => {
  assert.deepEqual(parseRankingRows(''), []);
  assert.deepEqual(parseRankingRows(null), []);
  assert.deepEqual(parseRankingRows(undefined), []);
  assert.deepEqual(parseRankingRows('ranking_date,rank,player,points'), []);
});

import { latestDate, minus12Months, nearestDate, ageFrom } from '../pipeline/rankings.js';

test('latestDate: acha o snapshot mais recente', () => {
  assert.equal(latestDate(parseRankingRows(CSV_ATP)), 20260608);
  assert.equal(latestDate([]), null);
});

test('minus12Months: volta um ano no calendário', () => {
  assert.equal(minus12Months(20260608), 20250608);
  assert.equal(minus12Months(20260101), 20250101);
});

test('nearestDate: pega a data disponível mais próxima do alvo', () => {
  const dates = [20250602, 20250609, 20250616];
  assert.equal(nearestDate(dates, 20250608), 20250609); // 1 dia de distância
  assert.equal(nearestDate([], 20250608), null);
});

test('ageFrom: idade na data pedida, não hoje', () => {
  // Djokovic: dob 22/05/1987. Em 08/06/2026 tem 39,0.
  assert.equal(ageFrom(19870522, 20260608), 39);
});

test('ageFrom: rejeita o lixo do CSV (dob vazio, 19000000)', () => {
  assert.equal(ageFrom(0, 20260608), null);
  assert.equal(ageFrom(null, 20260608), null);
  assert.equal(ageFrom(19000000, 20260608), null); // daria 126 anos
  assert.equal(ageFrom(19870522, null), null);
});

test('ageFrom: rejeita dob com mes ou dia zerados (19450000 daria 81 anos plausiveis)', () => {
  assert.equal(ageFrom(19450000, 20260608), null);
  assert.equal(ageFrom(19871300, 20260608), null); // mes 13
  assert.equal(ageFrom(19870532, 20260608), null); // dia 32
});

test('minus12Months: data nula devolve null', () => {
  assert.equal(minus12Months(null), null);
  assert.equal(minus12Months(0), null);
});

test('nearestDate: alvo nulo devolve null', () => {
  assert.equal(nearestDate([20250602, 20250609], null), null);
});

test('nearestDate: no empate fica com a data mais recente', () => {
  // buraco de 14 dias: o alvo cai exatamente no meio, a 7 dias das duas
  assert.equal(nearestDate([20250602, 20250616], 20250609), 20250616);
});

test('minus12Months: 29/fev de ano bissexto cai em 1/mar (o nearestDate absorve)', () => {
  assert.equal(minus12Months(20240229), 20230301);
});

import { spikeOf, buildTrajectories } from '../pipeline/rankings.js';

test('spikeOf: acha a maior fatia do ganho vinda de uma semana só', () => {
  // ganho total 100 -> 1.670; a semana de 08/06 sozinha deu 1.200 (76%)
  const serie = [
    { date: 20250609, points: 100 },
    { date: 20260601, points: 470 },
    { date: 20260608, points: 1670 },
  ];
  const s = spikeOf(serie, 20250609, 20260608);
  assert.equal(s.pct, 76);
  assert.equal(s.date, 20260608);
});

test('spikeOf: sem ganho no período devolve null', () => {
  const serie = [{ date: 20250609, points: 500 }, { date: 20260608, points: 300 }];
  assert.equal(spikeOf(serie, 20250609, 20260608), null);
});

test('spikeOf: nunca passa de 100% (semana grande + queda depois nao vira "240%")', () => {
  // ganha 1.200 numa semana, depois perde defendendo; ganho liquido do periodo: 500
  const serie = [
    { date: 20250609, points: 500 },
    { date: 20260601, points: 1700 },
    { date: 20260608, points: 1000 },
  ];
  const s = spikeOf(serie, 20250609, 20260608);
  assert.equal(s.pct, 100);
});

test('buildTrajectories: monta hoje, 12m, pico e a data do snapshot', () => {
  const csv = [
    'ranking_date,rank,player,points',
    '20240610,50,111,800',   // pico do 111: #50
    '20250609,47,111,900',
    '20260608,12,111,2000',
    '20250609,3,222,6000',
    '20260608,4,222,5800',   // pico do 222: #3
  ].join('\n');
  const t = buildTrajectories(parseRankingRows(csv));
  const a = t.get('111');
  assert.equal(a.rank, 12);
  assert.equal(a.points, 2000);
  assert.equal(a.rank12m, 47);
  assert.equal(a.points12m, 900);
  assert.equal(a.peak, 12);          // o melhor de sempre é o de hoje
  assert.equal(a.peakDate, 20260608);
  assert.equal(a.snapshotDate, 20260608);
  assert.equal(a.date12m, 20250609);
  const b = t.get('222');
  assert.equal(b.peak, 3);
  assert.equal(b.peakDate, 20250609);
});

test('buildTrajectories: quem não tem snapshot de 12m fica com rank12m null (não com 2000)', () => {
  // caso Venus Williams: está no ranking hoje, não estava há 12 meses
  const csv = ['ranking_date,rank,player,points', '20250609,3,222,6000', '20260608,465,999,123'].join('\n');
  const t = buildTrajectories(parseRankingRows(csv));
  const v = t.get('999');
  assert.equal(v.rank, 465);
  assert.equal(v.rank12m, null);
  assert.equal(v.points12m, null);
});

test('buildTrajectories: quem não está no snapshot de hoje fica fora', () => {
  const csv = ['ranking_date,rank,player,points', '20250609,3,222,6000', '20260608,1,111,9000'].join('\n');
  const t = buildTrajectories(parseRankingRows(csv));
  assert.equal(t.has('222'), false); // sumiu do ranking
  assert.equal(t.has('111'), true);
});

test('buildTrajectories: o pico vem da serie inteira, nao so de hoje e 12 meses atras', () => {
  const csv = [
    'ranking_date,rank,player,points',
    '20230612,5,777,5000',   // <- o pico de verdade: #5, nem hoje nem 12m atras
    '20250609,40,777,1200',
    '20260608,25,777,1800',
  ].join('\n');
  const t = buildTrajectories(parseRankingRows(csv));
  const p = t.get('777');
  assert.equal(p.peak, 5);
  assert.equal(p.peakDate, 20230612);
  assert.equal(p.rank, 25);
  assert.equal(p.rank12m, 40);
});

test('buildTrajectories: entrada vazia, nula ou ausente devolve mapa vazio', () => {
  assert.equal(buildTrajectories([]).size, 0);
  assert.equal(buildTrajectories(null).size, 0);
  assert.equal(buildTrajectories(undefined).size, 0);
});

test('buildTrajectories: spikePct e spikeDate chegam preenchidos para subida concentrada', () => {
  // mesmo caso do teste anterior: de 12m atras (1200) a hoje (1800), tudo numa unica semana
  const csv = [
    'ranking_date,rank,player,points',
    '20230612,5,777,5000',
    '20250609,40,777,1200',
    '20260608,25,777,1800',
  ].join('\n');
  const t = buildTrajectories(parseRankingRows(csv));
  const p = t.get('777');
  assert.equal(p.spikePct, 100);
  assert.equal(p.spikeDate, 20260608);
});
