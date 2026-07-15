import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surfaceForVenue, parseScoreboard } from '../pipeline/espn.js';

test('surfaceForVenue: cidade de saibro conhecida → clay', () => {
  assert.equal(surfaceForVenue('Båstad, Sweden'), 'clay');
  assert.equal(surfaceForVenue('Umag, Croatia'), 'clay');
  assert.equal(surfaceForVenue('Hamburg, Germany'), 'clay');
});

test('surfaceForVenue: cidade de grama conhecida → grass', () => {
  assert.equal(surfaceForVenue('Halle, Germany'), 'grass');
  assert.equal(surfaceForVenue('Newport, United States'), 'grass');
});

test('surfaceForVenue: cidade desconhecida → hard (default)', () => {
  assert.equal(surfaceForVenue('Tokyo, Japan'), 'hard');
});

test('surfaceForVenue: Stuttgart depende do circuito (ATP grama, WTA saibro)', () => {
  assert.equal(surfaceForVenue('Stuttgart, Germany', 'ATP'), 'grass');
  assert.equal(surfaceForVenue('Stuttgart, Germany', 'WTA'), 'clay');
});

const FIXTURE = {
  events: [
    {
      name: 'Nordea Open',
      venue: { displayName: 'Båstad, Sweden' },
      groupings: [
        {
          grouping: { displayName: "Men's Singles" },
          competitions: [
            {
              date: '2026-07-15T11:00Z',
              status: { type: { name: 'STATUS_SCHEDULED' } },
              competitors: [{ athlete: { displayName: 'Grigor Dimitrov' } }, { athlete: { displayName: 'Nuno Borges' } }],
            },
            {
              date: '2026-07-15T09:00Z',
              status: { type: { name: 'STATUS_IN_PROGRESS' } },
              competitors: [{ athlete: { displayName: 'Mariano Navone' } }, { athlete: { displayName: 'Stefano Travaglia' } }],
            },
            {
              date: '2026-07-15T13:00Z',
              status: { type: { name: 'STATUS_FINAL' } },
              competitors: [{ athlete: { displayName: 'Winner One' } }, { athlete: { displayName: 'Loser Two' } }],
            },
            {
              date: '2026-07-06T09:05Z',
              status: { type: { name: 'STATUS_SCHEDULED' } },
              competitors: [{ athlete: { displayName: 'Old Day' } }, { athlete: { displayName: 'Past Match' } }],
            },
          ],
        },
        {
          grouping: { displayName: "Men's Doubles" },
          competitions: [
            {
              date: '2026-07-15T11:00Z',
              status: { type: { name: 'STATUS_SCHEDULED' } },
              competitors: [
                { athlete: { displayName: 'D1' } }, { athlete: { displayName: 'D2' } },
                { athlete: { displayName: 'D3' } }, { athlete: { displayName: 'D4' } },
              ],
            },
          ],
        },
      ],
    },
  ],
};

test('parseScoreboard: só simples do dia e não-encerrados (exclui duplas, outro dia, finalizados)', () => {
  const games = parseScoreboard(FIXTURE, 'ATP', '2026-07-15');
  assert.equal(games.length, 2);
  const pares = games.map((g) => `${g.aFull} vs ${g.bFull}`);
  assert.deepEqual(pares, ['Grigor Dimitrov vs Nuno Borges', 'Mariano Navone vs Stefano Travaglia']);
});

test('parseScoreboard: normaliza status e preenche superfície/torneio/tour/horário', () => {
  const [g] = parseScoreboard(FIXTURE, 'ATP', '2026-07-15');
  assert.equal(g.status, 'SCHEDULED');
  assert.equal(g.surface, 'clay');
  assert.equal(g.tour, 'ATP');
  assert.equal(g.tournament, 'Nordea Open');
  assert.equal(g.commence, '2026-07-15T11:00Z');
});

test('parseScoreboard: marca jogos ao vivo com status IN_PROGRESS', () => {
  const games = parseScoreboard(FIXTURE, 'ATP', '2026-07-15');
  assert.equal(games[1].status, 'IN_PROGRESS');
});

const MIXED = {
  events: [
    {
      name: 'Combined Open',
      venue: { displayName: 'Melbourne, Australia' },
      groupings: [
        {
          grouping: { displayName: "Women's Singles" },
          competitions: [
            {
              date: '2026-07-15T02:00Z',
              status: { type: { name: 'STATUS_SCHEDULED' } },
              competitors: [{ athlete: { displayName: 'Iga Swiatek' } }, { athlete: { displayName: 'Coco Gauff' } }],
            },
          ],
        },
      ],
    },
  ],
};

test('parseScoreboard: deriva o circuito do gênero do grouping (endpoint ATP, jogo feminino → WTA)', () => {
  const [g] = parseScoreboard(MIXED, 'ATP', '2026-07-15');
  assert.equal(g.tour, 'WTA');
});
