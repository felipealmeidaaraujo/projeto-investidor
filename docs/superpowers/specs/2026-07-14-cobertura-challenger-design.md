# Cobertura: Challenger ATP + WTA 125 — Design

**Data:** 2026-07-14
**Projeto:** Investidor (PWA de trade de tênis na Betfair)

## Objetivo

Ampliar drasticamente o universo de jogadores do app e, igualmente importante, **dar Elo
confiável** a quem hoje some ou aparece mal:

- **ATP:** de **192 ativos** (essencialmente o top ~200) para **~700–900**.
- **WTA:** de **211 ativas** para **~400** (o 125 é um circuito estreito — decisão consciente do Felipe).
- **Qualidade:** jogadores de baixo ranking hoje têm Elo enviesado pra baixo (só os vemos apanhando
  no tour) ou nem existem. Ex. medido: **Titouan Droguet (#119)** tem **17 partidas de tour** (cortado
  pelo filtro de 20) e **152 de Challenger** — com a fonte, passa a **169 partidas** e Elo calibrado
  no nível onde ele realmente joga.

## Diagnóstico (medido nesta sessão)

- Causa da baixa cobertura: a fonte `tennis-data.co.uk` só cobre **main draw tour-level**; o filtro
  `MIN_MATCHES = 20` (`train.js`) corta quem tem poucos jogos de tour. Não é falta de dado do jogador
  em si — é ausência de fonte de Challenger + filtro.
- **Fonte viável e atual** (o mesmo mirror já usado no `serve-stats.js`):
  `Aneeshers/tennis-sackmann-archive`, arquivos `atp/atp_matches_qual_chall_YYYY.csv` (até 2026 parcial)
  e `wta/wta_matches_qual_itf_YYYY.csv` (até 2025). ~2,4 MB/ano (ATP), ~5–7 MB/ano (WTA), no runner.
- **Ganho medido no escopo** (só `tourney_level === 'C'`): ATP 2.320 jogadores no universo / 806 com
  ≥20 partidas; WTA 125 = 756 jogadoras / 168 com ≥20.
- **Sem odds em nenhum nível Sackmann** (verificado): CLV pré-jogo automático e backtest de valor
  **não** cobrem Challenger/125. Elo, dossiê, scouting e **leitura ao vivo** (métrica-herói do Felipe)
  **funcionam**, pois derivam do Elo, não de odds.

## Decisões travadas (brainstorm 2026-07-14)

- **Escopo:** ATP **Challenger** + WTA **125**. Sem descer a ITF (W15–W100) nem futures. Confirmado
  pelo Felipe.
- **Nível incluído:** apenas `tourney_level === 'C'` nos dois arquivos (no `qual_itf` da WTA, `C` são
  exatamente os "125"). A quali de tour (levels A/M/G no ATP; P/I/G/PM na WTA) fica **de fora por ora** —
  ajuste futuro possível se a calibração cross-nível pedir mais pontes.
- **Base do tour = `tennis-data`** (frescor de ~2 dias + odds). O tour do Sackmann tem lag (parou em
  25/mai) e não tem odds → **não migrar**; o Sackmann entra só como camada de Challenger.
- **Janela:** mesma do treino (2013→hoje).
- **`MIN_MATCHES` continua 20** — com o Challenger, quem importa passa naturalmente, e o filtro segue
  protegendo contra Elo ruidoso.
- **Chave de Elo (reconciliação de nomes):** nome do modelo (`"Last F."`) para quem **casa** com o
  tour; **`fullName` do Sackmann** para o Challenger **puro**. Medido: 21% dos jogadores de Challenger
  casam (transitam), 79% são puros. Usar `fullName` pros puros **evita 13 grupos de merge errado** de
  irmãos/homônimos detectados (Petros vs Pavlos **Tsitsipas**, irmãos **Nakashima**, **Blanch**,
  Andres vs Andrej **Martin**…) e ainda deixa a UI mais bonita ("Titouan Droguet").

## Componentes

### 1. `pipeline/ingest-sackmann.js` (novo)

- `fetchSackmannChallenger(year, tour)`: baixa o CSV (`qual_chall` p/ ATP, `qual_itf` p/ WTA) do mirror,
  parseia com `parseCsv` (de `ingest.js`), **filtra `tourney_level === 'C'`**, e emite
  `{ dateInt, surface, winnerFull, loserFull }` (`dateInt` da coluna `tourney_date`; `surface` em
  minúsculas da coluna `surface` → "hard"/"clay"/"grass", igual ao modelo; descarta linha sem
  winner/loser/surface). Nomes ficam **crus** (fullName Sackmann) — a canonicalização é
  responsabilidade do consumidor, que tem o universo tennis-data.
- `loadSackmannChallenger(from, to, tour)`: itera anos, tolera ano faltando (warn), ordena por data.

