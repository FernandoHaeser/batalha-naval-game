# Modo online: arquitetura e lógica de turnos

O servidor (`server.js`) é a **fonte da verdade**: guarda os tabuleiros, valida cada ataque e decide de quem é o turno. O cliente (`public/js/modes/online.js`) só envia intenções e reflete o que o servidor manda.

## Ciclo de vida da sala

1. `create-lobby` → o servidor cria a sala com um código de 4 caracteres; quem criou é o **Jogador 1**.
2. `join-lobby { code }` → o segundo jogador entra como **Jogador 2**; os dois recebem `lobby-state { connected: 2 }` e vão para o posicionamento.
3. `player-ready { board, ships }` → cada jogador envia seu tabuleiro. Um "pronto" repetido, ou enviado com a partida já em andamento, é ignorado, para não reiniciar o jogo e resetar o turno.
4. Com os dois prontos → `game-start { turn: 1 }`.
5. Quando alguém sai (`leave-lobby`) ou cai (`disconnect`), a sala é **encerrada**: quem ficou recebe `opponent-disconnected` e é removido da sala, ficando livre para criar ou entrar em outro lobby.

## Regra de turno

- **Acertou** → o mesmo jogador ataca de novo.
- **Errou** → o turno passa ao adversário.
- **Afundou o último navio** → `game-over`; o turno fica `null`.

O servidor rejeita em silêncio ataques fora do turno, fora do tabuleiro ou em células já atacadas.

## Eventos de ataque

O servidor decide o próximo turno **antes** de emitir o resultado e envia esse turno junto no `attack-result`:

```js
attack-result {
  attacker, target, row, col,
  result: "hit" | "miss",
  sunkShip: { name, positions } | null,
  gameOver: boolean,
  turn: 1 | 2 | null,
  shipsLeft: { 1: number, 2: number }
}
```

Em seguida, se houve erro, também emite `turn-changed { turn }`, e se a partida acabou, `game-over { winner }`.

### Por que o turno vai dentro do `attack-result`

O cliente só registra os cliques do tabuleiro inimigo no momento em que o tabuleiro é desenhado (`renderGameBoards` → `canAttack`). Antes, o turno chegava apenas em um `turn-changed` separado, que atualizava o indicador de turno mas **não redesenhava o tabuleiro**. Resultado: quem recebia o turno ficava com o tabuleiro inimigo sem cliques e a partida travava.

Agora:

- no `attack-result`, o cliente aplica `turn` **antes** de redesenhar, então os cliques já saem certos;
- o `turn-changed` também redesenha o tabuleiro e ignora turnos que já foram aplicados.

### Contagem de navios do adversário

O cliente não conhece os navios do oponente (só o servidor conhece). O contador "NAVIOS" do adversário usa o `shipsLeft` enviado pelo servidor.

## Chat entre jogadores

Os dois jogadores da sala podem trocar mensagens durante o posicionamento, a partida e na tela de vitória/derrota.

```js
cliente → servidor: chat-message { text }
servidor → sala:    chat-message { playerNumber, text, at }
```

Regras aplicadas pelo servidor:

- só aceita mensagens de quem está em uma sala;
- remove caracteres de controle, apara espaços e corta em **200** caracteres; texto vazio é descartado;
- limita cada jogador a **uma mensagem a cada 400 ms** (o excedente é descartado em silêncio).

No cliente:

- o chat é o painel **RÁDIO**, abaixo da tela ativa; só aparece no modo online com uma sala ativa;
- tem reações rápidas (`GG`, `BOA!`, `OPS`, `JÁ ERA`, `QUASE!`, `SORTE`), que viram mensagens normais;
- **Silenciar** desativa o envio e esconde as mensagens do adversário (as do sistema continuam);
- minimizado, o painel mostra só a última linha;
- durante a partida, cada mensagem também aparece como balão ao lado do avatar de quem enviou;
- o próprio cliente escreve linhas de sistema (`»`) para eventos da partida: início, acertos, navios afundados;
- as mensagens são inseridas com `textContent`, nunca como HTML;
- o histórico é limpo ao entrar em um novo lobby ou quando o adversário sai;
- com o campo de mensagem focado, a tecla **[R]** não rotaciona navios.

## Configuração

| Variável | Onde | Função |
| --- | --- | --- |
| `PORT` | servidor | porta HTTP (padrão `3000`) |
| `CORS_ORIGIN` | servidor | origens permitidas, separadas por vírgula; vazio = qualquer origem |
| `SOCKET_SERVER_URL` | build da Vercel | URL do servidor gravada em `public/config.js`; vazio = mesmo domínio |

Rota de saúde: `GET /health` → `{ ok: true, rooms: <n> }`.

Deploy completo: veja [deploy-vercel.md](deploy-vercel.md).
