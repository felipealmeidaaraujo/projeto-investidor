import { test } from 'node:test';
import assert from 'node:assert/strict';
import { challengerMatches } from '../pipeline/ingest-sackmann.js';

const csv = [
  'tourney_level,surface,tourney_date,match_num,winner_name,loser_name',
  'C,Hard,20250106,300,Titouan Droguet,Jan Choinski',      // challenger → entra
  'A,Hard,20241230,300,Yoshihito Nishioka,Benjamin Bonzi',  // quali de tour → fora
  'C,Clay,20250310,299,,Foo Bar',                           // sem winner → descarta
  'C,,20250310,299,A B,C D',                                // sem surface → descarta
  'C,Hard,20250106,299,Foo Bar,',                           // sem loser → descarta
  'C,Hard,,299,A B,C D',                                    // sem tourney_date → descarta
].join('\n');

test('challengerMatches: só level C, formato normalizado, descarta incompletas', () => {
  const m = challengerMatches(csv);
  assert.equal(m.length, 1);
  assert.deepEqual(m[0], {
    dateInt: 20250106, num: 300, surface: 'hard', winnerFull: 'Titouan Droguet', loserFull: 'Jan Choinski',
  });
});

test('challengerMatches: sem match_num no arquivo, num vira 0 (não NaN, que quebraria o sort)', () => {
  const semNum = [
    'tourney_level,surface,tourney_date,winner_name,loser_name',
    'C,Hard,20250106,Titouan Droguet,Jan Choinski',
  ].join('\n');
  assert.equal(challengerMatches(semNum)[0].num, 0);
});

import { byChronology } from '../pipeline/ingest-sackmann.js';

// A ordem cronológica dentro de um torneio NÃO pode ser herdada da ordem das linhas do
// arquivo: o Sackmann inverteu-a a partir de 2024 (ATP) e 2022 (WTA) e passou a listar a
// final primeiro. Medido: 100% dos 533 torneios ATP de 2024+ e ~99% dos WTA de 2022+.
// Sem esta ordenação, o Elo processava a final antes das rodadas que levaram a ela — o
// Elo do Challenger divergia até 34 pontos (ATP) e 73,5 (WTA, 42,9% das jogadoras >25).
test('byChronology: ordena pela data e, dentro do torneio, pelo avanço das rodadas', () => {
  // match_num do Sackmann cresce com o torneio: Q1 237-248 < R32 270-285 < QF 294-297 < SF 298-299 < F 300
  const arquivoInvertido = [
    { dateInt: 20240101, num: 300 }, // F     <- o arquivo lista a final PRIMEIRO
    { dateInt: 20240101, num: 299 }, // SF
    { dateInt: 20240101, num: 294 }, // QF
    { dateInt: 20240101, num: 237 }, // Q1
  ];
  const ordenado = [...arquivoInvertido].sort(byChronology);
  assert.deepEqual(ordenado.map((m) => m.num), [237, 294, 299, 300]);
});

test('byChronology: a data manda sobre o match_num (torneios diferentes)', () => {
  const m = [
    { dateInt: 20240108, num: 237 }, // torneio da semana seguinte, 1ª rodada
    { dateInt: 20240101, num: 300 }, // final da semana anterior
  ];
  assert.deepEqual([...m].sort(byChronology).map((x) => x.dateInt), [20240101, 20240108]);
});

test('byChronology: sem num (partidas de tour, que já têm data por partida) não vira NaN', () => {
  // O tennis-data traz a data de CADA partida, então não precisa de desempate — mas o
  // sort não pode virar indefinido por causa de um undefined.
  const m = [
    { dateInt: 20240102 },
    { dateInt: 20240101 },
  ];
  assert.deepEqual([...m].sort(byChronology).map((x) => x.dateInt), [20240101, 20240102]);
});
