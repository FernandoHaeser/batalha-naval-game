/**
 * Batalha Naval — Lógica Principal do Jogo
 * ==========================================
 * Referência base de estrutura:
 *   "Battleship Game in JavaScript" — The Odin Project (open source, MIT)
 *   https://www.theodinproject.com/lessons/node-path-javascript-battleship
 *
 * Modificações e adições feitas neste projeto:
 *  - Interface visual completa em HTML/CSS sem canvas
 *  - Modo 1 vs Bot com IA probabilística (hunt/target)
 *  - Modo 1 vs 1 local com overlay de troca de turno
 *  - Sistema de pré-visualização de posicionamento (hover)
 *  - Feedback visual animado (acerto, erro, afundado)
 *  - Log de batalha em tempo real
 *  - Posicionamento aleatório de navios
 */

'use strict';

const BOARD_SIZE = 10;

const SHIP_TYPES = [
    { id: 'carrier', name: 'Porta-aviões', size: 5 },
    { id: 'battleship', name: 'Encouraçado', size: 4 },
    { id: 'cruiser', name: 'Cruzador', size: 3 },
    { id: 'submarine', name: 'Submarino', size: 3 },
    { id: 'destroyer', name: 'Destruidor', size: 2 },
];

const CELL = { EMPTY: 0, SHIP: 1, HIT: 2, MISS: 3, SUNK: 4 };

let state = {
    mode: 'pve',
    phase: 'menu',
    currentPlacer: 1,
    currentTurn: 1,

    placementDirection: 'h',
    selectedShipIdx: null,

    boards: {
        1: createEmptyBoard(),
        2: createEmptyBoard(),
    },

    ships: { 1: [], 2: [] },

    remaining: { 1: [...SHIP_TYPES], 2: [...SHIP_TYPES] },

    stats: { shots: 0, hits: 0, start: null },

    ai: {
        mode: 'hunt',
        lastHit: null,
        targetQueue: [],
        attacked: new Set(),
    },
};

function createEmptyBoard() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(CELL.EMPTY));
}

function cloneBoard(board) {
    return board.map(row => [...row]);
}

function canPlace(board, row, col, size, dir) {
    const positions = getPositions(row, col, size, dir);
    if (!positions) return false;

    for (const [r, c] of positions) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = r + dr, nc = c + dc;
                if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
                if (board[nr][nc] === CELL.SHIP) return false;
            }
        }
    }
    return true;
}

function getPositions(row, col, size, dir) {
    const positions = [];
    for (let i = 0; i < size; i++) {
        const r = dir === 'h' ? row : row + i;
        const c = dir === 'h' ? col + i : col;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return null;
        positions.push([r, c]);
    }
    return positions;
}

function placeShip(board, row, col, size, dir, shipInfo) {
    const positions = getPositions(row, col, size, dir);
    for (const [r, c] of positions) board[r][c] = CELL.SHIP;
    return { ...shipInfo, positions, hits: 0, sunk: false };
}

function attack(targetBoard, targetShips, row, col) {
    if (targetBoard[row][col] === CELL.SHIP) {
        targetBoard[row][col] = CELL.HIT;

        for (const ship of targetShips) {
            if (ship.sunk) continue;
            if (ship.positions.some(([r, c]) => r === row && c === col)) {
                ship.hits++;
                if (ship.hits === ship.size) {
                    ship.sunk = true;
                    for (const [r, c] of ship.positions) targetBoard[r][c] = CELL.SUNK;
                    return 'sunk';
                }
            }
        }
        return 'hit';
    }

    if (targetBoard[row][col] === CELL.EMPTY) {
        targetBoard[row][col] = CELL.MISS;
        return 'miss';
    }
    return null;
}

function allShipsSunk(ships) {
    return ships.every(s => s.sunk);
}

function randomPlacementForPlayer(playerNum) {
    const board = createEmptyBoard();
    const ships = [];

    for (const shipType of SHIP_TYPES) {
        let placed = false;
        let attempts = 0;
        while (!placed && attempts < 1000) {
            attempts++;
            const row = Math.floor(Math.random() * BOARD_SIZE);
            const col = Math.floor(Math.random() * BOARD_SIZE);
            const dir = Math.random() < 0.5 ? 'h' : 'v';
            if (canPlace(board, row, col, shipType.size, dir)) {
                ships.push(placeShip(board, row, col, shipType.size, dir, { id: shipType.id, name: shipType.name, size: shipType.size }));
                placed = true;
            }
        }
    }

    return { board, ships };
}

