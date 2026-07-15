import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normName, matchPlayer, matchesModelName, buildChallengerNames, findModelPlayer } from '../web/src/match-names.js';

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

test('matchesModelName: casa nome completo com formato do modelo', () => {
  assert.equal(matchesModelName('Carlos Alcaraz', 'Alcaraz C.'), true);
  assert.equal(matchesModelName('Jannik Sinner', 'Sinner J.'), true);
  assert.equal(matchesModelName('Carlos Alcaraz', 'Sinner J.'), false);
  assert.equal(matchesModelName('Félix Auger-Aliassime', 'Auger-Aliassime F.'), true); // acentos/hífen
});

test('matchPlayer: nome do meio (Juan Pablo Varillas) casa Varillas J.', () => {
  const pl = [...players, { name: 'Varillas J.' }];
  assert.equal(matchPlayer('Juan Pablo Varillas', pl)?.name, 'Varillas J.');
});

test('buildChallengerNames: transita inequívoco, mantém puro, separa homônimos de mesma inicial', () => {
  const tour = [{ name: 'Sinner J.' }, { name: 'Tsitsipas P.' }, { name: 'Tsitsipas S.' }];
  const full = ['Jannik Sinner', 'Fulano Puro', 'Stefanos Tsitsipas', 'Petros Tsitsipas', 'Pavlos Tsitsipas'];
  const m = buildChallengerNames(full, tour);
  assert.equal(m.get('Jannik Sinner'), 'Sinner J.');            // casa único → tour
  assert.equal(m.get('Fulano Puro'), 'Fulano Puro');            // não casa → puro
  assert.equal(m.get('Stefanos Tsitsipas'), 'Tsitsipas S.');    // casa único (inicial s) → tour
  assert.equal(m.get('Petros Tsitsipas'), 'Petros Tsitsipas');  // ambíguo com Pavlos → separa
  assert.equal(m.get('Pavlos Tsitsipas'), 'Pavlos Tsitsipas');  // ambíguo com Petros → separa
});

test('buildChallengerNames: homônimo obscuro (poucas partidas de tour) não bloqueia o real', () => {
  const tour = [{ name: 'Nava E.' }];
  const full = ['Emilio Nava', 'Eduardo Nava'];
  const counts = new Map([['Emilio Nava', 47], ['Eduardo Nava', 2]]); // Eduardo só 2 wildcards
  const m = buildChallengerNames(full, tour, counts);
  assert.equal(m.get('Emilio Nava'), 'Nava E.');       // dominante → canonicaliza (merge)
  assert.equal(m.get('Eduardo Nava'), 'Eduardo Nava'); // obscuro → cru (separado)
});

test('buildChallengerNames: homônimos de tour de volume parecido → ambos crus (não wrong-merge)', () => {
  const tour = [{ name: 'Martin A.' }];
  const full = ['Andrej Martin', 'Andres Martin'];
  const counts = new Map([['Andrej Martin', 40], ['Andres Martin', 22]]); // <3x → ambíguo
  const m = buildChallengerNames(full, tour, counts);
  assert.equal(m.get('Andrej Martin'), 'Andrej Martin');
  assert.equal(m.get('Andres Martin'), 'Andres Martin');
});

test('buildChallengerNames: irmãos só de Challenger (sem partidas de tour) ficam separados', () => {
  const tour = [{ name: 'Tsitsipas P.' }];
  const full = ['Petros Tsitsipas', 'Pavlos Tsitsipas'];
  const m = buildChallengerNames(full, tour, new Map()); // nenhum no tour
  assert.equal(m.get('Petros Tsitsipas'), 'Petros Tsitsipas');
  assert.equal(m.get('Pavlos Tsitsipas'), 'Pavlos Tsitsipas');
});

test('findModelPlayer: nome no formato do modelo (Flashscore)', () => {
  assert.equal(findModelPlayer('Sinner J.', players)?.name, 'Sinner J.');
});

test('findModelPlayer: nome completo (ESPN) cai no matchPlayer', () => {
  assert.equal(findModelPlayer('Carlos Alcaraz', players)?.name, 'Alcaraz C.');
});

test('findModelPlayer: desconhecido devolve null', () => {
  assert.equal(findModelPlayer('Fulano Z.', players), null);
});

test('findModelPlayer: nome do Flashscore com duas iniciais casa por sobrenome + 1a inicial', () => {
  const pl = [{ name: 'Burruchaga R.' }, { name: 'Cobolli F.' }];
  assert.equal(findModelPlayer('Burruchaga R. A.', pl)?.name, 'Burruchaga R.');
});
