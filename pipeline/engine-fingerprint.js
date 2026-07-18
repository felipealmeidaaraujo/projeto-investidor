// Fingerprint COMPORTAMENTAL do motor Elo — resume os params contra os quais AGE_COEF e
// DECAY_COEF foram medidos. Se o motor mudar (kFactor / prior 1500 / expectedScore /
// blendSurface), o hash muda e tests/engine-fingerprint.test.js falha, forçando refazer as
// medições (specs de idade e de decay). NÃO inclui o calibrationT (refitado a cada treino
// de propósito). Amostra o COMPORTAMENTO, não o código — imune a mudança cosmética.
//
// Ressalva: o surfaceWeight aparece em elo-engine.js (construtor) e num 0.5 hardcoded em
// web/src/analysis.js; este fingerprint captura o DEFAULT de blendSurface. Uma mudança só no
// 0.5 de analysis.js (mantendo o default) não seria pega — mas já seria uma inconsistência
// interna hoje, fora do escopo deste guarda-corpo.
import { kFactor, updateRating } from './elo.js';
import { expectedScore, blendSurface } from '../web/src/model-math.js';
import { INITIAL } from './elo-engine.js';

/** Hash determinístico simples (FNV-1a 32 bits → hex de 8 chars). Só para igualdade, não segurança. */
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Resume o comportamento do motor Elo aplicando os params a entradas fixas. */
export function engineFingerprint() {
  const amostras = [
    kFactor(0), kFactor(5), kFactor(20), kFactor(100), kFactor(500),
    expectedScore(1500, 1500), expectedScore(1600, 1500), expectedScore(2000, 1800), expectedScore(1500, 2000),
    blendSurface(1800, 1900),        // surfaceWeight default (0,5)
    blendSurface(1800, 1900, 0.7),   // peso não-default: sensível à ordem dos args e ao surfaceWeight
    updateRating(1500, 1, 0.5, 32),
    INITIAL,
  ];
  return hashStr(amostras.map((x) => x.toFixed(10)).join('|'));
}
