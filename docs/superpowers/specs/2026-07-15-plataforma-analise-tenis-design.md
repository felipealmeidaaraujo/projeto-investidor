# Plataforma de Análise de Tênis — Especificação

> **Data:** 2026-07-15
> **Status:** Escopo aprovado pelo Felipe. Próximo passo: desenho final das telas → plano de implementação.

## Contexto

Evolução do Projeto Investidor. O caminho de **odds / apontamento de valor / Pinnacle** foi **descartado** por dois motivos honestos: (1) o mercado (a Pinnacle em especial) é eficiente demais para um modelo caseiro "achar valor"; (2) a API oficial da Pinnacle fechou (jul/2025) e os mirrors não-oficiais são frágeis.

A plataforma virou uma ferramenta de **análise pura**: reúne tudo sobre o confronto e os jogadores, sugere um plano de trade com racional e risco, e **o Felipe decide**. É o retorno ao núcleo do projeto ("preparação e leitura de cada jogo").

## O que é / o que não é

**É:** para os jogos do dia (ou um confronto simulado), o raio-x completo dos dois jogadores, a leitura do confronto, e um **plano de trade sugerido** (entrada, saída, alvo, stop) — sempre com o risco na cara. A decisão é do Felipe.

**Não é** (limites honestos):

- ❌ Não tem gestão de banca, stake ou saldo (só um registro leve de resultado, ver abaixo).
- ❌ **Não tenta bater o mercado.** O modelo Elo caseiro não prevê a probabilidade melhor que o mercado — quando discorda muito da odd real, é o modelo que está incompleto (não sabe de lesão, forma de véspera, motivação). O sistema nunca aponta "valor vs mercado".
- ❌ Não adivinha "se o jogador vai se poupar pro próximo torneio" (sem calendário futuro confiável).
- ❌ Padrão "começa atrás nos primeiros *games*" só existiria em Grand Slam (ponto-a-ponto). Fora dos Slams, a granularidade é **por set**.

## Princípio de UX: clareza total

Regra fixa: **nada pode gerar dúvida.** Sem gíria, sem anglicismo ("clutch"), sem abreviação enigmática ("34a", "#25"), sem selo abstrato ("confiança alta"). Todo rótulo é auto-explicativo, de preferência com o número por trás ("Forte no tie-break — ganha 68% deles"). Se precisa ser explicado, está errado.

## Telas

### Tela 1 — Jogos do dia → Confronto
Lista dos jogos do dia (A vs B) com torneio, superfície e horário. Cobre **ATP + WTA + Challenger**. Tocar abre a Análise de Confronto. Também permite **simular** qualquer confronto (escolher A, B e superfície).

### Tela 2 — Cards de jogadores
Navegar / buscar jogadores e ver o card completo de cada um.

## Conteúdo do card do jogador

| Grupo | Conteúdo |
|---|---|
| **Identidade** | Ranking oficial atual · canhoto/destro · altura · idade · país · cabeça de chave / qualifier |
| **Momento de carreira** | Em ascensão / no auge / em declínio — a partir de idade + tendência de ranking (onde estava há 12 meses vs. hoje) + forma recente |
| **Força** | Elo geral e por superfície (onde joga bem / mal) |
| **Saque & devolução** | % de pontos ganhos no saque · % na devolução · aces · % 1º saque |
| **Pressão nos games** | Sofre nos games de saque (BP enfrentados) · toma quebra · pressiona na devolução (BP criados) · quebra muito · salva break point |
| **Forma** | Fase atual (boa / ruim) · últimos jogos (adversário, superfície, resultado) |
| **Padrões de estilo** | Vira jogos · desanda após perder o 1º set · começa bem · aguenta 3 sets · forte no tie-break · partidas longas vs rápidas — **todos com o número explicando** |
| **Físico** | Descanso (dias parado) · fadiga (jogou ontem? duração do último jogo) |

Cada leitura vem com a base de dados ("o sistema tem X jogos deste jogador") — quando o histórico é pequeno, avisa que a leitura é mais frágil.

## Conteúdo da Análise de Confronto

- **Comparação lado a lado** de todas as métricas dos dois — incluindo **todas** as de pressão/quebra (o Felipe quer ver por onde o jogo pende).
- **H2H (confronto direto):** quem ganhou, em que superfície, com que placar. Enriquece sozinho a cada novo jogo.
- **Vantagem por dados:** leitura cruzando saque/devolução × superfície × fase.
- **Importância do torneio:** categoria (Slam/Masters/500/250/Challenger) · casa · pontos que defende.
- **Aviso de Elo defasado:** quando a trajetória diverge do Elo (ex.: jovem em ascensão vs. veterano em declínio), o sistema alerta que o modelo pode estar atrasado e que a odd de mercado provavelmente reflete melhor. Honestidade embutida — o sistema avisa quando desconfiar dele mesmo.

