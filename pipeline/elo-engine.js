// Motor Elo por superfície: mantém ratings por jogador e processa partidas em ordem.
// Construído sobre as funções puras de elo.js. Testado em tests/elo-engine.test.js.
import { expectedScore, kFactor, updateRating, blendSurface } from './elo.js';

const INITIAL = 1500;

export class EloEngine {
  constructor({ surfaceWeight = 0.5 } = {}) {
    this.players = new Map();
    this.surfaceWeight = surfaceWeight;
  }

  _get(name) {
    if (!this.players.has(name)) {
      this.players.set(name, { overall: INITIAL, matches: 0, surfaces: {}, surfaceMatches: {}, lastDate: null });
    }
    return this.players.get(name);
  }

  _surfaceRating(p, surface) {
    return p.surfaces[surface] ?? INITIAL;
  }

  /** Rating combinado (geral + superfície) para um jogador numa superfície. */
  rating(name, surface) {
    const p = this._get(name);
    return blendSurface(p.overall, this._surfaceRating(p, surface), this.surfaceWeight);
  }

  /** Probabilidade de A vencer B na superfície. */
  predict(a, b, surface) {
    return expectedScore(this.rating(a, surface), this.rating(b, surface));
  }

  /** Atualiza os ratings a partir de um resultado (vencedor conhecido). */
  processMatch({ winner, loser, surface, dateInt }) {
    const w = this._get(winner);
    const l = this._get(loser);
    if (dateInt) { w.lastDate = dateInt; l.lastDate = dateInt; }

    // Elo geral
    const expW = expectedScore(w.overall, l.overall);
    const kW = kFactor(w.matches);
    const kL = kFactor(l.matches);
    w.overall = updateRating(w.overall, 1, expW, kW);
    l.overall = updateRating(l.overall, 0, 1 - expW, kL);
    w.matches += 1;
    l.matches += 1;

    // Elo de superfície
    if (surface) {
      const ws = this._surfaceRating(w, surface);
      const ls = this._surfaceRating(l, surface);
      const expWs = expectedScore(ws, ls);
      const kWs = kFactor(w.surfaceMatches[surface] ?? 0);
      const kLs = kFactor(l.surfaceMatches[surface] ?? 0);
      w.surfaces[surface] = updateRating(ws, 1, expWs, kWs);
      l.surfaces[surface] = updateRating(ls, 0, 1 - expWs, kLs);
      w.surfaceMatches[surface] = (w.surfaceMatches[surface] ?? 0) + 1;
      l.surfaceMatches[surface] = (l.surfaceMatches[surface] ?? 0) + 1;
    }
  }

  /** Snapshot do estado de um jogador (para inspeção, dossiês e testes). */
  getState(name) {
    const p = this._get(name);
    return { overall: p.overall, surfaces: { ...p.surfaces }, matches: p.matches, lastDate: p.lastDate };
  }
}
