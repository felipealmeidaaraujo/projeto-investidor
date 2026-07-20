import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandIndex, stateKey, correctFavProb, CORRECTION_TABLE, BAND_LABELS } from '../web/src/live-correction.js';

const base = { tour: 'ATP', favPreProb: 0.75, favSets: 0, dogSets: 1, bestOf: 3, modelProbFav: 0.4486 };

test('faixa do favorito cai no balde certo', () => {
  assert.equal(bandIndex(0.55), 0);
  assert.equal(bandIndex(0.60), 1);
  assert.equal(bandIndex(0.699), 1);
  assert.equal(bandIndex(0.70), 2);
  assert.equal(bandIndex(0.95), 4);
  assert.equal(bandIndex(0.5), 0);
});

test('prob inválida ou de azarão não tem faixa', () => {
  assert.equal(bandIndex(0.49), -1);
  assert.equal(bandIndex(1.2), -1);
  assert.equal(bandIndex(NaN), -1);
});

test('só os estados medidos têm chave', () => {
  assert.equal(stateKey(1, 0), '1-0');
  assert.equal(stateKey(0, 1), '0-1');
  assert.equal(stateKey(1, 1), '1-1');
  assert.equal(stateKey(0, 0), null, 'no 0-0 a âncora já é o mercado — não há o que corrigir');
  assert.equal(stateKey(2, 0), null);
});

test('favorito que PERDEU o set: a correção puxa a prob pra baixo', () => {
  const r = correctFavProb(base);
  assert.equal(r.applied, true);
  assert.ok(r.prob < base.modelProbFav, 'o modelo é otimista demais com quem está atrás');
  assert.equal(r.n, 1899);
  assert.ok(r.deltaPp < 0);
});

test('no ponto exato da medição, a correção reproduz a taxa real', () => {
  const cell = CORRECTION_TABLE.ATP['0-1'][2];
  const r = correctFavProb({ ...base, modelProbFav: cell.model });
  assert.ok(Math.abs(r.prob - cell.real) < 1e-9, `esperado ${cell.real}, veio ${r.prob}`);
});

test('favorito que GANHOU o set: a correção puxa pra cima', () => {
  const cell = CORRECTION_TABLE.ATP['1-0'][2];
  const r = correctFavProb({ ...base, favSets: 1, dogSets: 0, modelProbFav: cell.model });
  assert.equal(r.applied, true);
  assert.ok(r.prob > cell.model);
  assert.ok(Math.abs(r.prob - cell.real) < 1e-9);
});

test('a correção da WTA é mais forte que a da ATP no mesmo estado', () => {
  const atp = correctFavProb({ ...base, tour: 'ATP' });
  const wta = correctFavProb({ ...base, tour: 'WTA' });
  assert.ok(Math.abs(wta.deltaPp) > Math.abs(atp.deltaPp), 'a WTA tinha viés maior na medição');
});

test('a correção preserva a dinâmica de dentro do set (desloca, não achata)', () => {
  const menor = correctFavProb({ ...base, modelProbFav: 0.40 });
  const maior = correctFavProb({ ...base, modelProbFav: 0.50 });
  assert.ok(maior.prob > menor.prob, 'prob maior no modelo continua maior depois de corrigida');
  assert.ok(menor.prob > 0 && maior.prob < 1);
});

test('sem célula medida, devolve a prob intacta e diz o motivo', () => {
  const semEstado = correctFavProb({ ...base, favSets: 0, dogSets: 0 });
  assert.equal(semEstado.applied, false);
  assert.equal(semEstado.prob, base.modelProbFav);
  assert.equal(semEstado.reason, 'estado sem medição');

  const bo5 = correctFavProb({ ...base, bestOf: 5 });
  assert.equal(bo5.applied, false);
  assert.equal(bo5.reason, 'medimos só melhor-de-3');

  const faixaRala = correctFavProb({ ...base, favPreProb: 0.95 }); // 90%+ em 0-1 é null
  assert.equal(faixaRala.applied, false);
  assert.equal(faixaRala.reason, 'amostra insuficiente nesta faixa');
  assert.equal(faixaRala.prob, base.modelProbFav);
});

test('circuito desconhecido não quebra', () => {
  const r = correctFavProb({ ...base, tour: 'ITF' });
  assert.equal(r.applied, false);
  assert.equal(r.prob, base.modelProbFav);
});

test('a correção nunca sai de (0,1)', () => {
  for (const p of [0.0001, 0.01, 0.5, 0.99, 0.9999]) {
    const r = correctFavProb({ ...base, modelProbFav: p });
    assert.ok(r.prob > 0 && r.prob < 1, `estourou em ${p}: ${r.prob}`);
  }
});

test('toda célula preenchida tem amostra ≥ 300 e rótulo de faixa', () => {
  for (const tour of ['ATP', 'WTA']) {
    for (const estado of ['1-0', '0-1', '1-1']) {
      const linha = CORRECTION_TABLE[tour][estado];
      assert.equal(linha.length, BAND_LABELS.length);
      for (const c of linha) {
        if (c === null) continue;
        assert.ok(c.n >= 300, `${tour} ${estado}: amostra ${c.n} abaixo do mínimo`);
        assert.ok(c.real > 0 && c.real < 1 && c.model > 0 && c.model < 1);
      }
    }
  }
});
