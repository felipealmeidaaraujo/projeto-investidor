# Nível do torneio na grade — Especificação

> **Data:** 2026-07-17
> **Status:** Escopo aprovado pelo Felipe (brainstorming). Próximo passo: plano de implementação (writing-plans).
> **Relacionado:** [2026-07-17-vies-idade-elo-design.md](2026-07-17-vies-idade-elo-design.md) (a curva de idade que este gate protege), [2026-07-14-cobertura-challenger-design.md](2026-07-14-cobertura-challenger-design.md) (a decisão de cobrir tour + Challenger/125, sem ITF).

---

## Resumo em português claro

Hoje a grade de jogos do dia rotula **tudo** como "ATP" ou "WTA". Um Challenger, um ITF (M15/W50) e uma final de Masters aparecem iguais, sem distinção. O `pipeline/flashscore.js` lê o cabeçalho do Flashscore (`"CHALLENGER MEN - SINGLES: Granby (Canada), hard"`) e joga fora o "CHALLENGER" — extrai só o gênero.

Isso tem dois custos:

1. **Clareza** — o Elo de Challenger é menos calibrado que o do tour, e a grade não avisa. Viola a regra de clareza-zero-dúvida.
2. **Técnico** — a curva de idade (`AGE_COEF` ATP=0,026) foi validada **só no tour ATP**, mas hoje roda também em Challenger, porque eles chegam rotulados "ATP". Num dia típico, 4 de 7 jogos ajustados eram Challenger.

**O que muda:** o parser passa a capturar o nível (`tour` / `challenger`, com ITF e outros filtrados fora). A grade mostra "Challenger" quando é o caso. E o ajuste de idade passa a ser **gateado por nível** — só roda no tour. Quando o modelo *deixa* de ajustar por ser Challenger, isso é dito explicitamente (na grade e no card), com a magnitude que a correção teria tido.

---

## O que a fonte oferece (feed real do Flashscore, 2026-07-17)

Categorias de cabeçalho (a parte antes do `:`), verificadas ao vivo:

| Categoria no feed | Interpretação | `tour` | `level` |
|---|---|---|---|
| `ATP - SINGLES` / `WTA - SINGLES` | Tour principal (Slam/Masters/500/250 — **indistinguíveis** entre si) | ATP / WTA | `tour` |
| `CHALLENGER MEN - SINGLES` | Challenger ATP | ATP | `challenger` |
| `CHALLENGER WOMEN - SINGLES` | Challenger WTA (125) | WTA | `challenger` |
| `ITF MEN - SINGLES` | ITF masc. (`M15`/`M25` vem no nome do torneio) | ATP | `itf` |
| `ITF WOMEN - SINGLES` | ITF fem. (`W15`/`W50`…) | WTA | `itf` |
| `EXHIBITION - MEN`, `TEAMS - MEN`, etc. | Exibição, equipes | — | `other` |

**Consequência de escopo:** a granularidade máxima possível da fonte é `tour / challenger / itf`. Não existe "ATP 250" vs "Masters" a partir daqui — todos são `ATP - SINGLES`. Sub-níveis estão **fora de escopo**.

---

## Decisões (aprovadas no brainstorming)

1. **Capturar 3 níveis; excluir ITF (e o resto) da grade.** O parser reconhece `tour`/`challenger`/`itf`/`other` e emite **apenas** `tour` e `challenger`. ITF, exhibition e teams são descartados no parser — alinhado com a cobertura já decidida (tour + Challenger/125, sem ITF) e fechando o vazamento atual de ITF rotulado "ATP".
2. **Selo "Challenger" no rótulo do circuito.** O tour principal continua `ATP · saibro` (o padrão, sem selo). O Challenger vira `ATP · Challenger · saibro`. Sinaliza só o que desvia do padrão.
3. **Gate da curva de idade pelo nível.** O ajuste só roda em nível `tour`. Na grade e no fluxo grade→detalhe, manda o nível **real** do torneio (Flashscore). Na análise manual pura (sem torneio), o fallback deriva do `player.level`: aplica só se **ambos** os jogadores forem `'tour'`.
4. **Supressão explícita.** Quando o ajuste é barrado por ser Challenger — e só quando ele *teria* ocorrido (ATP, diferença de idade ≥ 0,5 ano) — o sistema calcula a "sombra" (o quanto a correção mexeria) e sinaliza que **não** foi aplicada, na grade e no card de detalhe.

