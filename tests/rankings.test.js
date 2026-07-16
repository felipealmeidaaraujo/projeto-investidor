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
