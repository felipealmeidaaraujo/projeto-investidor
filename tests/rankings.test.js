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
  // caso Venus Williams: está no ranking hoje, não estava há 12 meses.
  // date12m é a data de referência do DATASET (existe mesmo sem ela ter jogado
  // naquele dia) — só rank12m/points12m, que são DELA, ficam null.
  const csv = ['ranking_date,rank,player,points', '20250609,3,222,6000', '20260608,465,999,123'].join('\n');
  const t = buildTrajectories(parseRankingRows(csv));
  const v = t.get('999');
  assert.equal(v.rank, 465);
  assert.equal(v.rank12m, null);
  assert.equal(v.points12m, null);
  assert.equal(v.date12m, 20250609);
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

import { resolvePlayers } from '../pipeline/rankings.js';

const PLAYERS = [
  { name: 'Sinner J.', lastDate: 20260712, bio: { id: '206173', age: 24.7 } },
  { name: 'Nakashima B.', lastDate: 20260701, bio: { id: '206909', age: 24.8 } },
  { name: 'Tomas Barrios Vera', lastDate: 20260601, bio: null }, // challenger, nome cru, sem bio
];

test('resolvePlayers: casa por bio.id quando existe', () => {
  const meta = new Map([['206173', { fullName: 'Jannik Sinner', dob: 20010816 }]]);
  const { resolved } = resolvePlayers(['206173'], PLAYERS, meta);
  assert.equal(resolved.get('206173').name, 'Sinner J.');
});

test('resolvePlayers: cai para o nome quando não há bio.id', () => {
  const meta = new Map([['999001', { fullName: 'Tomas Barrios Vera', dob: 19950101 }]]);
  const { resolved } = resolvePlayers(['999001'], PLAYERS, meta);
  assert.equal(resolved.get('999001').name, 'Tomas Barrios Vera');
});

test('resolvePlayers: quando a idade desambigua, resolve o jogador certo (nao descarta o #32 do mundo)', () => {
  // Brandon Nakashima (#32, bio.id bate) e Bryce Nakashima (#1483) caem no mesmo 'Nakashima B.'.
  // O guarda-corpo de idade barra o Bryce -> isso PROVA que o slot e do Brandon.
  const meta = new Map([
    ['206909', { fullName: 'Brandon Nakashima', dob: 20010803 }],
    ['210416', { fullName: 'Bryce Nakashima', dob: 20040101 }],
  ]);
  const { resolved, excluded } = resolvePlayers(['206909', '210416'], PLAYERS, meta);
  assert.equal(resolved.get('206909').name, 'Nakashima B.');
  assert.equal(resolved.has('210416'), false);
  assert.deepEqual(excluded, []);
});

test('resolvePlayers: colisão genuína (os dois passam pela idade) exclui os dois — não sorteia', () => {
  // Dois ids no mesmo slot, ambos com idade compatível: não há como saber quem é. Exclui.
  const players = [{ name: 'Silva J.', lastDate: 20260601, bio: { id: null, age: 25 } }];
  const meta = new Map([
    ['900001', { fullName: 'Joao Silva', dob: 20010601 }],
    ['900002', { fullName: 'Jose Silva', dob: 20010601 }],
  ]);
  const { resolved, excluded } = resolvePlayers(['900001', '900002'], players, meta);
  assert.equal(resolved.has('900001'), false);
  assert.equal(resolved.has('900002'), false);
  assert.deepEqual(excluded, ['Silva J.']);
});

test('resolvePlayers: guarda-corpo do dob compara na data do ÚLTIMO JOGO, não hoje', () => {
  // Aposentado: bio.age 38.4 congelada em 2024; hoje teria 40. Não pode ser excluído.
  const players = [{ name: 'Nadal R.', lastDate: 20240721, bio: { id: null, age: 38.4 } }];
  const meta = new Map([['104745', { fullName: 'Rafael Nadal', dob: 19860603 }]]);
  const { resolved } = resolvePlayers(['104745'], players, meta);
  assert.equal(resolved.get('104745').name, 'Nadal R.');
});

test('resolvePlayers: idade incompatível é recusada (identidade errada)', () => {
  // 'Wang Xin.' recebendo o id de outra Wang: gap de idade grande -> recusa
  const players = [{ name: 'Wang Xin.', lastDate: 20260601, bio: { id: null, age: 22.2 } }];
  const meta = new Map([['888', { fullName: 'Xin Wang', dob: 19900101 }]]); // teria ~36
  const { resolved } = resolvePlayers(['888'], players, meta);
  assert.equal(resolved.has('888'), false);
});

