# Frente A — Remover o diário, deixar a análise pura — Especificação

> **Data:** 2026-07-18
> **Status:** Desenho aprovado pelo Felipe. Próximo passo: plano de implementação (writing-plans).
> **Relacionado:** [2026-07-15-plataforma-analise-tenis-design.md](2026-07-15-plataforma-analise-tenis-design.md) — a visão da plataforma pura, cujas telas de diário nunca chegaram a ser removidas (a análise foi só *adicionada por cima*). Esta frente executa a remoção.

## Contexto e direção

O app hoje tem 5 abas: **Banca · Registrar · Histórico · Análise · Jogadores**. As três primeiras são um **diário de trades** (registro, CLV, ROI, banca, Kelly, anti-tilt) que o Felipe **não usa** — ele ainda não opera de verdade. A decisão é transformar o app numa **plataforma de análise pura** que direciona e guia o trade, cortando tudo que é diário.

**Direção acordada nesta sessão — "copiloto honesto, não piloto automático":** o modelo é bem calibrado mas **não bate o mercado** (tem *menos* informação que ele: é histórico puro, não vê lesão/notícia/clima). Logo o produto **não pode** ser um gerador de sinais de valor. O valor real dele é ser **o melhor preparador de confronto e provedor de contexto ao vivo** — deixa o *Felipe* mais afiado; a decisão é sempre dele. "Guiar" = guiar a atenção e o entendimento, **nunca** dar ordem de entrada.

O trabalho se decompõe em **3 frentes**, cada uma com seu próprio ciclo:

- **Frente A (esta spec):** enxugar — remover diário/login. Independente, baixo risco, destrava o resto.
- **Frente B (roadmap):** copiloto ao vivo — afiar a sobre-reação que já existe em "o mercado esticou X% vs. a âncora, veja o contexto" (sem comando ENTRE/SAIA). Não precisa de dado novo.
- **Frente C (roadmap):** medir swing de verdade — ler o placar do Sackmann (já baixado, hoje descartado) → derivar volatilidade → validar quais sinais pré-jogo a antecipam → Shortlist honesta. Prova "onde há volatilidade real", **não** "onde há lucro".

## O que esta frente faz

**Remove** as três telas de diário e tudo que só existe por causa delas — inclusive o **login/Supabase** (que servia só ao diário privado). O app passa a **abrir direto, sem conta**.

**Mantém e preserva intacto** o que guia o trade: **Análise** (jogos do dia, leitura do confronto, e o **trade ao vivo** — odd justa pelo placar + sobre-reação vs. Betfair) e **Jogadores** (dossiês).

Esta frente é **só remoção**: não muda comportamento da análise, não faz refactor não relacionado, não muda o tom de B/C (isso vem nas frentes B/C). Diff cirúrgico.

## Detalhamento

### 1. Navegação e boot
- **Duas abas:** Análise · Jogadores (na sidebar e na tabbar). Saem Banca, Registrar, Histórico.
- **Landing = Análise** (`currentScreen` inicia em `'analise'`).
- **App abre sem login.** Hoje o boot é travado por `auth.onAuthChange` (sessão → `bootApp`, senão → tela de login). Passa a bootar direto no carregamento. Somem `#auth-root`, a tela de auth e toda a inicialização de `store`/Supabase.
- Toggle de tema **continua** (fica no rodapé da sidebar, `#theme-toggle`). Some o botão "Sair da conta".

### 2. Arquivos deletados
**Web — módulos (8) e dado (1):**
`web/src/store.js`, `web/src/supabase.js`, `web/src/supabase-config.js`, `web/src/merge.js`, `web/src/stats.js`, `web/src/trade.js`, `web/src/finance.js`, `web/src/closings.js`, e `web/closings.json`.

**Testes (7):**
`tests/closings.test.js`, `tests/finance.test.js`, `tests/merge.test.js`, `tests/stats.test.js`, `tests/stoploss.test.js`, `tests/tilt.test.js`, `tests/trade.test.js`.

**Pipeline:** `pipeline/closings.js` (gerava `web/closings.json`, agora órfão).

**Preservados (não confundir):** `web/src/match-names.js` **fica** — apesar de `closings.js` usá-lo, o `player-search.js` (que fica) também usa (`normName`). Idem `web/src/inplay.js`, `analysis.js`, `tactics.js`, `scouting.js`, `career.js`, `age-curve.js`, `decay-curve.js`, `patterns-view.js`, `model-math.js`, `format.js` — todos da análise.

### 3. Cirurgia no `app.js` (~1705 → ~700 linhas)
**Imports removidos:** `store`, `supabase` (auth), `stats`, `trade`, `finance`, `closings`.