---

## Arquitetura e pontos de mudança

O `level` acompanha o jogo por todo o pipeline: parser → `today.json` → UI, e alimenta o gate da idade em `analyzeMatch`.

### 1. `pipeline/flashscore.js` — capturar o nível

`parseTournamentHeader(za)` passa a devolver também `level`, derivado da categoria:

- contém `challenger` → `'challenger'`
- contém `itf` → `'itf'`
- é `atp`/`wta` (tour) → `'tour'`
- qualquer outra (exhibition, teams…) → `'other'`

A detecção de gênero (`tour`: ATP/WTA) é preservada — `CHALLENGER WOMEN` continua WTA, `ITF MEN` continua ATP.

`parseFeed` ganha um **filtro por nível**: além de `th.singles`, só emite jogos com `level ∈ {tour, challenger}`. O objeto emitido ganha o campo `level`. Isso torna o filtro mais robusto que o atual (que só barra duplas) e descarta ITF/exhibition/teams explicitamente, mesmo que venham marcados como "singles".

### 2. `web/src/analysis.js` — gate + sombra

`analyzeMatch(playerA, playerB, surface, model, level)` ganha o 5º parâmetro **opcional** `level` (o nível do torneio, quando conhecido).

Lógica do nível efetivo e do gate:

```
nivelEfetivo = level ?? (playerA.level === 'tour' && playerB.level === 'tour' ? 'tour' : 'challenger')
aplicaIdade  = nivelEfetivo === 'tour'

shadow = ageAdjusted(bruta, ageA, ageB, model.tour)   // computa sempre, para ter a sombra
se aplicaIdade:
    probA      = shadow?.adjusted ? shadow.prob : bruta
    ageAdjust  = shadow?.adjusted ? shadow : null
    ageSuppressed = null
senão:
    probA      = bruta
    ageAdjust  = null
    ageSuppressed = shadow?.adjusted ? { gap: shadow.gap, wouldDelta: shadow.delta } : null
```

> `ageAdjusted` devolve `null` só quando a probabilidade é inválida (não é o caso de `bruta`, sempre finita aqui). O `?.` cobre isso por robustez.

- `shadow.adjusted` só é `true` quando ATP + |gap| ≥ `MIN_GAP_YEARS` (0,5). Logo `ageSuppressed` só nasce nos Challenger ATP com idade discrepante — WTA e pares de idade próxima não geram nota.
- Sem `level` e com jogador sem `.level` (ex.: jogador custom da busca manual), o par não é `'tour'` × `'tour'` → não ajusta (conservador). Caso raro; aceitável.
- `ageAdjusted` permanece intacta (foco: o cálculo do ajuste). O **gate de nível vive em `analyzeMatch`**.

### 3. `pipeline/fixtures.js` — propagar ao `today.json`

- Passa `g.level` como 5º argumento de `analyzeMatch(pa, pb, g.surface, model, g.level)`.
- Grava `level: g.level` em cada match.
- Inclui `ageSuppressed` no match **quando presente** (mesma condicional já usada para `ageAdjust`, para não inflar o JSON que o celular baixa).

Estrutura do match no `today.json` (campos novos em **negrito**): `tour, tournament, surface, status, commence, a, b, probA,` **`level`**`, ageAdjust?,` **`ageSuppressed?`**`, favorite, favoriteProb, marginLabel, confidence, fairOddA, fairOddB, marketOddA, marketOddB`.

> **Fallback ESPN:** a ESPN só cobre tour. O ramo de fallback (`loadGrid`) passa a marcar `level: 'tour'` nos jogos que monta, para o gate e o `today.json` ficarem consistentes.

### 4. `web/app.js` — grade, coerência grade→detalhe, card

**Grade (`renderFixtures`, ~857):**
- Rótulo do circuito: `${g.tour}${g.level === 'challenger' ? ' · Challenger' : ''} · ${SURFACE_PT[g.surface]}`.
- Selo de supressão, simétrico ao `⚖ ajuste de idade` existente: quando `g.ageSuppressed`, exibir `⚖ ajuste suspenso (Challenger)`.

