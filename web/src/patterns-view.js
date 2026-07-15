// Traduz os padrões do jogador (style/pressure/bio) em linhas claras { label, detail } para a UI.
// Regra de clareza: o número vai sempre embutido no texto. Funções puras.

/** Padrões de estilo -> linhas legíveis. Omite leituras com menos de minN jogos. */
export function styleLines(style, minN = 5) {
  if (!style) return [];
  const defs = [
    { label: 'Começa ligado', r: style.firstSet, txt: (v) => `ganha o 1º set em ${v}%` },
    { label: 'Vira jogos', r: style.comeback, txt: (v) => `vence ${v}% quando perde o 1º set` },
    { label: 'Aguenta a decisão', r: style.decider, txt: (v) => `vence ${v}% dos jogos de 3 sets` },
    { label: 'Forte no tie-break', r: style.tieBreak, txt: (v) => `ganha ${v}% dos tie-breaks` },
  ];
  return defs
    .filter((d) => d.r && d.r.pct != null && d.r.n >= minN)
    .map((d) => ({ label: d.label, detail: d.txt(d.r.pct) }));
}

/** Padrões de pressão -> linhas legíveis (só as taxas claras). */
export function pressureLines(pressure) {
  if (!pressure) return [];
  const lines = [];
  if (pressure.bpSavedPct != null) {
    lines.push({ label: 'Salva break point', detail: `segura ${pressure.bpSavedPct}% dos break points contra` });
  }
  if (pressure.breaksAgainstPerSvGm != null) {
    lines.push({ label: 'Firmeza no saque', detail: `é quebrado em ${Math.round(pressure.breaksAgainstPerSvGm * 100)}% dos games de saque` });
  }
  return lines;
}
