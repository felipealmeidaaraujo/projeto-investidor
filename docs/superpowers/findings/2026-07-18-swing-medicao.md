# Medição de swing (Frente C, Fase 1) — ATP

Amostra: 24002 partidas medidas (8418 no teste). Placar inválido/abandono ignorado: 1559. Anos 2011-2025, teste 2022-2025.

Alvo: **favorito perdeu ≥1 set**. Proxy de placar (não é preço nem lucro).

## Sanidade — taxa base por faixa de prob do favorito (teste)

| Faixa | n | taxa |
|---|---|---|
| 50-60% | 2594 |  70.7% |
| 60-70% | 2379 |  63.2% |
| 70-80% | 1868 |  53.2% |
| 80-90% | 1175 |  44.4% |
| 90-101% | 402 |  31.8% |

(Esperado: a taxa CAI conforme o favorito fica mais forte.)

## Jogo quebra-quebra (devolução combinada)

| Faixa | corte | n(alto) | n(baixo) | taxa alto | taxa baixo | dif (pp) |
|---|---|---|---|---|---|---|
| 50-60% | 0.729 | 1393 | 1201 |  70.2% |  71.3% | -1.1 |
| 60-70% | 0.730 | 1281 | 1098 |  62.1% |  64.5% | -2.4 |
| 70-80% | 0.734 | 966 | 902 |  49.9% |  56.7% | -6.8 |
| 80-90% | 0.743 | 606 | 569 |  41.3% |  47.8% | -6.5 |
| 90-101% | 0.773 | 155 | 247 |  30.3% |  32.8% | -2.5 |

**Veredito:** NAO PASSA — aponta o CONTRARIO (2/4 celulas ->=5pp)

## Mismatch de piso (delta de Elo por superfície)

| Faixa | corte | n(alto) | n(baixo) | taxa alto | taxa baixo | dif (pp) |
|---|---|---|---|---|---|---|
| 50-60% | -4.798 | 1313 | 1281 |  70.0% |  71.4% | -1.4 |
| 60-70% | -5.734 | 1217 | 1162 |  61.5% |  64.9% | -3.3 |
| 70-80% | -8.296 | 921 | 947 |  51.4% |  54.9% | -3.6 |
| 80-90% | -8.170 | 533 | 642 |  44.1% |  44.7% | -0.6 |
| 90-101% | -13.391 | 180 | 222 |  30.6% |  32.9% | -2.3 |

**Veredito:** NAO PASSA (sem separacao consistente; swing 0, inverso 0 de 4)

## Azarão começa forte (taxa de 1º set do azarão)

| Faixa | corte | n(alto) | n(baixo) | taxa alto | taxa baixo | dif (pp) |
|---|---|---|---|---|---|---|
| 50-60% | 0.485 | 1491 | 1103 |  71.5% |  69.6% | 1.9 |
| 60-70% | 0.479 | 1278 | 1101 |  61.8% |  64.8% | -2.9 |
| 70-80% | 0.472 | 964 | 904 |  51.8% |  54.6% | -2.9 |
| 80-90% | 0.468 | 605 | 570 |  43.3% |  45.6% | -2.3 |
| 90-101% | 0.462 | 195 | 207 |  30.8% |  32.9% | -2.1 |

**Veredito:** NAO PASSA (sem separacao consistente; swing 0, inverso 0 de 4)

## Melhor-de-5 vs melhor-de-3

| Faixa | n(BO5) | n(BO3) | taxa BO5 | taxa BO3 | dif (pp) |
|---|---|---|---|---|---|
| 50-60% | 369 | 2225 |  78.3% |  69.4% | 8.9 |
| 60-70% | 376 | 2003 |  71.8% |  61.6% | 10.3 |
| 70-80% | 329 | 1539 |  63.8% |  50.9% | 13.0 |
| 80-90% | 269 | 906 |  50.2% |  42.7% | 7.5 |
| 90-101% | 148 | 254 |  33.1% |  31.1% | 2.0 |

