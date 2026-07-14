# Projeto Investidor — Plano do MVP

> Plano aprovado no planejamento inicial. Cópia dentro do repositório para viajar entre dispositivos (PC ↔ celular) quando o projeto subir para o GitHub.

## Contexto

Felipe faz **trade esportivo de tênis na Betfair** (ATP/WTA) e quer viver disso. Hoje **já opera com dinheiro real, mas de forma inconsistente**. Ele quer uma ferramenta que, todo dia, traga os melhores jogos, **qual odd pegar na entrada, qual odd sair, se vale segurar até o fim e o porquê de tudo** — pra operar consciente, com critério objetivo em vez de achismo, e ficar consistente e lucrativo no longo prazo.

**Diagnóstico honesto (base de todo o plano):**
- O **mercado de tênis é muito eficiente**. Nenhum modelo público bate o fechamento de forma consistente. Um modelo caseiro bem-feito arranca, na melhor das hipóteses, **1–3% de ROI em nichos** — e fica **negativo se apostar em tudo**.
- O valor real da ferramenta **não é "prever o vencedor" nem "ficar blindado"**. É: **preparação/leitura de cada jogo + critério objetivo de preço + disciplina + medição honesta de habilidade (CLV)**.
- A vantagem pequena mora em **nichos e matchups de estilo**. Daí o **banco de matchups**.
- Métrica de sucesso = **CLV (Closing Line Value)**, não lucro de curto prazo.

## Decisões travadas

| Tema | Decisão |
|---|---|
| Caminho | **A — MVP validável** (grátis, com portão de validação) |
| Foco de circuito | **ATP + WTA** |
| Estilo | **Punter (segura até o fim) E trade ao vivo** |
| Situação | Opera com banca real, mas inconsistente → foco em **processo/disciplina** |
| Entrega | **App visual, 100% por toque — ZERO digitação livre**; abre no celular (PWA) |
| Orçamento | Começa **grátis**, escala conforme provar resultado |
| Ordem | **Fase 1 = Disciplina** → **Fase 2 = Análise + Matchups** → **Fase 3 = Motor ao vivo** |
| Multiusuário | **Single-user no MVP**; login + amigos em fase futura; monetização depois (exige dados comerciais) |
| Dev/nuvem | Começa **local**; sobe pro **GitHub** depois (destrava acesso PC ↔ celular) |

## Princípios do produto

1. **Explicabilidade:** toda análise explica motivo de entrada, motivo de saída, se vale segurar até o fim e o **EV de longo prazo** — com **nível de confiança/calibração**.
2. **Interação por toque:** só botões, chips, seletores e perguntas de múltipla escolha. Sem campo de texto livre.
3. **Honestidade:** quando falta dado ou a confiança é baixa, o app avisa. Recomendação de valor só depois do portão de validação.

## Achados críticos das pesquisas

1. **🔴 Betfair sem API direta no Brasil (desde 01/01/2025)** — execução manual; odds de referência via The Odds API. Ação: confirmar se a Betfair usada está na lista `.bet.br`.
2. **🟡 Repositórios Sackmann (`tennis_atp`/`tennis_wta`) ficaram privados/404** — usar espelhos (`Tennismylife/TML-Database`, Kaggle).
3. **🟢 tennis-data.co.uk no ar** (resultados + odds Pinnacle/Bet365, grátis) — espinha dorsal do backtest. Baixar via HTTP.
4. **🟢 Arquitetura grátis sem "dormir":** GitHub Actions (cron) → Python → PWA estática (Cloudflare/GitHub Pages).

## Conteúdo de cada ANÁLISE de jogo

- **Leitura do confronto** (favorito, o quanto, por quê).
- **Entrada PUNTER:** odd-alvo mínima = `(1 + limiar) / prob_modelo`; vale segurar até o fim? por quê; EV% de longo prazo + confiança.
- **Trade AO VIVO (Fase 3):** odd de entrada, odd de saída (green) e o porquê; planos de cenário.
- Aviso de baixa confiança; campo pra selecionar a odd da Betfair → EV recalculado.

## Modelo (Fase 2)

Elo por superfície (estilo FiveThirtyEight/Tennis Abstract): Elo geral + por piso; `K = 250/(m+5)^0.4`; blend 50/50; logística `/400`; ajuste BO3/BO5; Weighted Elo (forma); penalidade pós-lesão. Features parcimoniosas (descanso/fadiga, rodada, indoor/outdoor; ranking como prior; H2H só com shrinkage). Saída calibrada.

## Dossiês + Matchups (Fase 2)

- **Card do jogador:** foto (fonte com licença livre, senão avatar+bandeira), pontos fortes/fracos auto-derivados dos dados, tags de estilo, Elo por piso.
- **Banco de matchups:** vantagem + explicação gerada dos perfis.
- **Validação por toque:** "Saiu como previsto?" + chips → rastreia acurácia e afina os matchups.

## Motor ao vivo (Fase 3)

Markov do tênis: `P(vencer | placar)` → odd justa por estado → alvos de entrada/saída com o porquê. Ressalva: execução manual; não enxerga lesão/momentum além do placar.

## Validação — o portão (Fase 2)

Split temporal (walk-forward); log-loss, Brier, calibração+ECE vs baseline de mercado; benchmark contra **odds de fechamento**; **CLV** primário; Kelly fracionário; Monte Carlo de banca. Só habilita recomendações se passar; senão, fica só como leitura/scout. Paper trading antes de banca real.

## Roadmap

- **Fase 0 — Fundação:** repo, estrutura, esqueleto da PWA. ✅ (em andamento)
- **Fase 1 — Disciplina:** banca, stake (Kelly), diário por toque, histórico completo, análise de padrões (bom×ruim), revisão pós-trade ("o que faria diferente"), CLV, freios (stop-loss, anti-tilt).
- **Fase 2 — Análise + Dossiês/Matchups** (com portão de validação).
- **Fase 3 — Motor ao vivo.**
- **Fase 4 — Automação & polimento.**
- **Fase 5 — Multiusuário e monetização.**

## Ações do Felipe (fora do código)

1. Confirmar se a Betfair dele está na lista oficial `.bet.br`.
2. Ciência da tributação (15% sobre lucro líquido).
3. Definir banca inicial e limites (stop-loss diário, % por operação, nº máx. de operações/dia).

## Riscos

- Sackmann 404 (usar mirrors). Odds de fechamento não 100% confirmadas (Pinnacle como proxy). The Odds API cobre principais ATP/WTA. Edge pequeno e nichado. Betfair sem API no BR. Fotos só de licença livre. Licença de dados é não-comercial (vender exige dados comerciais + LGPD). **Não é consultoria financeira nem jurídica.**
