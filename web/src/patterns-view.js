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

const IOC = {
  ITA: 'Itália', ESP: 'Espanha', SRB: 'Sérvia', USA: 'EUA', FRA: 'França', GER: 'Alemanha',
  GBR: 'Reino Unido', RUS: 'Rússia', ARG: 'Argentina', AUS: 'Austrália', CAN: 'Canadá',
  SUI: 'Suíça', AUT: 'Áustria', GRE: 'Grécia', NOR: 'Noruega', DEN: 'Dinamarca', POL: 'Polônia',
  NED: 'Holanda', BUL: 'Bulgária', CRO: 'Croácia', CZE: 'Tchéquia', CHI: 'Chile', BRA: 'Brasil',
  JPN: 'Japão', CHN: 'China', KAZ: 'Cazaquistão', SVK: 'Eslováquia', BEL: 'Bélgica', HUN: 'Hungria',
  POR: 'Portugal', FIN: 'Finlândia', SWE: 'Suécia', COL: 'Colômbia', BOL: 'Bolívia', PER: 'Peru',
  UKR: 'Ucrânia', BLR: 'Belarus', ROU: 'Romênia', SLO: 'Eslovênia', TUN: 'Tunísia',
  IND: 'Índia', TPE: 'Taipé', MDA: 'Moldávia', BIH: 'Bósnia', LTU: 'Lituânia', LAT: 'Letônia',
};

/** Bio do jogador -> linha de identidade por extenso. */
export function bioText(bio, tour) {
  if (!bio) return '';
  const parts = [];
  if (bio.rank) parts.push(`Ranking #${bio.rank} ${tour}`);
  if (bio.hand) parts.push(bio.hand === 'L' ? 'canhoto' : 'destro');
  if (bio.ht) parts.push(`${bio.ht} cm`);
  if (bio.age) parts.push(`${Math.round(bio.age)} anos`);
  if (bio.ioc) parts.push(IOC[bio.ioc] || bio.ioc);
  return parts.join(' · ');
}
