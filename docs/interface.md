# Interface

O visual segue o canvas de design "Batalha Naval — nova interface" (claude.ai). Toda a interface está em `public/index.html` + `public/style.css`, sem nenhum estilo inline no HTML; os scripts em `public/js/` só trocam classes, textos e o atributo `hidden`.

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
| Posicionamento | doca com os 5 navios, ferramentas (girar, aleatório, limpar), progresso da frota no topo e botão **PRONTO! FOGO!**. No online, o painel **PRONTOS PARA A BATALHA** mostra `N/2` e o estado de cada jogador (posicionando / pronto); depois do seu pronto, o tabuleiro fica coberto por um radar "aguardando adversário". Com os dois prontos, o painel fica verde por ~1 s antes de abrir a batalha. |
| Batalha | banner de turno no centro, radar inimigo com varredura no seu turno, seu mar, frota inimiga e diário de bordo. No online, os dois tabuleiros ficam lado a lado e o rádio fica embaixo. |
| Troca (1 VS 1) | tela cheia entre turnos, com o resumo dos tiros do outro jogador e botão **segure para revelar** (800 ms; pelo teclado, Enter revela). |
| Final (online) | antes do resultado, uma animação de ~4,4 s mostra o último navio afundado: explosões, o navio inclinando e afundando, bolhas e a legenda `FROTA INIMIGA DESTRUÍDA` ou `SUA FROTA FOI AFUNDADA`. O navio usa as cores do dono (vermelho do inimigo ou cinza/ciano do seu) e cresce conforme o tamanho. Toque, clique ou `Esc` pula. |
| Resultado | troféu (vitória, com confete) ou âncora (derrota, com bolhas subindo); placar **VOCÊ VS ADVERSÁRIO** com navios restantes, acertos, precisão, maior combo e tiros (online e 1 VS 1); cartões de precisão, tiros, tempo e maior combo; mapa dos seus tiros e mapa dos tiros recebidos. **REVANCHE** recomeça com o mesmo modo (não aparece no online). |

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
- **Estatísticas do adversário online:** cada cliente conta os tiros do adversário a partir dos `attack-result` recebidos, só para o placar final; isso não mexe no banner de turno.
- **Sair:** na batalha, ou no posicionamento online, o botão pede confirmação antes de sair.

## Celular

Abaixo de 600 px de largura:

- **Menu:** cartões de modo mais baixos, dificuldades em grade 2×2 e botão **ZARPAR** com a largura toda.
- **Posicionamento:** a ordem muda para título → painel de prontos → doca (2 colunas, compacta) → tabuleiro → ferramentas → botão pronto, para o tabuleiro ficar logo abaixo dos navios. A dica do atalho `R` some em telas de toque (`hover: none`).
- **Batalha:** cabeçalho compacto, banner de turno com a largura toda, título do tabuleiro e estatísticas empilhados; no online, seu mar fica limitado a 300 px abaixo do radar.
- **Resultado:** placar com os jogadores empilhados (avatar sobre o nome), cartões em 2 colunas, os dois mapas lado a lado e botões com a largura toda.
- **Geral:** rótulos de linha/coluna menores (20 px), `touch-action: manipulation` em botões e células (sem zoom no toque duplo), campo do rádio com 16 px (evita zoom automático no iOS), `100dvh` nas telas e margem para a área segura do iPhone embaixo do rádio.
