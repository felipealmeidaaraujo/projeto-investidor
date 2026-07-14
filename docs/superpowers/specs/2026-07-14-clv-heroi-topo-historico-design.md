# Design — CLV herói no topo do Histórico

**Data:** 2026-07-14
**Projeto:** Investidor (PWA de apoio à decisão para trade de tênis na Betfair)
**Autor:** Felipe + Claude (brainstorm)

## Objetivo

Promover o **CLV (Closing Line Value)** de métrica escondida a **métrica-herói**, com
destaque visual no topo da tela **Histórico**: um bloco grande com CLV médio, quanto o
Felipe bate o fechamento, tendência ao longo do tempo, e quebra por mercado e superfície.

Motivo (filosofia do projeto): o placar real do Felipe é o **CLV** (habilidade de longo
prazo), não o lucro de curto prazo. O CLV precisa aparecer como protagonista.

## Decisões travadas (brainstorm 2026-07-14)

- **Fonte do fechamento (fase 2):** `tennis-data.co.uk` (odd de fechamento da Pinnacle,
  grátis, cobre todos os torneios, já integrada no pipeline). Aceito o lag de alguns dias
  (planilha semanal). The Odds API histórico foi descartada por ser paga e cobrir só
  ~40 torneios grandes.
- **Local do herói:** topo da tela **Histórico**, acima do hero de P/L.
- **Ordem:** **gráfico primeiro** (esta fase), captura automática depois (fase 2).
- **Mercados que o Felipe opera:** trade ao vivo = **só Match Odds** (back ou lay);
  punter = Match Odds, **Handicap**, **Over/Under de games**. Nada além disso.

## Escopo desta fase (fase 1 — o herói visual)

Construir o bloco de CLV no Histórico, funcionando **já** com os trades que tiverem odd
de fechamento (hoje preenchida à mão; na fase 2 vem automática). Puramente frontend/local
— não mexe no robô nem no pipeline.

Inclui também um ajuste pequeno e relacionado: corrigir a lista de mercados do registro
para refletir os mercados reais do Felipe (melhora imediatamente a quebra "por mercado").

## Fora de escopo agora (fase 2 — captura automática)

Registrado aqui para não se perder; terá seu próprio brainstorm/spec:

- Campo **lado** no registro (em qual jogador entrou) — pré-requisito para casar o
  fechamento certo. Só faz sentido para Match Odds.
- Distinção **back vs lay**: a fórmula de CLV atual (`clvPct`) é de **back**
  (odd pega > fechamento = bom). Para **lay** o critério inverte. A captura/CLV da fase 2
  precisa saber o lado da operação.
- Pipeline de captura `tennis-data.co.uk` + casamento de nomes + gatilho no robô.
- Cobertura: só **Match Odds** tem fechamento público. Handicap/Over-Under seguem manuais.

## Arquitetura

Segue o padrão existente: lógica pura e testável em `web/src/`, renderização em `app.js`.

### 1. Camada de dados — `web/src/stats.js` (funções puras novas)

Um trade "tem CLV" quando `typeof t.clv === 'number'` (o campo `clv` é gravado por
`makeTrade` sempre que há `oddClose`). Todas as funções abaixo ignoram trades sem `clv`.

- **`clvStats(trades)` → `{ measured, avgClv, beatRate, beatCount }`**
  - `measured`: nº de trades com `clv`.
  - `avgClv`: média dos `clv` (em %). Igual em espírito ao `summarize().avgClvPct`, mas
    derivado do campo `clv` gravado.
  - `beatCount`: nº de trades com `clv > 0`.
  - `beatRate`: `beatCount / measured` (0..1). A métrica-chave — ideal > 0,5.
  - Vazio (`measured === 0`): `{ measured: 0, avgClv: 0, beatRate: 0, beatCount: 0 }`.

