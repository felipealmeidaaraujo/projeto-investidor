# Explicação das pontuações na tela de Análise — Design

- **Data:** 2026-07-14
- **Status:** Aprovado (brainstorming) — pronto para virar plano
- **Área:** `web/` (PWA) — tela de Análise, card de leitura do confronto

## Problema

No card de leitura (`renderReading` / `playerRow` em `web/app.js`) cada jogador aparece
como uma linha densa de jargão:

```
Elo 2085 · piso 2145 · força 2115  [forte] (+60)
```

Para quem não conhece o modelo, esses números são opacos: não se sabe **o que é**
cada um, **por que deu aquele valor** para aquele jogador, nem o que significam os
`(+60)` / `(−45)`. A ferramenta é de LEITURA/scout — se o usuário não entende os
números, ela não cumpre o papel.

## Objetivo

Dar legenda pedagógica aos números do card de leitura, cobrindo as duas perguntas:
1. **O que é** cada número (definição genérica).
2. **Por que aquele valor** para os jogadores daquele confronto (a conta real).

Sem poluir a linha de leitura e sem virar um textão.

## Escopo

**Dentro:**
- Uma faixa colapsável **"O que significam esses números?"** dentro do card de leitura,
  **fechada por padrão**, que ao abrir explica Elo, piso, força e o `(+/−)`.
- Dentro dela, um segundo nível **"Saiba mais: de onde vem o Elo"** (teoria do modelo).
- Texto misto: parte **estática** (o "o que é") + parte **dinâmica** (o "no jogo:", com
  os valores reais dos dois jogadores selecionados).

**Fora (por ora):**
- Explicações no **dossiê** (modal do jogador) — já tem rótulos próprios; fica como
  follow-up se o Felipe quiser depois.
- Renomear "piso"/"força" — **decidido manter** os nomes atuais.
- Explicar as stats de saque/devolução e as tags do dossiê.

## Design da solução

### Onde aparece

No `renderReading()`, **depois** da narrativa (`.reading-note`) e **antes** do botão
"Trade ao vivo". Ordem visual do card:

1. Favorito + % (já existe)
2. Linhas dos dois jogadores (já existe)
3. Narrativa (já existe)
4. **[NOVO]** faixa "O que significam esses números?" (fechada)
5. Botão "Trade ao vivo" (já existe)

### Componente: faixa colapsável

- Botão/cabeçalho tocável (bom alvo de toque, ≥44px de altura), com seta `▸`/`▾`.
- Estado aberto/fechado guardado em `anal.explainOpen` (persiste entre re-renders do
  `renderAnalise`). "Saiba mais" tem estado próprio `anal.moreOpen`.
- Ao abrir: mostra os 4 blocos. Cada bloco = **termo** (negrito) + **o que é** (cinza) +
  **no jogo:** (com os números reais em destaque).

### Conteúdo dos 4 blocos (texto aprovado)

Valores dinâmicos entre `«»`. As frases "no jogo" são geradas a partir do resultado de
`analyzeMatch` (ver "Dados usados").

**1. Elo — o nível geral**
> Nota única que resume o jogador juntando todos os jogos: vencer sobe, perder desce, e
> bater um forte vale mais que bater um fraco. Quanto maior, melhor.
> *No jogo:* «B» «eloB» · «A» «eloA» — no geral, «quem_tem_elo_maior» vem um pouco à frente.

**2. Piso — o Elo só nessa superfície**
> A mesma conta, mas contando só os jogos naquela superfície. Mostra quem rende diferente
> conforme o piso (tem quem seja fera no saibro e sofra na grama).
> *No jogo:* No «superfície»: «quem_tem_piso_maior» «pisoMaior» · «outro» «pisoOutro» —
> «"a mão vira." se o favorito por piso ≠ favorito por Elo geral, senão "confirma o favorito."»

**3. Força — a nota que decide a %**
> Média do Elo geral com o piso (metade de cada). Nem só o geral, nem só a superfície: um
> meio-termo, pra valorizar o especialista sem exagerar num piso.
> *No jogo:* «A» «forçaA» · «B» «forçaB». Por isso, no «superfície» o favorito é
> **«favorito» — «favProb»%**«, mesmo tendo Elo geral menor. se aplicável».

**4. (+X) e (−Y) — acima ou abaixo do próprio nível**
> É o piso menos o Elo geral: o quanto o jogador rende a mais (+) ou a menos (−) nessa
> superfície, comparado com **ele mesmo**.
> *No jogo:* «A» «(+deltaA) tagA»; «B» «(deltaB) tagB».
> ⚠️ É relativo a ele mesmo, não é ranking. Um top pode ter (−40) na grama e ainda assim
> ser muito melhor que um jogador fraco.

