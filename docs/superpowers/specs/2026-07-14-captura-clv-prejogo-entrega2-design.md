# Captura automática do CLV pré-jogo (Entrega 2) — Design

**Data:** 2026-07-14
**Projeto:** Investidor (PWA de trade de tênis na Betfair)

## Objetivo

Preencher **sozinho** o CLV pré-jogo dos trades marcados como **pré-jogo** (punter), sem o Felipe
digitar a odd de fechamento. Alimenta o card **secundário** "CLV pré-jogo" que já existe no
Histórico (da fase 1).

## Decisões travadas (brainstorm 2026-07-14)

- **Fonte:** `tennis-data.co.uk` (odd de fechamento da **Pinnacle** = PSW/PSL, grátis, cobre todos os
  torneios). Aceito o **lag de dias** (planilha semanal). The Odds API histórica foi descartada (paga).
- **Privacidade:** o robô (GitHub Actions, público) **não** acessa os trades do Felipe (Supabase, RLS).
  O robô publica só **dados de mercado**; o **cliente** (app logado) cruza com os próprios trades.
- **Cobertura:** só **Match Odds** tem fechamento público. Só trades `entryType === 'pre'`.
- **Automático:** o cruzamento roda no **boot** do app; um toast avisa quantos foram preenchidos.
- **back/lay:** o CLV usa `clvPct(oddEntry, oddClose, dir)` (já existe, com direção).

## Arquitetura (dois lados)

```
Robô (GitHub Actions, diário)                 App (cliente, logado)
  pipeline/closings.js                          web/app.js syncClosings() no boot
  baixa tennis-data (ATP+WTA, ano atual)        fetch('closings.json')
  filtra últimas ~10 semanas                    cruza com trades pré-jogo sem oddClose
  escreve web/closings.json  ───publica───►     preenche oddClose + clv (store.updateTrade)
```

## Componentes

### 1. `web/src/match-names.js` — `matchesModelName(fullName, modelName)`

Nova função pura (exportada) que diz se um **nome completo** ("Carlos Alcaraz", do trade) e um
**nome de modelo** ("Alcaraz C.", da tennis-data) são o mesmo jogador — reusa o `parseFullName`/
`parseModelName` que já existem no arquivo (sobrenome normalizado + inicial). É a peça que casa o
confronto do trade com winner/loser da planilha.

### 2. `web/src/closings.js` — casamento puro (testável)

- **`ymd(dateStr)`** → inteiro `YYYYMMDD` a partir de `t.date` (ISO). Para comparar com `closing.date`.
- **`matchClosing(trade, closings, { windowDays = 4 })`** → `{ oddClose }` | `null`
  - Só considera `trade.market === 'Match Odds'`, `trade.entryType === 'pre'`, com `players.a/b` e
    `side`, e **sem** `oddClose`.
  - Acha o closing cujo `{winner,loser}` casa `{players.a, players.b}` (qualquer ordem, via
    `matchesModelName`) e cuja data está dentro da janela (`|ymd(trade.date) − closing.date| ≤ windowDays`).
    Se houver mais de um, o de data mais próxima.
  - **Escolhe a odd do lado certo:** o jogador do `side` — se foi o `winner` → `oddClose = psw`;
    se foi o `loser` → `oddClose = psl` (fallback `maxw`/`maxl` quando Pinnacle ausente).
- **`closingPatches(trades, closings)`** → `[{ id, oddClose, clv }]` só dos trades que casaram
  (`clv = clvPct(oddEntry, oddClose, dir)`). Ignora quem já tem `oddClose`.

### 3. `pipeline/closings.js` — gera `web/closings.json`

Usa `fetchTennisDataYear(anoAtual, 'ATP'|'WTA')` (já existe em `ingest-tennisdata.js`), filtra as
partidas das últimas ~10 semanas (`dateInt >= hoje − 70 dias`), e escreve
`web/closings.json = { generatedAt, count, matches: [{ date, surface, tour, winner, loser, psw, psl, maxw, maxl }] }`.
Só match winner odds (é o que a tennis-data traz). Roda em Node no runner (pode usar `new Date()`).
Resiliente: se um ano/tour falhar no download, ignora (como o `loadTennisData` já faz).

### 4. `.github/workflows/update-model.yml` — passo novo

Adicionar, antes do `upload-pages-artifact`, um passo `node pipeline/closings.js` que regenera
`web/closings.json` no runner (como o `today.json`/`model.json` já são). Sem commit — publicado junto.
Gerar também um `web/closings.json` inicial local (rodando o script uma vez) e commitar, pra já
existir antes do primeiro cron.

### 5. `web/app.js` — `syncClosings()` no boot

Depois de `store.initStore()` em `bootApp()`, chamar `syncClosings()` (fire-and-forget):
- Filtra os trades pendentes (Match Odds, `entryType 'pre'`, com `side`, sem `oddClose`).
- Se nenhum, retorna. Senão `fetch('closings.json')` (silencioso se 404/erro).
- `closingPatches(pending, matches)` → para cada patch, `store.updateTrade(id, patch)` (sobe pro
  Supabase e re-renderiza via subscribe).
- Toast "CLV preenchido em N trade(s)" quando `N > 0`.

## Fluxo de dados

Robô diário → `web/closings.json` (público). App no boot → cruza trades pré-jogo pendentes →
`store.updateTrade` preenche `clv` → o card secundário "CLV pré-jogo" no Histórico passa a mostrar
esses trades. Lag: alguns dias (a planilha da semana só sai depois da semana fechar).

## Edge cases

- **Sem jogo casado** (nome não bate, data fora da janela, torneio não coberto): trade fica sem
  `clv`; nada acontece (silencioso). Tenta de novo em boots futuros (quando a planilha atualizar).
- **`closings.json` ausente** (antes do 1º robô / offline): `syncClosings` sai silencioso.
- **Trade ao vivo** (`entryType 'live'`): ignorado (tem `liveValue`, não CLV pré-jogo).
- **Nome digitado à mão** que não casa o formato: não casa; sem CLV.
- **Pinnacle ausente numa linha:** usa `maxw`/`maxl`; se ambos ausentes, não casa.
- **Já tem `oddClose`** (preenchido à mão): não sobrescreve.

## Testes (`node --test`)

- `match-names.test.js`: `matchesModelName` — casa "Carlos Alcaraz"↔"Alcaraz C.", rejeita jogador
  diferente, tolera acentos.
- `closings.test.js`: `matchClosing` casa por nomes+data (qualquer ordem), escolhe `psw`/`psl` pelo
  `side`, respeita a janela, fallback `max`, ignora ao vivo / já-com-oddClose / fora de cobertura;
  `closingPatches` calcula `clv` com `dir` (lay invertido).

## Verificação

`npm test` verde; rodar `node pipeline/closings.js` local (gera `web/closings.json`, conferir formato
e algumas linhas); preview isolado do casamento com trades de exemplo + um `closings.json` de exemplo
(confere o `clv` calculado). Revisão adversarial do diff. Deploy só com testes verdes + verificado.

## Fora de escopo

Sobre-reação no trade ao vivo e scouting (entregas seguintes).