/**
 * A IA usa estratégia hunt/target:
 *  - Modo 'hunt': ataca células em padrão de tabuleiro (checkerboard) aleatoriamente.
 *  - Modo 'target': após um hit, tenta as células vizinhas para afundar o navio.
 */
function aiBestMove() {
    const ai = state.ai;
    const board = state.boards[1];

    while (ai.targetQueue.length > 0) {
        const [r, c] = ai.targetQueue.shift();
        if (!ai.attacked.has(`${r},${c}`) && isValidCell(r, c)) {
            return [r, c];
        }
    }

    const candidates = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (!ai.attacked.has(`${r},${c}`) && (r + c) % 2 === 0) {
                candidates.push([r, c]);
            }
        }
    }

    if (candidates.length === 0) {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (!ai.attacked.has(`${r},${c}`)) candidates.push([r, c]);
            }
        }
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
}

function isValidCell(r, c) {
    return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function aiAddTargets(row, col) {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
        const r = row + dr, c = col + dc;
        if (isValidCell(r, c) && !state.ai.attacked.has(`${r},${c}`)) {
            state.ai.targetQueue.push([r, c]);
        }
    }
}

function aiDoTurn() {
    const [row, col] = aiBestMove();
    state.ai.attacked.add(`${row},${col}`);

    const result = attack(state.boards[1], state.ships[1], row, col);
    if (!result) return;

    state.stats.shots++;
    if (result === 'hit' || result === 'sunk') state.stats.hits++;

    const label = `[${String.fromCharCode(65 + col)}${row + 1}]`;

    if (result === 'sunk') {
        const sunkShip = state.ships[1].find(s => s.sunk && s.positions.some(([r, c]) => r === row && c === col));
        addLog(`🤖 Bot afundou: ${sunkShip ? sunkShip.name : 'navio'}!`, 'sunk');
        state.ai.targetQueue = [];
        state.ai.mode = 'hunt';
    } else if (result === 'hit') {
        addLog(`🤖 Bot acertou ${label}!`, 'hit');
        aiAddTargets(row, col);
        state.ai.mode = 'target';
    } else {
        addLog(`🤖 Bot errou ${label}.`, 'miss');
    }

    renderGameBoards();
    updateShipCounts();

    if (allShipsSunk(state.ships[1])) {
        endGame(2);
        return;
    }

    if (result === 'miss') {
        setTimeout(() => {
            state.currentTurn = 1;
            updateTurnUI();
        }, 600);
    } else {
        setTimeout(() => {
            renderGameBoards();
            updateTurnUI();
            aiDoTurn();
        }, 600);
    }
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${id}`).classList.add('active');
    state.phase = id;
}

function backToMenu() {
    resetState();
    showScreen('menu');
}

function playAgain() {
    resetState();
    showScreen('menu');
}

function resetState() {
    state = {
        mode: state.mode,
        phase: 'menu',
        currentPlacer: 1,
        currentTurn: 1,
        placementDirection: 'h',
        selectedShipIdx: null,
        boards: { 1: createEmptyBoard(), 2: createEmptyBoard() },
        ships: { 1: [], 2: [] },
        remaining: { 1: [...SHIP_TYPES], 2: [...SHIP_TYPES] },
        stats: { shots: 0, hits: 0, start: null },
        ai: { mode: 'hunt', lastHit: null, targetQueue: [], attacked: new Set() },
    };
}

function startGame(mode) {
    state.mode = mode;
    state.currentPlacer = 1;
    showScreen('placement');
    renderPlacementScreen(1);
}

function renderPlacementScreen(playerNum) {
    const titleEl = document.getElementById('placement-title');
    const subtitleEl = document.getElementById('placement-subtitle');

    if (state.mode === 'pvp') {
        titleEl.textContent = `Jogador ${playerNum}: Posicione seus navios`;
    } else {
        titleEl.textContent = 'Posicione seus navios';
    }
    subtitleEl.innerHTML = `Clique para posicionar | <kbd>R</kbd> para rotacionar`;

    renderShipList(playerNum);
    renderPlacementBoard(playerNum);
    updateReadyButton(playerNum);
}

function renderShipList(playerNum) {
    const container = document.getElementById('ship-list');
    container.innerHTML = '';

    SHIP_TYPES.forEach((ship, idx) => {
        const placed = !state.remaining[playerNum].some(r => r.id === ship.id);
        const isSelected = state.selectedShipIdx === idx;

        const div = document.createElement('div');
        div.className = `ship-item ${placed ? 'placed' : ''} ${isSelected ? 'selected' : ''}`;
        div.innerHTML = `
      <span class="ship-name">${ship.name} (${ship.size})</span>
      <span class="ship-cells">${'<span></span>'.repeat(ship.size)}</span>
    `;
        if (!placed) div.addEventListener('click', () => selectShip(idx, playerNum));
        container.appendChild(div);
    });
}

function selectShip(idx, playerNum) {
    if (!state.remaining[playerNum].some(r => r.id === SHIP_TYPES[idx].id)) return;
    state.selectedShipIdx = idx;
    renderShipList(playerNum);
}

function rotateShip() {
    state.placementDirection = state.placementDirection === 'h' ? 'v' : 'h';
    renderPlacementBoard(state.currentPlacer);
}

function clearBoard() {
    state.boards[state.currentPlacer] = createEmptyBoard();
    state.ships[state.currentPlacer] = [];
    state.remaining[state.currentPlacer] = [...SHIP_TYPES];
    state.selectedShipIdx = null;
    renderPlacementScreen(state.currentPlacer);
}

function randomPlacement() {
    const { board, ships } = randomPlacementForPlayer(state.currentPlacer);
    state.boards[state.currentPlacer] = board;
    state.ships[state.currentPlacer] = ships;
    state.remaining[state.currentPlacer] = [];
    state.selectedShipIdx = null;
    renderPlacementScreen(state.currentPlacer);
}

function renderPlacementBoard(playerNum) {
    const container = document.getElementById('placement-board');
    container.innerHTML = '';

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            if (state.boards[playerNum][r][c] === CELL.SHIP) {
                cell.classList.add('ship-placed');
                if (state.ships[playerNum].findIndex(s => s.positions.some(([sr, sc]) => sr === r && sc === c && !s._allPlaced)) !== -1) {
                }
            }

            cell.addEventListener('click', () => handlePlacementClick(r, c, playerNum));
            cell.addEventListener('mouseenter', () => showPlacementPreview(r, c, playerNum));
            cell.addEventListener('mouseleave', () => clearPlacementPreview(playerNum));

            container.appendChild(cell);
        }
    }
}

function getCellEl(boardId, row, col) {
    const board = document.getElementById(boardId);
    return board ? board.children[row * BOARD_SIZE + col] : null;
}

function showPlacementPreview(row, col, playerNum) {
    clearPlacementPreview(playerNum);
    if (state.selectedShipIdx === null) return;

    const ship = SHIP_TYPES[state.selectedShipIdx];
    if (!state.remaining[playerNum].some(r => r.id === ship.id)) return;

    const positions = getPositions(row, col, ship.size, state.placementDirection);
    const valid = canPlace(state.boards[playerNum], row, col, ship.size, state.placementDirection);

    if (positions) {
        for (const [r, c] of positions) {
            const cell = getCellEl('placement-board', r, c);
            if (cell) cell.classList.add(valid ? 'ship-preview' : 'invalid');
        }
    }
}

function clearPlacementPreview(playerNum) {
    document.querySelectorAll('#placement-board .cell').forEach(cell => {
        cell.classList.remove('ship-preview', 'invalid');
    });
}

function handlePlacementClick(row, col, playerNum) {
    if (state.selectedShipIdx === null) return;
    const ship = SHIP_TYPES[state.selectedShipIdx];
    if (!state.remaining[playerNum].some(r => r.id === ship.id)) return;

    if (!canPlace(state.boards[playerNum], row, col, ship.size, state.placementDirection)) return;

    const placed = placeShip(state.boards[playerNum], row, col, ship.size, state.placementDirection, {
        id: ship.id, name: ship.name, size: ship.size
    });
    state.ships[playerNum].push(placed);
    state.remaining[playerNum] = state.remaining[playerNum].filter(r => r.id !== ship.id);

    const next = state.remaining[playerNum][0];
    state.selectedShipIdx = next ? SHIP_TYPES.findIndex(s => s.id === next.id) : null;

    renderPlacementScreen(playerNum);
}

function updateReadyButton(playerNum) {
    const btn = document.getElementById('btn-ready');
    btn.disabled = state.remaining[playerNum].length > 0;
}

function playerReady() {
    if (state.mode === 'pve') {
        const { board, ships } = randomPlacementForPlayer(2);
        state.boards[2] = board;
        state.ships[2] = ships;
        startGamePhase();
    } else {
        if (state.currentPlacer === 1) {
            state.currentPlacer = 2;
            showPvpOverlay('Passe o dispositivo', 'para o Jogador 2 posicionar seus navios', () => {
                renderPlacementScreen(2);
            });
        } else {
            startGamePhase();
        }
    }
}

function startGamePhase() {
    state.phase = 'game';
    state.currentTurn = 1;
    state.stats.start = Date.now();
    showScreen('game');
    renderGameScreen();
}

function renderGameScreen() {
    document.getElementById('p1-name').textContent = 'Jogador 1';
    document.getElementById('p2-name').textContent = state.mode === 'pve' ? 'Bot' : 'Jogador 2';

    updateShipCounts();
    updateTurnUI();
    renderGameBoards();
    renderGameLog();
}

function renderGameBoards() {
    renderBoardDisplay('player-board', state.boards[1], false);
    renderBoardDisplay('enemy-board', state.boards[2], true);
}

function renderBoardDisplay(boardId, board, isAttack) {
    const container = document.getElementById(boardId);
    container.innerHTML = '';

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            const val = board[r][c];

            if (val === CELL.SHIP && !isAttack) cell.classList.add('ship-placed');
            if (val === CELL.HIT) cell.classList.add('hit');
            if (val === CELL.MISS) cell.classList.add('miss');
            if (val === CELL.SUNK) cell.classList.add('sunk');

            if (isAttack && canAttack(r, c)) {
                cell.addEventListener('click', () => handleAttack(r, c));
            } else if (isAttack) {
                cell.classList.add('no-attack');
            }

            container.appendChild(cell);
        }
    }
}

function canAttack(r, c) {
    if (state.phase !== 'game') return false;
    if (state.currentTurn !== 1) return false;
    const val = state.boards[2][r][c];
    return val === CELL.EMPTY || val === CELL.SHIP;
}

function handleAttack(row, col) {
    if (!canAttack(row, col)) return;

    const result = attack(state.boards[2], state.ships[2], row, col);
    if (!result) return;

    state.stats.shots++;
    if (result === 'hit' || result === 'sunk') state.stats.hits++;

    const label = `[${String.fromCharCode(65 + col)}${row + 1}]`;

    if (result === 'sunk') {
        const sunkShip = state.ships[2].find(s => s.sunk && s.positions.some(([r, c]) => r === row && c === col));
        addLog(`💥 Você afundou: ${sunkShip ? sunkShip.name : 'navio'}!`, 'sunk');
    } else if (result === 'hit') {
        addLog(`🎯 Você acertou ${label}!`, 'hit');
    } else {
        addLog(`💧 Você errou ${label}.`, 'miss');
    }

    renderGameBoards();
    updateShipCounts();

    if (allShipsSunk(state.ships[2])) {
        endGame(1);
        return;
    }
    if (state.mode === 'pve') {
        if (result === 'miss') {
            state.currentTurn = 2;
            updateTurnUI();
            setTimeout(() => aiDoTurn(), 800);
        } else {
            updateTurnUI();
        }
    } else {
        if (result === 'miss') {
            state.currentTurn = 2;
            updateTurnUI();
            showPvpOverlay('Passe o dispositivo', 'para o Jogador 2 atacar', () => {
                renderPvpEnemyBoard();
            });
        } else {
            updateTurnUI();
        }
    }
}

function renderPvpEnemyBoard() {
    renderBoardDisplay('player-board', state.boards[2], false);
    const container = document.getElementById('enemy-board');
    container.innerHTML = '';

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            const val = state.boards[1][r][c];

            if (val === CELL.HIT) cell.classList.add('hit');
            if (val === CELL.MISS) cell.classList.add('miss');
            if (val === CELL.SUNK) cell.classList.add('sunk');

            const attackable = (val === CELL.EMPTY || val === CELL.SHIP) && state.currentTurn === 2;
            if (attackable) {
                cell.addEventListener('click', () => handlePvpAttack(r, c));
            } else {
                cell.classList.add('no-attack');
            }

            container.appendChild(cell);
        }
    }

    document.getElementById('p1-name').textContent = 'Jogador 2';
    document.getElementById('p2-name').textContent = 'Jogador 1';
}

function handlePvpAttack(row, col) {
    if (state.currentTurn !== 2) return;
    const val = state.boards[1][row][col];
    if (val !== CELL.EMPTY && val !== CELL.SHIP) return;

    const result = attack(state.boards[1], state.ships[1], row, col);
    if (!result) return;

    state.stats.shots++;
    if (result === 'hit' || result === 'sunk') state.stats.hits++;

    const label = `[${String.fromCharCode(65 + col)}${row + 1}]`;

    if (result === 'sunk') {
        const sunkShip = state.ships[1].find(s => s.sunk && s.positions.some(([r, c]) => r === row && c === col));
        addLog(`💥 J2 afundou: ${sunkShip ? sunkShip.name : 'navio'}!`, 'sunk');
    } else if (result === 'hit') {
        addLog(`🎯 Jogador 2 acertou ${label}!`, 'hit');
    } else {
        addLog(`💧 Jogador 2 errou ${label}.`, 'miss');
    }

    renderBoardDisplay('enemy-board', state.boards[1], false);
    renderBoardDisplay('player-board', state.boards[2], false);
    updateShipCounts();

    if (allShipsSunk(state.ships[1])) { endGame(2); return; }

    if (result === 'miss') {
        state.currentTurn = 1;
        showPvpOverlay('Passe o dispositivo', 'para o Jogador 1 atacar', () => {
            renderGameBoards();
            document.getElementById('p1-name').textContent = 'Jogador 1';
            document.getElementById('p2-name').textContent = 'Jogador 2';
            updateTurnUI();
        });
    } else {
        updateTurnUI();
        renderPvpEnemyBoard();
    }
}

function updateTurnUI() {
    const badge = document.getElementById('turn-badge');
    if (state.mode === 'pve') {
        if (state.currentTurn === 1) {
            badge.textContent = '⚔️ Seu turno';
            badge.classList.remove('enemy-turn');
        } else {
            badge.textContent = '🤖 Turno do Bot';
            badge.classList.add('enemy-turn');
        }
    } else {
        if (state.currentTurn === 1) {
            badge.textContent = '⚔️ Turno do Jogador 1';
            badge.classList.remove('enemy-turn');
        } else {
            badge.textContent = '⚔️ Turno do Jogador 2';
            badge.classList.add('enemy-turn');
        }
    }
}

function updateShipCounts() {
    const s1 = state.ships[1].filter(s => !s.sunk).length;
    const s2 = state.ships[2].filter(s => !s.sunk).length;
    document.getElementById('p1-ships').textContent = `Navios: ${s1}`;
    document.getElementById('p2-ships').textContent = `Navios: ${s2}`;
}

function renderGameLog() {
    document.getElementById('game-log').innerHTML = '';
}

function addLog(msg, type = 'info') {
    const log = document.getElementById('game-log');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = msg;
    log.prepend(entry);
}

function showPvpOverlay(title, msg, callback) {
    const overlay = document.getElementById('pvp-overlay');
    document.getElementById('overlay-title').textContent = title;
    document.getElementById('overlay-msg').textContent = msg;
    overlay.style.display = 'flex';
    overlay._callback = callback;
}

function hidePvpOverlay() {
    const overlay = document.getElementById('pvp-overlay');
    overlay.style.display = 'none';
    if (overlay._callback) {
        overlay._callback();
        overlay._callback = null;
    }
}

function passTurn() {
    hidePvpOverlay();
}

function endGame(winnerNum) {
    state.phase = 'victory';
    const elapsed = Math.round((Date.now() - state.stats.start) / 1000);
    const acc = state.stats.shots > 0 ? Math.round((state.stats.hits / state.stats.shots) * 100) : 0;

    const titleEl = document.getElementById('victory-title');
    const subtitleEl = document.getElementById('victory-subtitle');
    const statsEl = document.getElementById('victory-stats');

    if (state.mode === 'pve') {
        if (winnerNum === 1) {
            titleEl.textContent = '🏆 Vitória!';
            subtitleEl.textContent = 'Você derrotou o Bot!';
        } else {
            titleEl.textContent = '💀 Derrota!';
            subtitleEl.textContent = 'O Bot afundou todos os seus navios.';
        }
    } else {
        titleEl.textContent = `🏆 Jogador ${winnerNum} venceu!`;
        subtitleEl.textContent = 'Parabéns pela vitória!';
    }

    statsEl.innerHTML = `
    <div>🎯 Tiros disparados: <strong>${state.stats.shots}</strong></div>
    <div>💥 Acertos: <strong>${state.stats.hits}</strong></div>
    <div>📊 Precisão: <strong>${acc}%</strong></div>
    <div>⏱️ Tempo: <strong>${elapsed}s</strong></div>
  `;

    setTimeout(() => showScreen('victory'), 500);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') {
        if (state.phase === 'placement') rotateShip();
    }
});