### Saiba mais: de onde vem o Elo (estático)

- Todo jogador começa em **1500** e o número anda a cada partida.
- A distância entre dois Elos vira a probabilidade: cada **~400 pontos** de vantagem ≈
  **91%** pro mais forte; Elo igual = 50/50.
- Os primeiros jogos mexem mais no número; com o tempo ele fica estável.
- Menos de ~15 jogos na superfície: o piso ainda não é confiável — o app marca
  **poucos dados**.
- Recalculado **todo dia** com os jogos mais recentes.

(Valores fiéis ao motor: `INITIAL=1500`, escala 400 em `expectedScore`, `kFactor` decrescente,
`surfaceWeight=0.5` → força = média simples; limiar de "poucos dados" = 15 jogos na superfície.)

## Dados usados

Tudo já vem de `analyzeMatch(a, b, surface, model)` (`web/src/analysis.js`):

| Campo | Origem | Uso na faixa |
|---|---|---|
| `r.a.elo`, `r.b.elo` | Elo geral | bloco Elo |
| `r.a.surfaceElo`, `r.b.surfaceElo` | Elo da superfície (pode ser `null`) | bloco Piso |
| `r.a.blended`, `r.b.blended` | força (média) | bloco Força |
| `r.a.surfaceRead.{tag,delta,surfMatches}` | tag + delta | bloco (+/−) |
| `r.favorite`, `r.favoriteProb`, `r.surface` | favorito | blocos Piso e Força |

Limiares de `surfaceRead` (já existentes): `surfMatches < 15` → `poucos dados`;
`delta ≥ 40` → `forte`; `delta ≤ −40` → `fraco`; senão `neutro`.

## Estados de borda (obrigatório tratar)

1. **Piso ausente** (`surfaceElo == null`): a força usa só o Elo geral. O bloco Piso diz
   que não há jogos suficientes naquela superfície pra esse jogador e mostra "—"; o bloco
   força explica que caiu pro Elo geral.
2. **Poucos dados** (`tag === 'poucos dados'`): o bloco (+/−) avisa que o piso vem de
   poucos jogos, então o `(+/−)` ainda não é confiável.
3. **Empate no Elo geral** (`eloA === eloB`): "estão empatados no Elo geral".
4. **Sem inversão** (favorito por piso == favorito por Elo geral): a frase do bloco Piso
   diz "confirma o favorito" em vez de "a mão vira".
5. **Neutro** (`tag === 'neutro'`, `delta` pequeno): "joga em linha com o próprio nível
   nessa superfície".

## Arquitetura / onde mexer

- `web/src/analysis.js`: **nova função pura** `buildReadingExplanation(r)` que recebe o
  resultado de `analyzeMatch` e devolve as 4 frases dinâmicas ("no jogo:") + flags
  (quem está à frente, houve inversão, poucos dados). Pura e testável.
- `web/app.js`: `renderReading()` insere a faixa (HTML) usando os rótulos estáticos +
  as frases de `buildReadingExplanation`. Wiring do toggle em `anal.explainOpen` /
  `anal.moreOpen`.
- `web/styles.css`: classes novas para a faixa (`.explain`, `.explain-head`, `.explain-blk`,
  etc.), reaproveitando variáveis e o padrão visual existente (pills, `field-hint`).

Texto estático (definições + "Saiba mais") pode viver como constantes em `app.js` ou num
pequeno módulo; frases dinâmicas vêm da função pura.

## Testes

- `tests/analysis.test.js`: cobrir `buildReadingExplanation` para:
  - caso normal com inversão (Sinner Elo geral maior, Alcaraz favorito no piso);
  - caso sem inversão;
  - empate no Elo geral;
  - `surfaceElo` nulo (piso ausente);
  - `tag === 'poucos dados'`;
  - sinais do delta (+, −, neutro).
- A UI (toggle) fica em teste manual no `npm run dev`.

## Acessibilidade / mobile

- Faixa e "Saiba mais" são `<button>` com `aria-expanded`; alvos de toque ≥44px.
- Fechada por padrão pra não empurrar o botão "Trade ao vivo" pra baixo.
- Contrastes seguindo a paleta atual (texto `--muted` para o "o que é").

## Fora de escopo / futuro

- Mesma faixa (ou ícones `?`) no **dossiê**.
- Repensar os nomes "piso"/"força" (mantidos por ora).
- Explicar métricas de saque/devolução.