## Plano de trade sugerido

A conclusão da análise: um plano tático coerente, **não** um apontamento de valor.

- **Entrada + gatilhos de saída** derivados dos padrões (ex.: "entra a favor do Borges; green quando ele abrir a quebra / levar o 1º set; o risco é o Dimitrov virar — não segure demais").
- **Sempre com o cenário de risco explícito** e, quando couber, um contra-ataque.
- **Nunca** diz "vai dar certo" — é a opinião fundamentada de um analista lendo os números.

### Alvo e stop — o cálculo

O alvo (green) e o stop são o **tamanho do movimento da odd** em cada gatilho, não números arbitrários:

1. **A odd de entrada vem do MERCADO** — o Felipe informa (um toque; ele já está olhando o mercado). O modelo **não** dá a odd inicial, porque erra a probabilidade absoluta.
2. Um **motor de probabilidade por placar** (alimentado pela % de saque dos dois) calcula **de quanto** a chance de vitória — e portanto a odd — se move em cada estado (ganhou o 1º set → odd cai; tomou quebra → odd sobe). Essa é a parte que o modelo faz bem: a estrutura matemática do tênis.
3. O movimento é aplicado **sobre a odd real** informada → alvos e stops ancorados na realidade.
4. **A conta do empate:** o sistema mostra qual taxa de acerto torna aquele alvo/stop lucrativo no longo prazo (ex.: "alvo +8% e stop −10% → precisa acertar 56 de 100"). Matemática objetiva.

## Registro e aprendizado (loop de refinamento)

Para a parte de "% que torna lucrativo" sair da teoria:

- **Registro leve de resultado** (por toque, sem digitação): como o trade terminou (green/red/quanto), ligado ao **tipo de entrada**. Não é gestão de banca — é medição.
- O sistema acumula a **taxa de acerto real por setup** → depois de ~20-30 trades de cada tipo, diz quais entradas pagam ("favorito, green no 1º set: 61%, está valendo").
- **Calibração contínua:** compara a previsão do modelo vs. o resultado vs. a odd de mercado ao longo de centenas de jogos → ajusta o modelo pra reduzir erro sistemático (ex.: "subestima jovens em ascensão").

## Fundação de dados

Fontes **estáveis e gratuitas**, atualizadas todo dia pelo robô (GitHub Actions, já corrigido pra commitar de volta).

| Papel | Fonte | Observação |
|---|---|---|
| Histórico, rankings, stats por jogo | **Sackmann** | 49 campos/partida, inclui Challenger e WTA |
| **Grade do dia** | **Flashscore** | Cobre ATP + WTA + **Challenger**, e traz a **superfície** |
| **Fallback da grade** | **ESPN** | JSON estável; só tour. Se o Flashscore quebrar, cai aqui |

### Enriquecimento novo do pipeline
Capturar, por partida (dados já baixados, falta parsear): **placar por set** (`score`), **duração** (`minutes`), **break points dos dois lados** (`bpFaced`/`bpSaved`/`SvGms`), **nível do torneio** (`tourney_level`), **rankings atuais e históricos** (para a trajetória), **mão/altura/idade/país/seed**.

## Motor de probabilidade por placar (peça avançada)

Calcula a chance de vitória em cada estado do jogo (0-0, 1º set ganho, quebra sofrida…) a partir da % de pontos no saque de cada jogador — encadeamento ponto → game → set → partida. Usado **só para o movimento** da odd (alvo/stop), **nunca** para a probabilidade absoluta inicial (essa vem do mercado). É a peça mais sofisticada (era a "Fase 3" do plano original).

## Fora de escopo

- Odds automáticas / CLV / banca completa.
- Ajustar a probabilidade do modelo por forma/idade para tentar bater o mercado (o momento de carreira é **leitura**, não ajuste do modelo).
- Calendário futuro / "vai se poupar". Ponto-a-ponto fora dos Grand Slams.

## Componentes (alto nível)

- **`pipeline/`** — enriquecimento do histórico + derivação das métricas por jogador/confronto (`web/*.json`) + coletor de grade (Flashscore + ESPN fallback).
- **`web/`** — as duas telas + o plano de trade + o registro de resultado, consumindo os JSON.
- **Motor de probabilidade por placar** — módulo próprio, para o alvo/stop.

## Ordem de construção sugerida (a detalhar em writing-plans)

1. Enriquecer o pipeline de dados (placar, minutos, BP, rankings + históricos, metadados).
2. Derivar as métricas por jogador (forma, padrões de estilo, de break, trajetória) + H2H.
3. Coletor de grade Flashscore (+ ESPN fallback), com superfície.
4. Telas: card rico → análise de confronto → seção de jogadores — sob a regra de clareza total.
5. **Motor de probabilidade por placar → alvo/stop** (a peça avançada, em cima da base pronta).
6. Registro de resultados + calibração/aprendizado.
