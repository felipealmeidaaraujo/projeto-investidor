# Frente C — Fase 1: Medir o swing — Especificação

> **Data:** 2026-07-18
> **Status:** Metodologia aprovada pelo Felipe. Próximo passo: plano de implementação.
> **Direção:** [[direcao-copiloto-honesto]] — a Shortlist só se sustenta se o swing for medível; esta fase decide o go/no-go.
> **Relacionado:** [2026-07-18-frente-b-copiloto-ao-vivo-design.md](2026-07-18-frente-b-copiloto-ao-vivo-design.md).

## Contexto e propósito

A Frente C é a **Shortlist do dia por tradeabilidade** (quais jogos valem a atenção porque tendem a balançar). O Felipe pediu **"medir de verdade antes"** de ranquear. Esta **Fase 1 é só a medição — sem UI, sem tocar `today.json`.** Ela responde uma pergunta e decide o resto:

> **Algum sinal pré-jogo prevê "o favorito perde ≥1 set" ALÉM do que a probabilidade do favorito (o equilíbrio) já explica?**

Se sim, a Fase 2 constrói a Shortlist sobre esse(s) sinal(is). Se não, o resultado honesto é **"a Shortlist não tem base — não construir"**, e isso é um sucesso da Fase 1.

## Alvo (o "swing")

`favorito perdeu ≥1 set` (0/1), do placar real. Equivale a: **o azarão pré-jogo ganhou ≥1 set** (o favorito não fechou em sets diretos). Cobre tanto o favorito que apanhou e venceu quanto a zebra. É o momento clássico de sobre-reação do mercado.

**Proxy honesto:** medimos volatilidade **de placar**, não de **preço** nem de **lucro** (não temos série de preço da Betfair). Placar volátil é onde o mercado tem mais chance de exagerar — o melhor proxy disponível, declarado como proxy.

## Dados

Fonte com **placar + stats de saque na mesma linha**, já usada pelo pipeline: **TML** (`{year}.csv`, ATP) e **Sackmann** (`wta_matches_{year}.csv`, WTA) — formato Sackmann (`score`, `best_of`, `w_bpSaved`, `w_svpt`, `w_1stWon`…). Parseamos a coluna `score` (ex.: `6-4 3-6 7-5`) para os sets.

**Escopo do primeiro corte:** medir no **ATP de tour** (melhor amostra e dados mais limpos). Se um sinal passar, **confirmar no WTA** antes de qualquer Shortlist. Challenger depois. (Escopo, não limite definitivo.)

## Metodologia — walk-forward, sem vazamento (clona o `value-backtest.js`)

Caminho pelas partidas em ordem cronológica. **Antes** de processar cada resultado, capturo os sinais do estado daquele momento; só então leio o placar e marco o alvo; por fim atualizo os acumuladores. Zero look-ahead.

**Sinais point-in-time (os 4 escolhidos):**
1. **Jogo quebra-quebra** — média corrente de saque×devolução dos dois (pontos ganhos no saque / na devolução, acumulados por jogador até a partida). Quanto mais fraco o saque / melhor a devolução dos dois, mais quebras.
2. **Mismatch de piso** — delta de Elo por superfície (favorito rende abaixo do próprio nível naquele piso, ou o azarão acima). Já é point-in-time no `EloEngine`.
3. **Melhor-de-5** — `best_of` da partida (5 vs 3). Medido à parte (parte é mecânico).
4. **Azarão começa forte / vira** — taxa corrente do azarão de ganhar o 1º set (e de virar após perder o 1º), acumulada dos placares passados.

**Point-in-time de verdade:** as taxas correntes (1 e 4) são acumuladas como o Elo — nada de perfil de carreira (que olharia o futuro). Com **aquecimento**: só entra na medição a partida em que os dois jogadores já têm ≥ K partidas de histórico (taxa estável). Prob do favorito e delta de piso saem do Elo, que já aquece.

**Teste honesto — estratificar pelo equilíbrio:**
Agrupo as partidas em **faixas de prob do favorito**: 55–65%, 65–75%, 75–85%, 85%+. *Dentro de cada faixa*, separo por sinal (alto vs baixo — corte na mediana do sinal, definido **sem** olhar o período de teste) e comparo a taxa de "favorito perdeu set". Se o grupo de sinal alto perde set materialmente mais **na mesma faixa**, o sinal agrega informação além do equilíbrio.

**Split walk-forward:** anos antigos aquecem o Elo e os acumuladores; a mediana/cortes dos sinais são fixados fora do período de teste; o **efeito é reportado num período de teste** (anos recentes). Assim o número não é fruto de escolher o corte que favorece o resultado.

## Critério de go/no-go

Um sinal **passa** se, dentro das faixas de equilíbrio, separa a taxa de "favorito perdeu set" em **≥5 pontos percentuais** de forma **consistente** (mesma direção na maioria das faixas com amostra suficiente — ex.: ≥300 partidas por célula), **no período de teste**. Amostra pequena numa faixa → reportar mas não contar como prova.

Saída possível e válida: **nenhum sinal passa** → não construir a Shortlist (registrar o porquê).

## Entrega

- Um script no `pipeline/` que roda a medição e **imprime um relatório**: por sinal × faixa → n, taxa de set perdido (sinal alto / baixo), diferença; e um **veredito por sinal** (passa/não passa) + a recomendação go/no-go.
- Um **resumo em markdown commitado** (`docs/superpowers/findings/2026-…-swing-medicao.md`) — a evidência durável do que foi medido.
- **Sem UI, sem `today.json`, sem Shortlist.**

## Componentes (isolados e testáveis)

- **`pipeline/score.js`** (puro) — parser do `score` Sackmann → sets por jogador; trata tie-break `7-6(5)`, abandono `RET`/`W/O`/`DEF` (exclui incompletos). + `tests/score.test.js`.
- **`pipeline/swing-signals.js`** (puro) — acumuladores correntes por jogador (saque/devolução, 1º set, virada) e cômputo dos sinais a partir do estado. + testes.
- **`pipeline/swing-measure.js`** (IO/runner) — carrega os anos, roda o walk-forward reusando `EloEngine`, estratifica, imprime o relatório e escreve o markdown.
- **Reusa:** `elo-engine.js` (prob + delta de piso), `metrics.js`, o parser CSV do `ingest.js`, os loaders TML/Sackmann.

## Fora de escopo

- UI, `today.json`, a Shortlist (Fase 2, só se algo passar).
- Medir preço/lucro (sem dado de preço — o proxy é volatilidade de placar).
- Densidade de quebra e "foi a set decidido" como alvo (escolhemos "favorito perdeu set"; podem virar checagens secundárias, não o alvo).
- Challenger no primeiro corte (ATP tour primeiro; WTA confirma).

## Ordem de construção (a detalhar em writing-plans)

1. `pipeline/score.js` + testes (parser do placar).
2. `pipeline/swing-signals.js` + testes (acumuladores correntes e sinais).
3. `pipeline/swing-measure.js` — walk-forward + estratificação + relatório (ATP).
4. Rodar, ler o relatório, escrever o resumo em markdown, e **decidir go/no-go** junto com o Felipe.
