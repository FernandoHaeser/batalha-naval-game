# Código do cliente

O jogo no navegador fica em `public/js/`, em scripts comuns (sem bundler nem `import`). Todos compartilham o mesmo escopo global, então a **ordem de carregamento no `index.html` importa**:

| Ordem | Arquivo | Responsabilidade |
| --- | --- | --- |
| 1 | `core.js` | constantes (`SHIP_TYPES`, `CELL`, `DIFF`), `state`, regras do tabuleiro (`canPlace`, `attack`...), registro de modos e utilitários de DOM (`el`, `byId`) |
| 2 | `ui.js` | troca de telas, menu, modal de regras e confirmação de saída |
| 3 | `placement.js` | tela de posicionamento, igual para todos os modos |
| 4 | `battle.js` | tela de batalha: tabuleiros, banner de turno, placar, diário, resolução de tiro local e tela de resultado |
| 5 | `modes/pve.js` | IA do bot e regras do VS Bot |
| 6 | `modes/pvp.js` | tela de troca de aparelho e regras do 1 VS 1 |
| 7 | `modes/online.js` | socket, lobby, rádio (chat) e eventos do servidor |
| 8 | `main.js` | atalhos de teclado e inicialização |

Funções usadas em `onclick` / `onsubmit` no HTML precisam continuar sendo declarações `function` de topo, para ficarem acessíveis globalmente.

## Registro de modos

Cada arquivo em `modes/` chama `defineMode(nome, { ... })`. O código compartilhado nunca testa `state.mode`: ele pergunta ao modo atual via `currentMode()`. O que um modo não define vem de `BASE_MODE` (em `core.js`).

| Gancho | Padrão | Para que serve |
| --- | --- | --- |
| `launch()` | — | o que o botão ZARPAR / ABRIR LOBBY faz, e também a REVANCHE |
| `ready()` | — | o que acontece ao clicar PRONTO no posicionamento |
| `labels(viewer, foe)` | — | nomes, avatar do adversário e títulos dos tabuleiros na batalha |
| `viewer()` | `1` | qual jogador está olhando a tela |
| `color(n)` | ciano / vermelho | cor do jogador `n` (avatar e placar) |
| `shooterName(attacker)` | — | quem aparece no diário ao atirar |
| `passTurn(attacker, target)` | — | o que acontece depois de um tiro na água (bot joga, troca de aparelho...) |
| `onShot(info)` | — | opcional; chamado a cada tiro local (o 1 VS 1 guarda o resumo para a tela de troca) |
| `attack(row, col)` | — | opcional; se existir, substitui a resolução local do tiro (o online envia ao servidor) |
| `turnBanner(viewer)` | `SEU TURNO` | banner no seu turno, antes de acertar |
| `waitBanner()` | — | banner quando não é sua vez |
| `foeShipsLeft(foe)` | conta `state.ships` | navios restantes do adversário (o online usa o número do servidor) |
| `result(winner)` | — | dados da tela final: `won`, `subject` (de quem são as estatísticas), `mapBoard`, `revealShips`, `subtitle`, `title` opcional |
| `placementLocked()` | `false` | trava o posicionamento (online, depois de PRONTO) |
| `inputBlocked()` | `false` | bloqueia tiros (1 VS 1, com a tela de troca aberta) |
| `confirmPlacementExit` | `false` | pedir confirmação ao sair do posicionamento |
| `rematch` | `true` | mostrar o botão REVANCHE |

### Adicionando um modo

1. Crie `public/js/modes/<nome>.js` com `defineMode('<nome>', { ... })`, implementando pelo menos `launch`, `ready`, `labels`, `shooterName`, `passTurn`, `waitBanner` e `result`.
2. Inclua o `<script>` no `index.html`, depois de `battle.js` e antes de `main.js`.
3. Adicione um cartão `.mode-card` com `data-mode="<nome>"` no menu.

## Estilos

O HTML não tem `style=`. Estados visuais são classes (`pip-cyan`, `badge-p1`, `target-orange`, `kicker-red`...) ou o atributo `hidden`, que o CSS força com `[hidden] { display: none !important; }`. Só ficam como estilo via JS os valores calculados em tempo de execução: a posição das estrelas do menu, os confetes e a largura da barra de precisão.
