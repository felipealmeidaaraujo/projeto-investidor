import { test } from 'node:test';
import assert from 'node:assert/strict';
import { challengerMatches } from '../pipeline/ingest-sackmann.js';

const csv = [
  'tourney_level,surface,tourney_date,match_num,round,winner_name,loser_name',
  'C,Hard,20250106,300,F,Titouan Droguet,Jan Choinski',      // challenger → entra
  'A,Hard,20241230,300,F,Yoshihito Nishioka,Benjamin Bonzi',  // quali de tour → fora
  'C,Clay,20250310,299,SF,,Foo Bar',                          // sem winner → descarta
  'C,,20250310,299,SF,A B,C D',                               // sem surface → descarta
  'C,Hard,20250106,299,SF,Foo Bar,',                          // sem loser → descarta
  'C,Hard,,299,SF,A B,C D',                                   // sem tourney_date → descarta
].join('\n');

test('challengerMatches: só level C, formato normalizado, descarta incompletas', () => {
  const m = challengerMatches(csv);
  assert.equal(m.length, 1);
  assert.deepEqual(m[0], {
    dateInt: 20250106, ord: 7, num: 300, surface: 'hard',
    winnerFull: 'Titouan Droguet', loserFull: 'Jan Choinski',
  });
});

test('challengerMatches: sem match_num no arquivo, num vira 0 (não NaN, que quebraria o sort)', () => {
  const semNum = [
    'tourney_level,surface,tourney_date,round,winner_name,loser_name',
    'C,Hard,20250106,F,Titouan Droguet,Jan Choinski',
  ].join('\n');
  assert.equal(challengerMatches(semNum)[0].num, 0);
});

import { byChronology } from '../pipeline/ingest-sackmann.js';

// A ordem cronológica dentro de um torneio NÃO pode vir da ordem das linhas do arquivo:
// o Sackmann passou a listar a final primeiro (ATP a partir de 2024, WTA de 2022).
// Medido nos CSVs de 2013-2026: 587.022 pares de partidas fora de ordem.
// E também não pode vir só do match_num: em 89 dos 2.446 torneios (3,6%) ele contradiz a
// rodada — o pior caso real é a FINAL com número MENOR que a semifinal (2017-7699,
// 2019-6490). Ordenar só por match_num deixaria 41.666 pares errados.
// Com (data → rodada → match_num) sobram ZERO. A rodada é a verdade; o match_num só
// desempata dentro dela.
test('byChronology: dentro do torneio, ordena pelo avanço das rodadas', () => {
  const arquivoInvertido = [
    { dateInt: 20240101, ord: 7, num: 300 }, // F   <- o arquivo lista a final PRIMEIRO
    { dateInt: 20240101, ord: 6, num: 299 }, // SF
    { dateInt: 20240101, ord: 5, num: 294 }, // QF
    { dateInt: 20240101, ord: 0, num: 237 }, // Q1
  ];
  assert.deepEqual([...arquivoInvertido].sort(byChronology).map((m) => m.ord), [0, 5, 6, 7]);
});

test('byChronology: a rodada manda sobre o match_num (a final numerada ANTES da semi)', () => {
  // Caso real — atp_chall_2017, torneio 2017-7699: SF 299-300 mas F 270.
  // Só por match_num, a final seria processada antes da semifinal que a gerou.
  const m = [
    { dateInt: 20170501, ord: 7, num: 270 }, // F  (num MENOR)
    { dateInt: 20170501, ord: 6, num: 299 }, // SF (num MAIOR)
  ];
  assert.deepEqual([...m].sort(byChronology).map((x) => x.ord), [6, 7]); // SF antes da F
});

test('byChronology: o match_num desempata dentro da MESMA rodada', () => {
  const m = [
    { dateInt: 20240101, ord: 3, num: 285 },
    { dateInt: 20240101, ord: 3, num: 270 },
  ];
  assert.deepEqual([...m].sort(byChronology).map((x) => x.num), [270, 285]);
});

test('byChronology: a data manda sobre tudo (torneios diferentes)', () => {
  const m = [
    { dateInt: 20240108, ord: 0, num: 237 }, // 1ª rodada da semana seguinte
    { dateInt: 20240101, ord: 7, num: 300 }, // final da semana anterior
  ];
  assert.deepEqual([...m].sort(byChronology).map((x) => x.dateInt), [20240101, 20240108]);
});

test('byChronology: sem ord/num (partidas de tour, que já têm data por partida) não vira NaN', () => {
  const m = [{ dateInt: 20240102 }, { dateInt: 20240101 }];
  assert.deepEqual([...m].sort(byChronology).map((x) => x.dateInt), [20240101, 20240102]);
});

test('challengerMatches: traduz o round para a ordem cronológica (ord)', () => {
  const csv = [
    'tourney_level,surface,tourney_date,match_num,round,winner_name,loser_name',
    'C,Hard,20250106,300,F,A B,C D',
    'C,Hard,20250106,237,Q1,E F,G H',
  ].join('\n');
  const m = challengerMatches(csv);
  assert.equal(m.find((x) => x.num === 300).ord, 7); // F
  assert.equal(m.find((x) => x.num === 237).ord, 0); // Q1
});

test('challengerMatches: round desconhecido cai no meio do torneio, não no começo nem no fim', () => {
  // 3 = R32. Um round novo não pode virar 0 (antes do quali) nem 7 (depois da final).
  const csv = [
    'tourney_level,surface,tourney_date,match_num,round,winner_name,loser_name',
    'C,Hard,20250106,280,R48,A B,C D',
  ].join('\n');
  assert.equal(challengerMatches(csv)[0].ord, 3);
});