**Blocos removidos:**
- **Banca** inteira: `draft`/`defaultDraft`/`renderBanca`/`renderConfigForm`/`renderDashboard` e a **Calculadora de Kelly** (`openCalculator`).
- **Registrar** inteira: `reg`/`defaultReg`/`renderRegistrar`/`saveTrade`/`ensurePreProb`/`ensureModel`/`findModelPlayer`/`probKeyFor`/`regValid`/`oddStepper`.
- **Histórico** inteiro: `renderHistorico`, `openReview`, `segCard`/`clvSegCard`/`resultBadge`, `REVIEW_RED_OPTS`/`EMO`, `expandedId`.
- **Auth:** `renderAuth`, `traduzErroAuth`, wiring de `auth.onAuthChange`.
- `syncClosings`, `nowLocalISO`.
- Na Análise: o botão-ponte **"📝 Registrar trade neste confronto"** (`#btn-reg-conf`) e seu handler.
- `bootApp`: sem `store.initStore`/`subscribe`/`syncClosings` — só `renderScreen(currentScreen)`.

**Preservado:** Análise (`renderAnalise`/`renderFixtures`/`pickFixture`/`renderReading`/`renderLive`/`renderH2H`/`renderTactics`/`narrative`/`renderExplain`), Jogadores (`renderJogadores`), dossiê (`openDossier`), seletor (`openPlayerPicker`), teclado (`openKeypad`), fotos (`loadPhoto`), `wireChips`, troca de tour, `loadModel`/`loadToday`/`loadScoutMatches`.

**Helpers compartilhados — atenção:**
- `ring()` **fica** (o anel de % é usado na leitura do confronto e no ao vivo).
- `areaSpark`/`lineSpark`/`donutCard`/`pctOf` **saem** (só Banca/Histórico usavam).
- `clampOdd`/`todayLocal` **ficam** (teclado de odd e scouting/descanso usam).

### 4. Service worker, manifest, cron, nuvem
- **SW (`web/sw.js`):** sobe o cache `investidor-v2 → investidor-v3` para os clientes puxarem o shell novo (`app.js`/`index.html` mudam muito).
- **Manifest:** descrição "Apoio à decisão para trade de tênis" segue válida — **não muda**.
- **Cron (`.github/workflows/update-model.yml`):** remove o step *"Gerar fechamentos (CLV pré-jogo, tennis-data)"* (`node pipeline/closings.js`) e tira `web/closings.json` do `git add`. Assim o `npm test` do robô segue **verde** e ele para de publicar arquivo órfão.
- **Supabase (nuvem):** **nada é apagado remotamente.** As tabelas `trades`/`config` permanecem, só param de ser usadas. Pausar o projeto Supabase fica a critério do Felipe, depois — fora do escopo automatizado.

## Decisões tomadas
- **`app.js` continua em arquivo único**, remoção cirúrgica. Dividir em `analise.js`/`jogadores.js` é tentador (o arquivo encolhe muito), mas **não** se mistura refactor com remoção — diff limpo, menos risco. Fica como opção futura.
- **Landing = Análise.**

## Verificação (antes de declarar pronto)
1. `npm test` **verde** (com os 7 testes de diário já removidos; nenhum teste restante importa módulo deletado).
2. `grep` no `web/` por `store`/`supabase`/`auth`/`closings`/`finance`/`stats`/`makeTrade` → **zero** referências vivas.
3. Carregar `web/index.html` no navegador de verdade e percorrer:
   - **Análise:** escolher um jogo da grade → leitura do confronto → abrir "trade ao vivo" → mexer placar/quem saca/odd Betfair → ver odd justa e cartão de sobre-reação.
   - **Jogadores:** buscar → abrir dossiê (Elo, saque, padrões, forma/H2H, foto).
   - Console **sem erros**; nenhuma chamada a Supabase; app abre **sem** tela de login.

## Fora de escopo (é o roadmap guiado, não esta frente)
- **Frente B — copiloto ao vivo:** reescrever o tom da sobre-reação para contexto ("o mercado esticou X% vs. a âncora — veja o motivo"), sem comando de entrada. Honestidade > prescrição.
- **Frente C — medir swing:** parsear o `score`/break points do Sackmann → derivar volatilidade (set decidido, favorito perdeu set, densidade de quebra) → validar contra os sinais pré-jogo → Shortlist honesta.
- **Norte honesto de longo prazo:** quando o Felipe operar de verdade, medir as chamadas ao vivo contra o que o preço fez — a única prova real de que o sistema guia bem. Não é reconstruir o diário; é um registro mínimo de resultado, no futuro.
- Qualquer mudança de comportamento/visual da análise nesta frente. Divisão de `app.js`. Apagar recursos remotos do Supabase.

## Ordem de construção sugerida (a detalhar em writing-plans)
1. Deletar os 8 módulos web + `web/closings.json` + `pipeline/closings.js` + os 7 testes.
2. Cirurgia no `app.js` (imports, blocos de Banca/Registrar/Histórico/Auth, botão-ponte, boot).
3. Cirurgia no `index.html` (sidebar/tabbar → 2 abas, seções de tela, `#auth-root`, script).
4. `sw.js` (cache v3) + `update-model.yml` (remover step e `git add` de closings).
5. Verificação: `npm test` + varredura de referências + passagem pelo app real no navegador.
