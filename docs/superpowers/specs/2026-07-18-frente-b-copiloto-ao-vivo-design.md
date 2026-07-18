# Frente B — Copiloto ao vivo (cartão honesto + "o que observar") — Especificação

> **Data:** 2026-07-18
> **Status:** Desenho aprovado pelo Felipe (delegou a escolha visual). Próximo passo: plano de implementação.
> **Direção:** [[direcao-copiloto-honesto]] — guiar atenção e entendimento, **nunca** dar ordem de entrada.
> **Relacionado:** [2026-07-18-frente-a-remocao-diario-design.md](2026-07-18-frente-a-remocao-diario-design.md) (a plataforma enxuta em que isto assenta).

## Contexto

Depois da Frente A, o app é análise pura. A Frente B **afia o momento ao vivo** — onde está o único edge plausível (a sobre-reação do mercado). Duas peças, ambas sem dado novo (usam o que o modelo já tem):

1. **Cartão ao vivo reformulado** — hoje ele **manda** ("Valor em BACK no Rublev"); vira uma **observação** pra o Felipe julgar.
2. **"O que observar"** — bloco novo na leitura do confronto que, do perfil de saque/pressão/estilo, diz **quais eventos importam pra essa dupla e por que o mercado reage a eles**.

O motor de cálculo (`overreaction`, `liveFairOdds` em `web/src/inplay.js`) **não muda** — é reformulação de linguagem/postura e um bloco novo derivado de dados que já existem.

## Peça 1 — Cartão ao vivo reformulado

**Hoje** (`renderLive` em `web/app.js`, o `orCard`): título em caixa-alta "⚡ SOBRE-REAÇÃO FORTE · +42%", **"Valor em BACK no Rublev"**, e a explicação.

**Problema:** "Valor em BACK" é um comando que implica um edge executável que o modelo não pode garantir; "SOBRE-REAÇÃO" já afirma que o mercado errou (às vezes ele está certo e viu algo que o placar não conta).

**Novo desenho (direção "odds lado a lado"):**
- **Título:** `Mercado esticado no {jogador}` quando a Betfair paga **acima** do justo (`divPct > 0`); `Mercado curto no {jogador}` quando paga **abaixo** (`divPct < 0`). Sem BACK/LAY, sem "valor".
- **Selo âmbar** com a magnitude (`+42%` / `−28%`) — âmbar (atenção), não verde/vermelho (que sugeririam apostar/não apostar).
- **Dois blocos de número:** `Betfair paga {mkt}` · `Âncora justa {fair}` — os dois números que o trader compara, em destaque.
- **Uma linha honesta:** `Pode ser exagero — confira o motivo. Você decide.` (a honestidade cabe numa linha, não num parágrafo).
- **Sem** o ⚡ e sem caixa-alta (sugeriam "oportunidade"); tom sóbrio, coerente com o resto do app.

**Estados** (a lógica de faixas em `inplay.js` fica intacta — `forte ≥40%`, `moderada ≥25%`, `leve ≥15%`):
- Divergência com faixa (≥15%): o cartão acima.
- Divergência <15% (odds informadas, em linha): `Odd em linha com a âncora — sem esticão relevante neste placar.`
- Odds da Betfair não informadas: mantém o convite atual ("Informe a odd da Betfair pra medir…").

*(Opcional, leve: a intensidade da faixa pode colorir o selo em tons de âmbar — leve/moderada/forte — mas sem virar verde/vermelho.)*

## Peça 2 — "O que observar"

Bloco novo na **leitura do confronto** (`renderReading`), distinto da "💡 Leitura pro trade" (que é a leitura tática do jogo). Aqui é **o que vigiar no mercado**: 2–3 linhas, cada uma um evento do jogo + por que o mercado costuma reagir — tudo **descritivo** (fato do perfil) e **honesto** (não "vai ter swing"; isso é a Frente C, que mede).

### Lógica de geração (novo módulo `web/src/watch.js`, puro e testável)

`whatToWatch(a, b, tour, favoriteName)` → array de `{ icon, text }` (no máx. 3 linhas), escolhendo os sinais mais fortes do confronto. Usa `serveBand(tour, key, value)` (já existe, dá o contexto relativo ao circuito: abaixo/média/acima/elite) e os `style`/`pressure` dos jogadores. **Regras** (aplica quando o dado existe; Challenger sem `serve` simplesmente pula as regras de saque):

1. **Favorito segura bem o saque** — se o `bpSavedPct` **ou** `servePtsWonPct` do favorito é `acima`/`elite`:
   *"{Fav} segura bem o saque (salva {N}% dos break points). Uma quebra nele é rara — quando vem, o mercado costuma exagerar."*
2. **Jogo quebra-quebra** — se o `returnPtsWonPct` dos **dois** é `acima`/`elite` (ou os saques são fracos):
   *"Os dois devolvem acima da média: espere várias quebras e a odd balançando ao longo do set."*
3. **Estilo de virada/queda** — a partir dos flags de `style` (ex.: "vira jogos", "desanda após perder o 1º set"):
   *"{X} costuma virar de trás — se cair um set, o mercado pode exagerar contra ele."* / *"{X} costuma desandar após perder o 1º set."*
4. **Best-of-5** (só se o confronto for BO5): *"Melhor de 5: um set atrás ainda é muito jogo — o mercado às vezes precifica cedo demais."*

Ordena por força do sinal (elite > acima; ambos os lados > um lado) e corta em 3. Se **nenhum** sinal forte, mostra 1 linha neutra honesta (ex.: *"Perfis equilibrados no saque e na devolução — sem um gatilho de mercado óbvio nesta dupla."*) — nunca inventa.

**Rodapé honesto:** `Leitura dos perfis — o que costuma mexer o mercado, não garantia.`

## UX / estilo

- Reaproveitar o CSS do app (`reading-card`, `pill`, `field-hint`, blocos de número existentes); acrescentar poucas classes. Tom sóbrio, sem o ⚡.
- Emoji só na medida do que o app já usa (a leitura tática usa 💡; o "o que observar" pode usar 👁️). Nada de caixa-alta.
- Verificar em **claro e escuro** e em largura mobile (o painel é uma coluna estreita).

## Fora de escopo

- Não é a **Shortlist** nem medir swing (Frente C). O "o que observar" aqui é **qualitativo/descritivo**, não medido.
- Não altera `overreaction`/`liveFairOdds` (o cálculo). Só a apresentação e o bloco novo.
- Sem semáforo ENTRE/ESPERE/SAIA, sem "valor", sem alvo/stop numérico.

## Ordem de construção (a detalhar em writing-plans)

1. `web/src/watch.js` + `tests/watch.test.js` (a lógica pura das regras).
2. `renderReading`: renderizar o bloco "o que observar".
3. `renderLive`: reformular o `orCard` (título direcional, selo âmbar, blocos de número, linha honesta).
4. CSS em `web/styles.css` para os dois.
5. Verificar no navegador (claro/escuro, um confronto com sobre-reação simulada + o "o que observar").