test('resolvePlayers: bio de outra pessoa (fullName != bio.name) é recusado', () => {
  // Caso real: 'Wang Y.' tem fullName "Yafan Wang" mas o patterns-ingest colou nele o bio
  // da "Yuhan Wang". O bio inteiro é da pessoa errada — inclusive o bio.id e o bio.age,
  // então o guarda-corpo de idade CONFIRMARIA o impostor. As duas fontes de nome
  // discordando é a única prova disponível de que o bio está trocado.
  const players = [{ name: 'Wang Y.', fullName: 'Yafan Wang', lastDate: 20260601, bio: { id: '264205', name: 'Yuhan Wang', age: 19 } }];
  const meta = new Map([['264205', { fullName: 'Yuhan Wang', dob: 20070101 }]]);
  const { resolved } = resolvePlayers(['264205'], players, meta);
  assert.equal(resolved.size, 0);
});

test('resolvePlayers: bio integro (fullName == bio.name) passa normalmente', () => {
  const players = [{ name: 'Sinner J.', fullName: 'Jannik Sinner', lastDate: 20260712, bio: { id: '206173', name: 'Jannik Sinner', age: 24.7 } }];
  const meta = new Map([['206173', { fullName: 'Jannik Sinner', dob: 20010816 }]]);
  const { resolved } = resolvePlayers(['206173'], players, meta);
  assert.equal(resolved.get('206173').name, 'Sinner J.');
});

test('resolvePlayers: id sem meta é ignorado', () => {
  const { resolved } = resolvePlayers(['000'], PLAYERS, new Map());
  assert.equal(resolved.size, 0);
});

test('resolvePlayers: id com meta mas sem jogador correspondente no modelo é ignorado', () => {
  const meta = new Map([['777777', { fullName: 'Fulano Inexistente Dasilvasauro', dob: 19900101 }]]);
  const { resolved } = resolvePlayers(['777777'], PLAYERS, meta);
  assert.equal(resolved.size, 0);
});

test('resolvePlayers: ids, players ou meta nulos devolvem resultado vazio (não estoura)', () => {
  const meta = new Map([['206173', { fullName: 'Jannik Sinner', dob: 20010816 }]]);
  assert.deepEqual(resolvePlayers(null, PLAYERS, meta), { resolved: new Map(), excluded: [] });
  assert.deepEqual(resolvePlayers(['206173'], null, meta), { resolved: new Map(), excluded: [] });
  assert.deepEqual(resolvePlayers(['206173'], PLAYERS, null), { resolved: new Map(), excluded: [] });
});

test('buildTrajectories: fora do snapshot global mas recente (dentro do portão) é recuperado, ancorado no próprio ranking', () => {
  // 111 está no snapshot global (20260608). 222 saiu: último ranking 20260525 (14 dias antes).
  const csv = [
    'ranking_date,rank,player,points',
    '20250609,10,111,3000',
    '20260608,8,111,3200',   // snapshot global
    '20250526,300,222,120',  // ~12m antes do último ranking do 222
    '20260525,673,222,50',   // último do 222, 14 dias antes do snapshot -> dentro do portão
  ].join('\n');
  const t = buildTrajectories(parseRankingRows(csv));
  const v = t.get('222');
  assert.equal(v.rank, 673);
  assert.equal(v.snapshotDate, 20260525); // âncora = o próprio último ranking (o careerText mostra como 'as of')
  assert.equal(v.rank12m, 300);
  assert.equal(v.points12m, 120);
});

test('buildTrajectories: fora do snapshot e velho demais (além do portão) fica de fora', () => {
  // 222 último ranking 20250721, ~322 dias antes de 20260608: não entra (dado velho seria mentira).
  const csv = [
    'ranking_date,rank,player,points',
    '20260608,8,111,3200',
    '20250721,188,222,900',
  ].join('\n');
  const t = buildTrajectories(parseRankingRows(csv));
  assert.equal(t.has('222'), false);
  assert.equal(t.has('111'), true);
});

test('buildTrajectories: o portão de recência é uma fronteira exata', () => {
  // 20260101 -> 20260608 = 158 dias exatos.
  const csv = [
    'ranking_date,rank,player,points',
    '20260608,1,111,9000',
    '20260101,500,222,80',
  ].join('\n');
  assert.equal(buildTrajectories(parseRankingRows(csv), { maxStaleDays: 158 }).has('222'), true);
  assert.equal(buildTrajectories(parseRankingRows(csv), { maxStaleDays: 157 }).has('222'), false);
});

test('resolvePlayers: transliteração confirmada por id (Shelbayh) resolve apesar de fullName != bio.name', () => {
  // Abedallah (Sackmann) vs Abdullah (TML): mesma pessoa, só transliterada. id 209406 na allowlist.
  const players = [{ name: 'Shelbayh A.', fullName: 'Abdullah Shelbayh', lastDate: 20260525, bio: { id: '209406', name: 'Abedallah Shelbayh', age: 22.5 } }];
  const meta = new Map([['209406', { fullName: 'Abedallah Shelbayh', dob: 20031116 }]]);
  const { resolved } = resolvePlayers(['209406'], players, meta);
  assert.equal(resolved.get('209406').name, 'Shelbayh A.');
});
