import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normName, matchPlayer } from '../web/src/match-names.js';

const players = [
  { name: 'Sinner J.' },
  { name: 'Alcaraz C.' },
  { name: 'De Minaur A.' },
  { name: 'Auger-Aliassime F.' },
  { name: 'Djokovic N.' },
];

test('normName: minúsculas, sem acento, só letras', () => {
  assert.equal(normName('Auger-Aliassime'), 'augeraliassime');
  assert.equal(normName('Médvédev'), 'medvedev');
  assert.equal(normName('de Minaur'), 'deminaur');
});

test('matchPlayer: nome completo → jogador do modelo (Sobrenome I.)', () => {
  assert.equal(matchPlayer('Jannik Sinner', players)?.name, 'Sinner J.');
  assert.equal(matchPlayer('Carlos Alcaraz', players)?.name, 'Alcaraz C.');
});

test('matchPlayer: sobrenome com duas palavras (de Minaur)', () => {
  assert.equal(matchPlayer('Alex de Minaur', players)?.name, 'De Minaur A.');
});

test('matchPlayer: sobrenome com hífen (Auger-Aliassime)', () => {
  assert.equal(matchPlayer('Felix Auger-Aliassime', players)?.name, 'Auger-Aliassime F.');
});

test('matchPlayer: sem correspondência → null', () => {
  assert.equal(matchPlayer('Fulano Desconhecido', players), null);
});
