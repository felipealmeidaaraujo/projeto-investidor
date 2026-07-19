// Acumuladores correntes (point-in-time) por jogador: saque, devolução e 1º set.
// Atualizado APÓS capturar o estado pré-jogo (o runner garante a ordem).
// Puro/determinístico. Testado em tests/swing-signals.test.js.
export class SwingStats {
  constructor() { this.p = new Map(); }

  _get(name) {
    let s = this.p.get(name);
    if (!s) { s = { matches: 0, svpt: 0, spWon: 0, retPts: 0, retWon: 0, firstPlayed: 0, firstWon: 0 }; this.p.set(name, s); }
    return s;
  }

  ready(name, minMatches) { return (this.p.get(name)?.matches ?? 0) >= minMatches; }
  returnWonPct(name) { const s = this.p.get(name); return s && s.retPts > 0 ? s.retWon / s.retPts : null; }
  serveWonPct(name) { const s = this.p.get(name); return s && s.svpt > 0 ? s.spWon / s.svpt : null; }
  firstSetPct(name) { const s = this.p.get(name); return s && s.firstPlayed > 0 ? s.firstWon / s.firstPlayed : null; }

  update(name, { svpt = 0, spWon = 0, retPts = 0, retWon = 0, wonFirstSet = false } = {}) {
    const s = this._get(name);
    s.matches++;
    s.firstPlayed++;
    if (wonFirstSet) s.firstWon++;
    if (svpt > 0) { s.svpt += svpt; s.spWon += spWon; }
    if (retPts > 0) { s.retPts += retPts; s.retWon += retWon; }
  }
}
