# Interface

O visual segue o canvas de design "Batalha Naval — nova interface" (claude.ai). Toda a interface está em `public/index.html` + `public/style.css`; `public/game.js` só troca classes e textos.

## Identidade

| Token | Valor | Uso |
| --- | --- | --- |
| `--bg` | `#07111d` | fundo das telas |
| `--panel` / `--line` | `#0d1f33` / `#1e4a70` | painéis e bordas |
| `--yellow` | `#ffe600` | ação principal, títulos, seu turno |
| `--cyan` | `#00e5ff` | você / Jogador 1 |
| `--orange` | `#ff9d3c` | adversário online / Jogador 2 |
| `--red` | `#ff6b6b` | bot, afundados |
| `--green` | `#00ff88` | online, conectado, vitória |

- Títulos e rótulos: **Press Start 2P**. Texto corrido: **IBM Plex Mono**.
- Sombra dura `6px 6px 0 #000` nos painéis principais; botões sobem 2px no hover.
- Todas as animações são desligadas com `prefers-reduced-motion`.

## Telas

| Tela | O que tem |
| --- | --- |
| Menu | mar animado ao fundo, cartões de modo, cartões de dificuldade (só no VS Bot) e botão **ZARPAR** / **ABRIR LOBBY**. O `?` abre as regras. |
| Lobby | criar sala ou entrar com código; na sala, código em blocos, botão de copiar, radar de espera e lista da tripulação. O indicador de servidor reflete a conexão real do socket. |
| Posicionamento | doca com os 5 navios, ferramentas (girar, aleatório, limpar), progresso da frota no topo e botão **PRONTO! FOGO!**. |
| Batalha | banner de turno no centro, radar inimigo com varredura no seu turno, seu mar, frota inimiga e diário de bordo. No online, os dois tabuleiros ficam lado a lado e o rádio fica embaixo. |
| Troca (1 VS 1) | tela cheia entre turnos, com o resumo dos tiros do outro jogador e botão **segure para revelar** (800 ms; pelo teclado, Enter revela). |
| Resultado | precisão, tiros, tempo, maior combo e mapa dos tiros. **REVANCHE** recomeça com o mesmo modo (não aparece no online). |

## Coordenadas

Linhas são letras (**A–J**) e colunas são números (**1–10**). Uma célula é escrita como `B7` (linha B, coluna 7), em todo o jogo: tabuleiros, diário, rádio e tela de troca.

## Banner de turno

| Situação | Banner |
| --- | --- |
| seu turno | `SEU TURNO` (ciano) |
| acertou | `ACERTOU!`, ou `COMBO xN` a partir do segundo acerto seguido (amarelo) |
| afundou | `AFUNDOU!` (vermelho) |
| vez do bot | `VEZ DO BOT` (roxo, com reticências animadas) |
| vez do adversário / outro jogador | `VEZ DO ADVERSÁRIO` / `VEZ DO JOGADOR N` (laranja) |

## Comportamentos

- **Pegar navio de volta:** com a frota completa (nenhum navio selecionado), clicar num navio do tabuleiro o tira de lá e o seleciona de novo.
- **1 VS 1:** depois que o Jogador 2 posiciona, aparece a tela de troca para o Jogador 1 antes da primeira jogada, para o Jogador 2 não ver o tabuleiro do adversário.
- **Estatísticas por jogador:** tiros, acertos e combo são contados por jogador. Os tiros do bot não entram nas suas estatísticas. No 1 VS 1, a tela de resultado mostra as do vencedor.
- **Sair:** na batalha, ou no posicionamento online, o botão pede confirmação antes de sair.
