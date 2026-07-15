// Sugestão tática em palavras a partir dos padrões — leitura, não previsão. Pura, testada.

const pctOf = (r) => (r && r.pct != null ? r.pct : null);

/** r (de analyzeMatch) + padrões de estilo do favorito e do azarão -> { pende, caminho, risco }. */
export function tacticalSuggestion(r, styleFav, styleUnd, surfacePt) {
  const fav = r.favorite;
  const und = r.underdog;
  const favPct = Math.round(r.favoriteProb * 100);

  const pende =
    r.marginLabel === 'equilibrado'
      ? `Jogo parelho em ${surfacePt} — leve vantagem pro ${fav} (${favPct}%).`
      : `Em ${surfacePt}, o ${fav} é ${r.marginLabel} (${favPct}%).`;

  const fFirst = pctOf(styleFav?.firstSet);
  const fDecider = pctOf(styleFav?.decider);
  let caminho;
  if (fFirst != null && fFirst >= 60) {
    caminho = `A força dele é no começo: ganha o 1º set em ${fFirst}%. Um caminho é entrar a favor do ${fav} e buscar o green cedo — numa quebra ou no 1º set.`;
  } else if (fDecider != null && fDecider >= 55) {
    caminho = `Ele resolve na reta final: vence ${fDecider}% dos jogos de 3 sets. Um caminho é ter paciência e não sair na primeira oscilação.`;
  } else {
    caminho = `Um caminho é entrar a favor do ${fav}, respeitando a leitura, com um alvo de saída definido.`;
  }

  const uComeback = pctOf(styleUnd?.comeback);
  const uDecider = pctOf(styleUnd?.decider);
  const uTb = pctOf(styleUnd?.tieBreak);
  let risco;
  if (uComeback != null && uComeback >= 40) {
    risco = `Cuidado: o ${und} vira jogos — vence ${uComeback}% quando perde o 1º set. Se o ${fav} não fechar cedo, a posição fica perigosa.`;
  } else if ((uDecider != null && uDecider >= 55) || (uTb != null && uTb >= 60)) {
    risco = `O ${und} é durão na reta final. Não subestime se o jogo esticar — tenha um ponto de saída.`;
  } else {
    risco = `O risco é o ${und} embalar; entre com um ponto de saída claro na cabeça.`;
  }

  return { pende, caminho, risco };
}
