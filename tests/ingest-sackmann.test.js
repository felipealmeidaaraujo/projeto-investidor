import { test } from 'node:test';
import assert from 'node:assert/strict';
import { challengerMatches } from '../pipeline/ingest-sackmann.js';

const csv = [
  'tourney_level,surface,tourney_date,winner_name,loser_name',
  'C,Hard,20250106,Titouan Droguet,Jan Choinski',      // challenger → entra
  'A,Hard,20241230,Yoshihito Nishioka,Benjamin Bonzi',  // quali de tour → fora
  'C,Clay,20250310,,Foo Bar',                           // sem winner → descarta
  'C,,20250310,A B,C D',                                // sem surface → descarta
  'C,Hard,20250106,Foo Bar,',                           // sem loser → descarta
  'C,Hard,,A B,C D',                                    // sem tourney_date → descarta
].join('\n');

test('challengerMatches: só level C, formato normalizado, descarta incompletas', () => {
  const m = challengerMatches(csv);
  assert.equal(m.length, 1);
  assert.deepEqual(m[0], {
    dateInt: 20250106, surface: 'hard', winnerFull: 'Titouan Droguet', loserFull: 'Jan Choinski',
  });
});
