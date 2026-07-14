# Projeto Investidor 🎾

Sistema pessoal de **apoio à decisão** para trade esportivo de tênis (ATP/WTA) na Betfair.

> **O que ele é:** uma ferramenta que impõe **processo, disciplina e medição honesta de habilidade (CLV)**, além de ajudar a **entender cada jogo** (odds-alvo, EV, pontos fortes/fracos dos jogadores).
>
> **O que ele NÃO é:** uma máquina de prever vencedores nem de garantir lucro. O mercado de tênis é muito eficiente. Sucesso aqui se mede por **CLV** (pegar preço melhor que o fechamento), não pelo lucro de uma semana. Isto **não é consultoria financeira nem jurídica**.

## Fases

- **Fase 1 — Disciplina** (em construção): banca, calculadora de stake, diário de trades, CLV, freios de jogo responsável. Tudo **por toque** (zero digitação livre).
- **Fase 2 — Análise pré-jogo + Matchups**: modelo Elo por superfície, dossiês de jogadores, painel diário com odds-alvo e EV — com **portão de validação** (backtest) antes de confiar dinheiro.
- **Fase 3 — Motor ao vivo** (Markov do tênis): odds justas por placar → alvos de entrada/saída no trade ao vivo.
- **Fase 4/5** (futuro): automação diária (GitHub Actions), acesso multiusuário e, eventualmente, monetização.

O plano completo está em [`docs/plano-mvp.md`](docs/plano-mvp.md).

## Como rodar (local)

Requisitos: **Node.js** (já instalado). Não precisa de Python nesta fase.

```bash
npm run dev     # sobe a PWA em http://localhost:5173
npm test        # roda os testes da lógica (banca/stake/CLV)
```

## Estrutura

```
web/        → a PWA (o app que você abre no navegador/celular)
pipeline/   → scripts Python do modelo e dados (Fase 2)
players/    → dossiês dos jogadores (Fase 2)
tests/      → testes da lógica
docs/       → plano e especificações
scripts/    → utilitários (servidor local etc.)
data/       → dados baixados (não versionados)
```

## Segurança

- Chaves de API ficam em `.env` (nunca no repositório).
- Login/senha, quando existir (fase futura), é 100% via provedor (Supabase Auth) — senha nunca passa pelo nosso código.