**Coerência grade→detalhe:**
- O estado `anal` (~780) ganha `level`.
- `pickFixture` (~887) seta `anal.level = game.level` ao abrir um jogo da grade.
- Ao trocar de confronto por busca manual (troca de jogadores / `switchTour`), `anal.level` volta a `null` (deriva do `player.level`).
- As chamadas `analyzeMatch(anal.a, anal.b, anal.surface, anal.model)` das telas de detalhe (**953, 1257**) passam `anal.level` como 5º argumento. Assim, a grade e o detalhe do mesmo jogo **nunca se contradizem** sobre ter havido ajuste.
- A chamada do registrar (**373**, `reg`) não tem torneio associado → segue sem `level` (deriva do `player.level`).

**Card de detalhe (`renderReading`, ~1278):** além da frase de `ageAdjust` (já existe), quando houver `r.ageSuppressed`, renderizar a frase de supressão (nova função em `age-curve.js`).

### 5. `web/src/age-curve.js` — texto da supressão

Nova função pura `ageSuppressedText(ageSuppressed, nomeMaisNovo)`, análoga a `ageAdjustText`, produzindo, p.ex.:

> "Ajuste de idade não aplicado: 1 ano de diferença — no tour o modelo corrigiria a favor do {nomeMaisNovo} em ~0,6 pp, mas este é um Challenger, nível onde a correção nunca foi validada (o Elo de Challenger é menos calibrado). A probabilidade acima está sem esse ajuste."

O "mais novo" segue a mesma regra da `ageAdjustText` (`gap > 0` → A é o mais novo). A magnitude usa `|wouldDelta|` em pontos percentuais, uma casa, vírgula pt-BR.

O comentário de "extrapolação conhecida" no topo de `age-curve.js` (linhas 26-29) deixa de valer e é atualizado: o gate por nível passa a existir.

---

## Testes (TDD)

**`tests/flashscore.test.js`**
- `parseTournamentHeader` devolve `level`: `'challenger'` (`CHALLENGER MEN - SINGLES: Granby…`), `'tour'` (`ATP - SINGLES`, `WTA - SINGLES`), `'itf'` (`ITF MEN - SINGLES: M15 Gubbio…`), `'other'` (`EXHIBITION - MEN: UTS…`).
- Gênero preservado junto do nível: `CHALLENGER WOMEN` → `{tour:'WTA', level:'challenger'}`; `ITF MEN` → `{tour:'ATP', level:'itf'}`.
- `parseFeed` emite tour + challenger e **descarta ITF e exhibition** mesmo quando marcados como singles; cada jogo emitido carrega `level`.

**`tests/analysis.test.js`**
- `analyzeMatch` com `level='challenger'`: par ATP jovem×veterano **não** ajusta (`ageAdjust` nulo) e devolve `ageSuppressed` com `gap` e `wouldDelta`.
- `analyzeMatch` com `level='tour'`: ajusta como antes.
- Sem `level`: dois jogadores `level:'tour'` → ajusta; um `level:'challenger'` → não ajusta, e (se ATP + gap) devolve `ageSuppressed`.
- `level='challenger'` em par sem gap de idade (ou WTA): sem `ageAdjust` e **sem** `ageSuppressed` (nada a relatar).

**`tests/age-curve.test.js`**
- `ageSuppressedText`: frase correta, nomeando o mais novo e a magnitude; `null` quando `ageSuppressed` é nulo.

---

## Fora de escopo (YAGNI)

- Sub-níveis do tour (250/500/Masters/Slam) — a fonte não distingue.
- Sub-níveis de ITF (M15/M25/W50) — ITF sai fora da grade.
- Seletor de nível na tela de análise manual — o fallback por `player.level` cobre.
- Reingestão/modelo de ITF — a cobertura decidida exclui ITF.

---

## Riscos e observações

- **Formato do cabeçalho pode mudar.** A detecção de nível é por substring da categoria (`challenger`/`itf`/`atp`/`wta`). Se o Flashscore renomear categorias, cai em `'other'` e o jogo é descartado (falha segura: some da grade em vez de vazar rotulado errado). O `fetchGrid` já lança quando o feed vem vazio.
- **`player.level` é um proxy grosseiro** (definido por "mais jogos de Challenger que de tour"). Só é usado no fallback da análise manual pura; na grade e no grade→detalhe, o nível real do torneio manda, então o furo "dois jogadores de tour num Challenger" não afeta o caminho principal.
- **Regressão a vigiar:** jogos de tour ATP com idade discrepante devem continuar recebendo o ajuste (comportamento idêntico ao de hoje); só os Challenger deixam de recebê-lo. Um teste de não-regressão cobre isso.
