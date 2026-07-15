# Sobre-reação no trade ao vivo — Design

**Data:** 2026-07-14
**Projeto:** Investidor (PWA de trade de tênis na Betfair)

## Objetivo

Transformar a dica passiva que já existe no Trade ao vivo ("se o mercado estiver longe da odd
justa, pode ser sobre-reação") num **detector acionável**: o Felipe informa a odd que a **Betfair**
está pagando ao vivo, o app compara com a **odd justa** (do motor `inplay.js`) e aponta se há
sobre-reação, de que tamanho e onde está o valor (back/lay).

## Decisões travadas (brainstorm 2026-07-14)

- **Fonte da odd de mercado:** o **Felipe digita** (Betfair sem API no BR; ele vê na tela). Reusa o
  teclado de odd (`openKeypad mode:'odd'`).
- **Limiares (conservadores):** |divergência| ≥ **15%** leve · **25%** moderada · **40%** forte.
  Abaixo de 15% = "em linha".
- **Sem sinal:** mostrar o selo neutro **"Odd em linha com o justo"** (confirma que checou).
- **Ressalva honesta (na UI):** "justo" é o *nosso* modelo (termômetro, não verdade; o mercado pode
  saber de algo). Vale mais em exageros bruscos por 1 game/set.

## Lógica (pura, testável)

`overreaction(fairOdd, marketOdd)` em `web/src/inplay.js`:
- Inválido (`fairOdd`/`marketOdd` não > 1) → `null`.
- `divPct = (marketOdd / fairOdd − 1) × 100`.
  - `divPct > 0`: mercado paga **mais** que o justo → **subestima** o jogador → **BACK** nele tem valor.
  - `divPct < 0`: mercado paga **menos** → **superestima** → **LAY** nele.
- `level`: `|divPct| ≥ 40` "forte" · `≥ 25` "moderada" · `≥ 15` "leve" · senão `null` (em linha).
- Retorna `{ divPct, level, back: divPct > 0 }`.

## UI — no `renderLive` (aba Análise → Trade ao vivo)

Abaixo da "Odd justa AO VIVO" (que já mostra a justa de cada jogador), adicionar:
- **Dois campos digitáveis** "Odd na Betfair agora" — um por jogador (`anal.live.mktA`, `mktB`),
  opcionais, via `openKeypad mode:'odd'`.
- Para cada jogador com odd informada, calcular `overreaction(1/prob, mkt)` e mostrar a divergência.
- **Card de veredito** (o sinal mais forte entre os informados):
  - Se algum tem `level`: card **verde** (é oportunidade) — "SOBRE-REAÇÃO {level} · {±X%} · valor em
    {BACK no A | LAY no A}", com uma linha explicando (mercado paga X, justo Y).
  - Se há odd informada mas nenhum atinge 15%: selo neutro "Odd em linha com o justo".
  - Se nada informado: hint "Informe a odd que a Betfair está pagando pra checar sobre-reação".

Nenhum dado novo é persistido no trade (é uma ferramenta de leitura ao vivo, como o resto do
Trade ao vivo). Se o Felipe registrar a entrada, o fluxo de registro (valor ao vivo) já cobre.

## Edge cases

- Odd de mercado só de um jogador: avalia só esse.
- `prob` 0/1 (placar decidido) → `fairOdd` Infinity → `overreaction` retorna `null` (não > 1); sem card.
- Odd de mercado inválida (≤ 1) ignorada.
- Empate de intensidade entre A e B: pega o de maior `|divPct|` (determinístico).

## Testes (`tests/inplay.test.js`)

`overreaction`: back (div>0) e lay (div<0); os três níveis nos limiares 15/25/40; "em linha" (<15% →
level null); inválidos (fairOdd≤1, marketOdd null/≤1 → null).

## Verificação

`npm test` verde; preview isolado da lógica (divergências e níveis) via `get_page_text`; app real
carrega sem erro. Revisão adversarial. Deploy com testes verdes + verificado.

## Fora de escopo

Scouting (forma recente / dias de descanso / H2H) — próxima entrega.
