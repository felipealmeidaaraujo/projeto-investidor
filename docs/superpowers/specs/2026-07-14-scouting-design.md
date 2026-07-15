# Scouting: forma recente, dias de descanso e H2H — Design

**Data:** 2026-07-14
**Projeto:** Investidor (PWA de trade de tênis na Betfair) — última feature do roadmap

## Objetivo

Dar contexto de scouting no app: **forma recente** e **dias de descanso** no dossiê do jogador, e
**head-to-head** (confrontos diretos) no card do confronto da aba Análise.

## Decisões travadas (brainstorm 2026-07-14)

- **Forma recente:** últimas **10** partidas.
- **H2H:** janela recente (~**3 anos**) — app leve (~600 KB, fetch único cacheável).
- **Fonte:** `tennis-data.co.uk` (a mesma do modelo/closings) — nomes já no formato do modelo
  ("Sinner J."), casam direto sem `match-names`.
- **Arquitetura:** o robô publica **`web/matches.json`** (histórico de partidas leve); o app baixa
  uma vez e **deriva forma/descanso/H2H no cliente**. Não incha o modelo nem mexe no treino.

## Componentes

### 1. `pipeline/matches.js` (novo) — gera `web/matches.json`

Clone do `pipeline/closings.js`, mas janela ~3 anos e campos mínimos. Usa `fetchTennisDataYear`
iterando os anos de `(hoje − ~3 anos)` até o ano atual, ATP+WTA. Escreve
`web/matches.json = { generatedAt, count, matches: [{ date:YYYYMMDD, surface, tour, winner, loser }] }`
ordenado por data. Filtra `dateInt >= cutoff`, descarta sem winner/loser. Não sobrescreve se vazio
(mesmo cuidado do closings). Passo novo no `update-model.yml`. Gerar um `matches.json` inicial e
commitar (pra existir antes do 1º cron).

### 2. `web/src/scouting.js` (novo) — derivações puras (testáveis)

- `recentForm(matches, name, n = 10)` → `{ wins, losses, results: [{ date, won, surface, opp }] }`
  (partidas do jogador, mais recentes primeiro, no máximo `n`; `won = winner === name`).
- `restDays(matches, name, asOfYmd)` → dias entre a **última** partida do jogador e `asOfYmd`
  (inteiro), ou `null` se ele não tem partida no arquivo.
- `headToHead(matches, aName, bName)` →
  `{ total, aWins, bWins, bySurface: { [surface]: { a, b } }, last: { date, winner, loser, surface } | null }`
  (partidas em que os dois se enfrentaram, qualquer ordem).

Helpers locais `ymdToDate(int)` / `daysBetween(int,int)` (o mesmo padrão do closings).

### 3. `web/app.js` — carregar `matches.json` + UI

- **Carregamento sob demanda:** estado `scoutMatches` (null até carregar). `loadScoutMatches()`
  (fetch `matches.json`, guarda, re-renderiza) disparado ao abrir a aba **Análise** (fire-and-forget).
- **Dossiê** (`openDossier`, `draw()`): nova seção "Forma & descanso" entre as tags e "Elo por
  superfície". Forma = tira de V/D (últimos 10, mais recente à esquerda) + placar "8V 2D"; descanso
  = "descansado X dias" / "jogou ontem". Se `scoutMatches` ainda não chegou: "carregando…". Se o
  jogador não tem partidas no arquivo: "sem partidas recentes".
- **Leitura do confronto** (`renderReading`): bloco **H2H** dentro do `.reading-card`, entre
  `.reading-players` e `.reading-note` — "H2H: A {aWins} × {bWins} B · {n} no {superfície} · último:
  {vencedor} venceu". Se `total === 0`: "sem confrontos diretos (nos últimos 3 anos)".

## Casamento de nomes

Direto por `player.name` (formato "Sobrenome I."), que é o mesmo do `matches.json` (tennis-data).
Sem `match-names`. Jogador com nome digitado à mão fora do modelo simplesmente não casa (sem
scouting) — mas dossiê/H2H só são acionados a partir de jogadores do modelo.

## Edge cases

- `scoutMatches` não carregado / fetch falhou: seções mostram "carregando…" e some se o fetch falhar
  de vez (sem quebrar o dossiê/leitura).
- Jogador sem partidas no arquivo (novato/inativo): forma vazia, descanso null → textos neutros.
- H2H sem confrontos: total 0 → "sem confrontos diretos".
- Data: `asOfYmd` = data atual do cliente (YYYYMMDD).

## Testes (`tests/scouting.test.js`)

`recentForm` (ordem, limite n, won correto, opp/surface), `restDays` (dias corretos, null sem
partida), `headToHead` (contagem por lado e superfície, qualquer ordem, `last`, total 0).

## Verificação

`npm test` verde; `node pipeline/matches.js` local (gera `web/matches.json`, conferir volume/formato);
preview isolado das derivações com o `matches.json` real; app real carrega sem erro. Revisão
adversarial. Deploy com testes verdes + verificado.

## Fim do roadmap

Com esta feature, o roadmap original (disciplina → análise → motor ao vivo → jogos do dia →
dossiês → CLV/valor ao vivo → sobre-reação → scouting) fica completo.
