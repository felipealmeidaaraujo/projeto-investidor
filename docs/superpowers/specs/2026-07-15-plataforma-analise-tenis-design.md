# Plataforma de Análise de Tênis — Especificação

> **Data:** 2026-07-15
> **Status:** Escopo aprovado pelo Felipe. Próximo passo: desenho final das telas → plano de implementação.

## Contexto

Evolução do Projeto Investidor. O caminho de **odds / apontamento de valor / Pinnacle** foi **descartado** por dois motivos honestos: (1) o mercado (a Pinnacle em especial) é eficiente demais para um modelo caseiro "achar valor"; (2) a API oficial da Pinnacle fechou (jul/2025) e os mirrors não-oficiais são frágeis.

A plataforma é uma ferramenta de **análise pura**: reúne tudo sobre o confronto e os jogadores, dá uma leitura tática do jogo, e **o Felipe decide** o trade.

## O que é / o que não é

**É:** para os jogos do dia (ou um confronto simulado), o raio-x completo dos dois jogadores, a leitura do confronto, e uma **sugestão tática em palavras** (por onde o jogo pende, um caminho possível, o risco). A decisão é do Felipe.

**Não é** (limites honestos):

- ❌ Não tem gestão de banca, stake ou saldo.
- ❌ **Não calcula alvo/stop numérico** nem "de quanto a odd vai se mover" (exigiria um motor de probabilidade por placar — cortado por complexidade e valor incerto).
- ❌ **Não registra resultados de trades** nem mede taxa de acerto (cortado por complexidade — reintroduzia um diário).
- ❌ **Não tenta bater o mercado.** O modelo Elo não prevê melhor que o mercado — quando discorda muito da odd real, é o modelo que está incompleto. Nunca aponta "valor vs mercado".
- ❌ Não adivinha "se o jogador vai se poupar pro próximo torneio". Padrão "começa atrás nos primeiros *games*" só em Grand Slam.

*(Alvo/stop e registro ficaram de fora agora; são plugáveis depois se fizerem falta — decisão reversível.)*

## Princípio de UX: clareza total

Regra fixa: **nada pode gerar dúvida.** Sem gíria, sem anglicismo ("clutch"), sem abreviação enigmática ("34a", "#25"), sem selo abstrato. Todo rótulo é auto-explicativo, de preferência com o número por trás ("Forte no tie-break — ganha 68% deles"). Se precisa ser explicado, está errado.

## Telas

### Tela 1 — Jogos do dia → Confronto
Lista dos jogos do dia (A vs B) com torneio, superfície e horário. Cobre **ATP + WTA + Challenger**. Tocar abre a Análise de Confronto. Também permite **simular** qualquer confronto (escolher A, B e superfície).

### Tela 2 — Cards de jogadores
Navegar / buscar jogadores e ver o card completo de cada um.

## Conteúdo do card do jogador

| Grupo | Conteúdo |
|---|---|
| **Identidade** | Ranking oficial atual · canhoto/destro · altura · idade · país · cabeça de chave / qualifier |
| **Momento de carreira** | Em ascensão / no auge / em declínio — a partir de idade + tendência de ranking (há 12 meses vs. hoje) + forma recente |
| **Força** | Elo geral e por superfície (onde joga bem / mal) |
| **Saque & devolução** | % de pontos ganhos no saque · % na devolução · aces · % 1º saque |
| **Pressão nos games** | Sofre nos games de saque (BP enfrentados) · toma quebra · pressiona na devolução (BP criados) · quebra muito · salva break point |
| **Forma** | Fase atual (boa / ruim) · últimos jogos (adversário, superfície, resultado) |
| **Padrões de estilo** | Vira jogos · desanda após perder o 1º set · começa bem · aguenta 3 sets · forte no tie-break · partidas longas vs rápidas — **todos com o número explicando** |
| **Físico** | Descanso (dias parado) · fadiga (jogou ontem? duração do último jogo) |

Cada leitura vem com a base de dados ("o sistema tem X jogos deste jogador") — quando o histórico é pequeno, avisa que a leitura é mais frágil.

## Conteúdo da Análise de Confronto

- **Comparação lado a lado** de todas as métricas dos dois — incluindo **todas** as de pressão/quebra.
- **H2H (confronto direto):** quem ganhou, em que superfície, com que placar. Enriquece sozinho a cada novo jogo.
- **Vantagem por dados:** leitura cruzando saque/devolução × superfície × fase.
- **Importância do torneio:** categoria (Slam/Masters/500/250/Challenger) · casa · pontos que defende.
- **Aviso de Elo defasado:** quando a trajetória diverge do Elo (jovem em ascensão vs. veterano em declínio), o sistema alerta que o modelo pode estar atrasado e que a odd de mercado reflete melhor. O sistema avisa quando desconfiar dele mesmo.
- **Sugestão tática (em palavras):** por onde o jogo pende, um caminho possível de operar e o risco — derivada dos padrões, sem números, **sempre com o cenário de risco explícito**. Nunca diz "vai dar certo"; é a leitura de um analista, não uma ordem.

## Fundação de dados

Fontes **estáveis e gratuitas**, atualizadas todo dia pelo robô (GitHub Actions, já corrigido pra commitar de volta).

| Papel | Fonte | Observação |
|---|---|---|
| Histórico, rankings, stats por jogo | **Sackmann** | 49 campos/partida, inclui Challenger e WTA |
| **Grade do dia** | **Flashscore** | Cobre ATP + WTA + **Challenger**, e traz a **superfície** |
| **Fallback da grade** | **ESPN** | JSON estável; só tour. Se o Flashscore quebrar, cai aqui |

### Enriquecimento novo do pipeline
Capturar, por partida (dados já baixados, falta parsear): **placar por set** (`score`, para os padrões de estilo e H2H), **duração** (`minutes`, para fadiga e partidas longas), **break points dos dois lados** (`bpFaced`/`bpSaved`/`SvGms`, para os padrões de pressão), **nível do torneio** (`tourney_level`), **rankings atuais e históricos** (para a trajetória), **mão/altura/idade/país/seed**.

## Fora de escopo

- Odds automáticas / apontamento de valor / CLV / banca.
- Alvo/stop numérico e o motor de probabilidade por placar.
- Registro de resultados de trades / medição de taxa de acerto / calibração.
- Ajustar a probabilidade do modelo por forma/idade (o momento de carreira é **leitura**, não ajuste do modelo).
- Calendário futuro / "vai se poupar". Ponto-a-ponto fora dos Grand Slams.

## Componentes (alto nível)

- **`pipeline/`** — enriquecimento do histórico + derivação das métricas por jogador/confronto (`web/*.json`) + coletor de grade (Flashscore + ESPN fallback).
- **`web/`** — as duas telas (jogos do dia / confronto; cards de jogadores) consumindo os JSON.

## Ordem de construção sugerida (a detalhar em writing-plans)

1. Enriquecer o pipeline de dados (placar, minutos, break points, rankings + históricos, metadados).
2. Derivar as métricas por jogador (forma, padrões de estilo, de pressão, trajetória) + H2H.
3. Coletor de grade Flashscore (+ ESPN fallback), com superfície.
4. Telas: card rico → análise de confronto (com a sugestão tática em palavras) → seção de jogadores — sob a regra de clareza total.
