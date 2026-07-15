# Plataforma de Análise de Tênis — Especificação

> **Data:** 2026-07-15
> **Status:** Escopo aprovado pelo Felipe. Aguardando desenho das telas → plano de implementação.

## Contexto

Evolução do Projeto Investidor. Depois de explorar um caminho com **odds / apontamento de valor / Pinnacle**, esse rumo foi **descartado** por dois motivos honestos:

1. O mercado de tênis (e a Pinnacle em especial) é eficiente demais — "apontar valor vs mercado" com um modelo caseiro gera principalmente falsos positivos.
2. A API oficial da Pinnacle fechou pro público (jul/2025) e todos os mirrors não-oficiais se mostraram frágeis (um deles saiu do ar durante a própria conversa).

O Felipe reformulou a visão para o que o sistema **faz bem e de forma honesta**: uma **plataforma de análise pura** que reúne tudo sobre o confronto e os jogadores, para **ele** decidir o trade. É o retorno ao núcleo do projeto original ("preparação e leitura de cada jogo").

## O que é / o que não é

**É:** uma ferramenta de análise que, para os jogos do dia (ou um confronto simulado), entrega o raio-x completo dos dois jogadores e do confronto. **A decisão é 100% do Felipe.**

**Não é** (limites honestos, registrados de propósito):

- ❌ Não tem gestão de banca, stake, diário ou CLV.
- ❌ Não puxa odds, não aponta valor, não sugere aposta.
- ❌ Não adivinha se o jogador "vai se poupar pro próximo torneio" — não há calendário futuro / entry lists confiáveis e gratuitos.
- ❌ Padrão "começa atrás nos primeiros *games*" (ex.: perde 0-3 e vira) só existiria em Grand Slam (exige ponto-a-ponto). Fora dos Slams, a granularidade é **por set**.

Como a plataforma só informa, é indiferente se o Felipe opera como trade ou punter — a ferramenta prepara, ele joga.

## Telas

### Tela 1 — Jogos do dia → Confronto

- Lista dos jogos do dia: **Jogador A vs Jogador B**, por torneio, com superfície e status (agendado / ao vivo).
- Cobre **ATP + WTA + Challenger**.
- Tocar num jogo abre a **Análise de Confronto** (ver abaixo).
- Também permite **simular** qualquer confronto: escolher A, B e superfície na mão.

### Tela 2 — Cards de jogadores

- Navegar / buscar jogadores e ver o **card completo** de cada um (o máximo de informação).
- É o mesmo card que aparece dentro da Análise de Confronto, aqui isolado por jogador.

## Conteúdo do card do jogador

| Grupo | Conteúdo |
|---|---|
| **Identidade** | Ranking oficial atual · canhoto/destro · altura · idade · país · cabeça de chave / qualifier / wildcard |
| **Força** | Elo geral e por superfície (onde joga bem / mal) |
| **Saque & devolução** | % de pontos ganhos no saque · % na devolução · aces · % 1º saque |
| **Pressão nos games** | Sofre nos games de saque (BP enfrentados) · toma quebra · pressiona na devolução (BP criados) · quebra muito · salva break point |
| **Forma** | Fase atual (boa / ruim) · lista dos últimos jogos (adversário, superfície, resultado) |
| **Padrões de estilo** | Vira jogos · desanda após perder o 1º set · começa bem (ganha o 1º set) · aguenta 3 sets · clutch em tie-break · jogos longos vs rápidos |
| **Físico** | Descanso (dias parado) · fadiga (jogou ontem? duração do último jogo) |

Todos os números vêm com **nível de confiança** — jogador com pouco histórico (ex.: Challenger novo) aparece com ressalva, nunca com falsa precisão.

## Conteúdo da Análise de Confronto (além dos dois cards)

- **H2H (confronto direto):** histórico entre os dois — quem ganhou, em que superfície, e como (placar). Melhora sozinho a cada novo confronto.
- **Vantagem por dados:** leitura cruzando saque / devolução × superfície × fase → quem leva a melhor e por quê. É vantagem **medida** (ex.: "saque forte de A contra devolução fraca de B, no piso rápido"), não classificação tática subjetiva.
- **Importância do torneio:** categoria (Grand Slam / Masters / 500 / 250 / Challenger) · se é o torneio de casa do jogador · pontos que ele defende ali.

## Fundação de dados

Tudo vem de **fontes estáveis e gratuitas**, atualizadas **todo dia** pelo robô (GitHub Actions, já corrigido para commitar os dados de volta ao repo — sem "gangorra").

| Papel | Fonte | Observação |
|---|---|---|
| Histórico, rankings, stats por jogo | **Sackmann** (mirror jsDelivr/raw) | 49 campos por partida, inclui Challenger e WTA |
| Odds de fechamento / apoio | tennis-data.co.uk | (uso residual; não central nesta fase) |
| **Grade do dia** (jogos futuros) | **Flashscore** | Cobre ATP + WTA + **Challenger**, e já traz a **superfície** |
| **Fallback da grade** | **ESPN** | JSON estável; só tour (sem Challenger). Se o Flashscore quebrar, cai aqui |

### Peça de dados nova (central desta fase)

Enriquecer o pipeline de histórico para capturar, por partida, o que hoje não capturamos:

- **Placar por set** (`score`) → destrava forma detalhada, H2H rico e os padrões de estilo.
- **Duração** (`minutes`) → fadiga, jogos longos vs rápidos.
- **Break points dos dois lados** (`w/l_bpFaced`, `bpSaved`, `SvGms`) → padrões de quebra/pressão.
- **Nível do torneio** (`tourney_level`), **rankings** (arquivo `atp_rankings_current.csv`), **mão/altura/idade/país/seed**.

Os dados já são baixados; falta parseá-los e agregá-los por jogador/confronto.

## Métricas derivadas — definições (para o plano detalhar)

- **Forma:** resultado dos últimos N jogos (janela a definir), com peso maior aos recentes.
- **Vira jogos / desanda:** taxa de vitória quando perde o 1º set (parse do `score`).
- **Começa bem:** % de jogos em que ganha o 1º set.
- **Aguenta 3 sets:** taxa de vitória em jogos que vão à distância.
- **Clutch tie-break:** aproveitamento em tie-breaks (`7-6(x)` no score).
- **Pressão de saque/devolução:** BP enfrentados por game de saque; BP criados na devolução; quebras dadas/convertidas.
- **Descanso:** dias desde o último jogo. **Fadiga:** jogou ontem/anteontem? duração.

## Fora de escopo (futuro possível)

- Odds / valor / CLV / banca (rumo descartado nesta fase).
- Calendário futuro / "vai se poupar".
- Ponto-a-ponto fora dos Grand Slams.

## Componentes (alto nível)

- **`pipeline/`** — enriquecimento do histórico (placar, minutos, BP, rankings, metadados) + geração dos dados por jogador/confronto (`web/*.json`).
- **`pipeline/` grade** — coletor Flashscore (parser do formato próprio) + ESPN de fallback → grade do dia.
- **`web/`** — as duas telas (jogos do dia / confronto; cards de jogadores) consumindo os JSON gerados.

## Ordem de construção sugerida (a detalhar em writing-plans)

1. Enriquecer o pipeline de dados (placar, minutos, BP, rankings, metadados) — a fundação.
2. Derivar as métricas por jogador (forma, padrões de estilo, padrões de break) + H2H.
3. Coletor de grade Flashscore (+ ESPN fallback), com superfície.
4. Telas: card do jogador rico → análise de confronto → seção de jogadores.