- **`clvTrend(trades)` → `number[]`**
  - Ordena os trades com `clv` por data (`date`, crescente) e retorna o **CLV médio
    acumulado** a cada ponto: `[clv1, (clv1+clv2)/2, (clv1+clv2+clv3)/3, ...]`.
  - Mostra a habilidade **estabilizando/melhorando**, não o ruído trade-a-trade.
  - `measured === 0` → `[]`; `measured === 1` → `[clv1]`.

- **`clvBySegment(trades, key)` → `{ [k]: { count, avgClv, beatRate } }`**
  - Como `segmentBy`, mas só considera trades com `clv`, e agrega métricas de CLV
    (não P/L). `key` = `'market'` ou `'surface'`.
  - Chave ausente cai em `'—'` (mesmo comportamento do `segmentBy` atual).

### 2. Camada visual — `renderHistorico` em `web/app.js`

Nova seção no **topo** do Histórico (antes do hero de P/L existente):

- **Bloco herói de CLV** (reaproveita o estilo do card verde `v-green` já existente,
  ampliado): rótulo "CLV médio — sua habilidade real", valor grande colorido
  (verde se `avgClv > 0`, vermelho se `< 0`, neutro se `= 0`), pills com
  `beatRate` ("68% bateu o fechamento") e `measured` ("12 medidos"), e o gráfico de
  tendência (`clvTrend` via `areaSpark`/`lineSpark`, maior, com linha de referência no 0).
- **Estado vazio educativo** quando `measured === 0`: explica que registrar a odd de
  fechamento (ou, na fase 2, a captura automática) destrava a métrica. Sem números falsos.
- **Duas quebras**: "CLV por mercado" e "CLV por superfície", via novo helper
  **`clvSegCard(title, groups)`** (irmão de `segCard`), mostrando por linha:
  CLV médio (colorido) + beat rate + nº de trades. Só aparecem se `measured > 0`.

O hero de P/L, o "Aprendizado", os segCards de P/L e a lista de trades continuam abaixo,
inalterados.

### 3. Ajuste dos mercados — `MARKET_OPTS` em `web/app.js`

`['Match Odds', 'Vencedor Set', 'Games', 'Outro']` → `['Match Odds', 'Handicap', 'Over/Under Games']`.

Trades antigos (simulação, a serem apagados) com mercados fora da nova lista continuam
sendo exibidos normalmente pelas quebras — `segmentBy`/`clvBySegment` agrupam por qualquer
valor presente, então não quebra nada.

## Edge cases

- **0 trades medidos:** estado vazio educativo; sem gráfico, sem quebras.
- **1 trade medido:** número aparece; `clvTrend` tem 1 ponto → o helper de gráfico
  desenha ponto/linha degenerada ou omite (mesmo tratamento do `lineSpark` atual, que só
  desenha com `length > 1`).
- **Trade sem `surface`/`market`:** cai em `'—'` na quebra.
- **Todos os `clv` iguais:** tendência é uma reta; ok.

## Testes (`tests/stats.test.js`, node built-in test runner)

- `clvStats`: mix de CLV +/−, contagem de `measured` e `beatCount`, `beatRate`, e caso vazio.
- `clvTrend`: acumulado correto (ex.: `[2, 4, 0]` → `[2, 3, 2]`), ordenação por data,
  casos vazio e 1 elemento.
- `clvBySegment`: agrupa por mercado/superfície só com trades medidos; ignora sem `clv`;
  chave ausente → `'—'`.

Alvo: manter a suíte verde (hoje ~99 testes) + os novos.

## Verificação

Rodar `npm test` (tudo verde) e `npm run dev` (localhost:5173): abrir o Histórico com
trades que têm odd de fechamento e conferir o bloco herói, a tendência e as duas quebras;
conferir também o estado vazio (conta/base sem CLV). Verifico no navegador via
`get_page_text` + inspeção do DOM (screenshot do browser-pane é instável).

## Entrega

Feature pronta + testes verdes + verificada → merge no `main` + push (redeploy automático
no GitHub Pages), conforme autorização permanente do Felipe.