### 2. `web/src/match-names.js` — canonicalização (estender)

- Nova `canonicalName(fullName, tourPlayers)`: `matchPlayer(fullName, tourPlayers)?.name ?? fullName`
  (casa → nome do modelo; não casa → fullName). Puro (testável).
- **Endurecer o matcher para nomes-do-meio**, hoje o ponto fraco: `parseFullName` assume "Primeiro
  Último" e junta tudo após o 1º token no sobrenome, então "Juan Pablo Varillas" não casa com
  "Varillas J.". Gerar candidatos de sobrenome (última token; duas últimas) e casar contra o modelo.
  Preservar a separação de irmãos/homônimos (garantida porque puros usam fullName).

### 3. `pipeline/train.js` — combinar fontes

- Carrega `loadTennisData(...)` (tour, nomes "Last F.") **+** `loadSackmannChallenger(...)` (fullName).
- `tourPlayers` = conjunto de nomes das partidas tennis-data. Para cada partida Sackmann,
  `winner = canonicalName(winnerFull, tourPlayers)` (idem loser).
- Concatena, ordena por `dateInt`, treina o Elo **exatamente como hoje** (`elo-engine.js` não muda).
- Novo campo por jogador **`level: 'tour' | 'challenger'`** (pela origem da maioria das partidas —
  rastrear via `Map name → {tour, chall}` no loop). O modelo passa a ter nomes mistos: "Alcaraz C."
  (tour) e "Titouan Droguet" (challenger puro) — esperado e aceitável.

### 4. `pipeline/matches.js` — scouting inclui Challenger

- Além do tennis-data, incluir as partidas Challenger (`level 'C'`), **canonicalizadas com o mesmo
  `canonicalName`**, pra forma/descanso/H2H funcionarem nos novos jogadores.
- **Medir o peso resultante.** `matches.json` hoje ≈ 1,4 MB (~15k partidas). Challenger ATP soma ~35k
  em 3 anos → risco de ~4–5 MB. Se passar de **~3,5 MB descomprimido**, mitigar: janela menor pro
  Challenger (ex. 2 anos) e/ou campos mais curtos. Documentar o que foi cortado (sem cap silencioso).

### 5. `web/app.js` — UI

- Novos jogadores entram sozinhos no seletor (já filtra por `active`).
- **Selo "Challenger"** no dossiê quando `p.level === 'challenger'` + nota curta de que o Elo desse
  nível é menos calibrado (mesma honestidade do resto do app).
- Exibição já usa `p.fullName || p.name` → challengers puros aparecem com nome completo.

## O que fica de fora

- CLV pré-jogo automático e backtest de valor em Challenger/125 (sem odds).
- Níveis abaixo do 125/Challenger (ITF W15–W100, futures) e a quali de tour como ponte (por ora).
- Enriquecer saque dos challengers via `serve-stats.js` (os CSVs têm as colunas) — **extensão futura**,
  fora do core.

## Riscos e mitigação

- **Nomes-do-meio (falso negativo do matcher)** → fragmenta um transitante. Mitigar endurecendo
  `parseFullName` + TDD com casos reais medidos. Não gera merge errado (pior caso: jogador duplicado,
  não dois virando um).
- **Peso do `matches.json`** → medir e mitigar (acima).
- **Elo cross-nível menos calibrado** → selo + nota; ajuste futuro (encolher Elo de poucos jogos, ou
  adicionar quali como ponte).
- **Colisões pré-existentes no tennis-data** (17, a maioria é o mesmo jogador grafado diferente:
  "Herbert P.H."="Herbert P.") → não piora; o fullName do Sackmann pode até ajudar a canonicalizar depois.

## Testes

- `match-names`: `canonicalName` (transitante → nome do modelo; puro → fullName; **irmãos separados**;
  **nome-do-meio** "Juan Pablo Varillas" casa "Varillas J."; acentos).
- `ingest-sackmann`: filtro `level === 'C'`, formato de saída, surface minúscula, `dateInt`, descarte
  de linhas incompletas (com CSV fixo, sem rede).
- `train`: jogador com partidas nas duas fontes tem **um** nó de Elo; `level` correto; irmãos distintos.
- `matches`: partidas Challenger presentes e canonicalizadas.

## Verificação

- `npm test` verde.
- `node pipeline/train.js ATP` local: `playerCount`/`activeCount` sobem (ATP ~700–900 ativos);
  **Droguet presente com ~169 partidas** e Elo plausível; **Tsitsipas Petros ≠ Pavlos**.
- `node pipeline/matches.js`: conferir peso e presença de partidas Challenger.
- App real (carregar `index.html` no navegador, não só módulos): novos jogadores no seletor, selo
  Challenger no dossiê, forma/H2H funcionando.
- Revisão adversarial. Deploy só com testes verdes + verificado (padrão do projeto: merge no main +
  Pages).
