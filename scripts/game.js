'use strict';

const BOARD_SIZE = 10;
const COLS = 'ABCDEFGHIJ';

const SHIP_TYPES = [
    { id: 'carrier', name: 'PORTA-AVIOES', size: 5 },
    { id: 'battleship', name: 'ENCOURACADO', size: 4 },
    { id: 'cruiser', name: 'CRUZADOR', size: 3 },
    { id: 'submarine', name: 'SUBMARINO', size: 3 },
    { id: 'destroyer', name: 'DESTRUIDOR', size: 2 },
];

const CELL = { EMPTY: 0, SHIP: 1, HIT: 2, MISS: 3, SUNK: 4 };

const DIFF = {
    easy: {
        label: 'FACIL', cls: 'diff-easy',
        huntCheckerboard: false,
        targetSmartDir: false,
        accuracy: 0.5,
    },
    medium: {
        label: 'MEDIO', cls: 'diff-medium',
        huntCheckerboard: true,
        targetSmartDir: false,
        accuracy: 0.75,
    },
    hard: {
        label: 'DIFICIL', cls: 'diff-hard',
        huntCheckerboard: true,
        targetSmartDir: true,
        accuracy: 0.95,
    },
    impossible: {
        label: 'IMPOSSIVEL', cls: 'diff-impossible',
        huntCheckerboard: true,
        targetSmartDir: true,
        accuracy: 1.0,
        probability: true,
    },
};

let state = {
    mode: 'pve',
    difficulty: 'medium',
    phase: 'menu',
    currentPlacer: 1,
    currentTurn: 1,
    placementDirection: 'h',
    selectedShipIdx: null,
    boards: { 1: createEmptyBoard(), 2: createEmptyBoard() },
    ships: { 1: [], 2: [] },
    remaining: { 1: [...SHIP_TYPES], 2: [...SHIP_TYPES] },
    stats: { shots: 0, hits: 0, start: null },
    ai: {
        mode: 'hunt',
        lastHit: null,
        targetQueue: [],
        dirQueue: [],
        hitDir: null,
        firstHit: null,
        attacked: new Set(),
    },
};

function createEmptyBoard() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(CELL.EMPTY));
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
    return { ...shipInfo, positions, hits: 0, sunk: false, dir };
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

function allShipsSunk(ships) { return ships.every(s => s.sunk); }

function randomPlacementForPlayer(playerNum) {
    const board = createEmptyBoard();
    const ships = [];
    for (const shipType of SHIP_TYPES) {
        let placed = false, attempts = 0;
        while (!placed && attempts < 2000) {
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

// ===== AI =====
function buildProbabilityMap() {
    const prob = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
    const remainingSizes = state.ships[1].filter(s => !s.sunk).map(s => s.size);

    for (const size of remainingSizes) {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                // horizontal
                const ph = getPositions(r, c, size, 'h');
                if (ph && ph.every(([pr, pc]) => {
                    const v = state.boards[1][pr][pc];
                    return v === CELL.EMPTY || v === CELL.SHIP;
                })) {
                    for (const [pr, pc] of ph) prob[pr][pc]++;
                }
                // vertical
                const pv = getPositions(r, c, size, 'v');
                if (pv && pv.every(([pr, pc]) => {
                    const v = state.boards[1][pr][pc];
                    return v === CELL.EMPTY || v === CELL.SHIP;
                })) {
                    for (const [pr, pc] of pv) prob[pr][pc]++;
                }
            }
        }
    }
    return prob;
}

function aiBestMove() {
    const ai = state.ai;
    const diff = DIFF[state.difficulty];

    while (ai.targetQueue.length > 0) {
        const [r, c] = ai.targetQueue.shift();
        if (!ai.attacked.has(`${r},${c}`) && isValid(r, c)) {
            return [r, c];
        }
    }

    if (Math.random() > diff.accuracy) {
        const all = [];
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                if (!ai.attacked.has(`${r},${c}`)) all.push([r, c]);
        if (all.length) return all[Math.floor(Math.random() * all.length)];
    }

    if (diff.probability) {
        const prob = buildProbabilityMap();
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                if (state.boards[1][r][c] === CELL.HIT) prob[r][c] += 100;

        let best = -1, bestCells = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (!ai.attacked.has(`${r},${c}`)) {
                    if (prob[r][c] > best) { best = prob[r][c]; bestCells = [[r, c]]; }
                    else if (prob[r][c] === best) bestCells.push([r, c]);
                }
            }
        }
        if (bestCells.length) return bestCells[Math.floor(Math.random() * bestCells.length)];
    }

    if (diff.huntCheckerboard) {
        const candidates = [];
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                if (!ai.attacked.has(`${r},${c}`) && (r + c) % 2 === 0) candidates.push([r, c]);
        if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
    }

    const all = [];
    for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++)
            if (!ai.attacked.has(`${r},${c}`)) all.push([r, c]);
    return all[Math.floor(Math.random() * all.length)];
}

function isValid(r, c) { return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; }

function aiAddTargets(row, col) {
    const ai = state.ai;
    const diff = DIFF[state.difficulty];

    if (diff.targetSmartDir && ai.firstHit && ai.hitDir) {
        const [dr, dc] = ai.hitDir;
        const nr1 = row + dr, nc1 = col + dc;
        const nr2 = ai.firstHit[0] - dr, nc2 = ai.firstHit[1] - dc;
        if (isValid(nr1, nc1) && !ai.attacked.has(`${nr1},${nc1}`)) ai.targetQueue.unshift([nr1, nc1]);
        if (isValid(nr2, nc2) && !ai.attacked.has(`${nr2},${nc2}`)) ai.targetQueue.push([nr2, nc2]);
    } else {
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dr, dc] of dirs) {
            const r = row + dr, c = col + dc;
            if (isValid(r, c) && !ai.attacked.has(`${r},${c}`)) ai.targetQueue.push([r, c]);
        }
        if (diff.targetSmartDir && ai.firstHit) {
            const dr = row - ai.firstHit[0], dc = col - ai.firstHit[1];
            if (dr !== 0 || dc !== 0) {
                const normDr = Math.sign(dr), normDc = Math.sign(dc);
                ai.hitDir = [normDr, normDc];
                const next = [row + normDr, col + normDc];
                const back = [ai.firstHit[0] - normDr, ai.firstHit[1] - normDc];
                ai.targetQueue = [];
                if (isValid(...next) && !ai.attacked.has(`${next[0]},${next[1]}`)) ai.targetQueue.push(next);
                if (isValid(...back) && !ai.attacked.has(`${back[0]},${back[1]}`)) ai.targetQueue.push(back);
            }
        }
    }
}

function aiDoTurn() {
    if (state.phase !== 'game' || state.currentTurn !== 2) return;

    const [row, col] = aiBestMove();
    state.ai.attacked.add(`${row},${col}`);

    const result = attack(state.boards[1], state.ships[1], row, col);
    if (!result) { endBotTurn('miss'); return; }

    state.stats.shots++;
    if (result !== 'miss') state.stats.hits++;

    const label = `[${COLS[col]}${row + 1}]`;

    if (result === 'sunk') {
        const sunk = state.ships[1].find(s => s.sunk && s.positions.some(([r, c]) => r === row && c === col));
        addLog(`BOT AFUNDOU: ${sunk ? sunk.name : 'NAVIO'}!`, 'sunk');
        state.ai.targetQueue = [];
        state.ai.mode = 'hunt';
        state.ai.hitDir = null;
        state.ai.firstHit = null;
    } else if (result === 'hit') {
        addLog(`BOT ACERTOU ${label}`, 'bot');
        if (!state.ai.firstHit) state.ai.firstHit = [row, col];
        aiAddTargets(row, col);
        state.ai.mode = 'target';
    } else {
        addLog(`BOT ERROU ${label}`, 'miss');
    }

    renderGameBoards();
    updateShipCounts();

    if (allShipsSunk(state.ships[1])) { endGame(2); return; }

    endBotTurn(result);
}

function endBotTurn(result) {
    setThinking(false);
    if (result === 'miss') {
        state.currentTurn = 1;
        updateTurnUI();
        renderGameBoards();
    } else {
        updateTurnUI();
        setThinking(true);
        setTimeout(() => {
            if (state.phase === 'game' && state.currentTurn === 2) aiDoTurn();
        }, 700);
    }
}

function setThinking(active) {
    const bar = document.getElementById('thinking-bar');
    if (bar) bar.classList.toggle('active', active);
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${id}`).classList.add('active');
    state.phase = id;
    const exitBtn = document.getElementById('btn-exit');
    if (exitBtn) exitBtn.style.display = (id === 'menu') ? 'none' : 'block';
    const exitOverlay = document.getElementById('exit-overlay');
    if (exitOverlay) exitOverlay.style.display = 'none';
}

function backToMenu() { resetState(); showScreen('menu'); }
function playAgain() { resetState(); showScreen('menu'); }

function resetState() {
    const { mode, difficulty } = state;
    state = {
        mode, difficulty,
        phase: 'menu',
        currentPlacer: 1,
        currentTurn: 1,
        placementDirection: 'h',
        selectedShipIdx: null,
        boards: { 1: createEmptyBoard(), 2: createEmptyBoard() },
        ships: { 1: [], 2: [] },
        remaining: { 1: [...SHIP_TYPES], 2: [...SHIP_TYPES] },
        stats: { shots: 0, hits: 0, start: null },
        ai: { mode: 'hunt', lastHit: null, targetQueue: [], dirQueue: [], hitDir: null, firstHit: null, attacked: new Set() },
    };
}

function selectMode(mode) {
    state.mode = mode;
    const diffSection = document.getElementById('diff-section');
    if (mode === 'pve') {
        diffSection.style.display = 'block';
    } else {
        diffSection.style.display = 'none';
        startGame('pvp', null);
    }
}

function startGame(mode, diff) {
    state.mode = mode;
    if (diff) state.difficulty = diff;
    state.currentPlacer = 1;
    showScreen('placement');
    buildBoardLabels('placement-col-labels', 'placement-row-labels');
    renderPlacementScreen(1);
}

function buildBoardLabels(colId, rowId) {
    const colEl = document.getElementById(colId);
    const rowEl = document.getElementById(rowId);
    if (colEl) {
        colEl.innerHTML = '';
        for (let c = 0; c < BOARD_SIZE; c++) {
            const s = document.createElement('span');
            s.textContent = COLS[c];
            colEl.appendChild(s);
        }
    }
    if (rowEl) {
        rowEl.innerHTML = '';
        for (let r = 0; r < BOARD_SIZE; r++) {
            const s = document.createElement('span');
            s.textContent = r + 1;
            rowEl.appendChild(s);
        }
    }
}

function renderPlacementScreen(playerNum) {
    const titleEl = document.getElementById('placement-title');
    titleEl.textContent = state.mode === 'pvp'
        ? `JOGADOR ${playerNum}: POSICIONE OS NAVIOS`
        : 'POSICIONE SEUS NAVIOS';
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
      <span style="font-size:7px;">${ship.name} (${ship.size})</span>
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
            const val = state.boards[playerNum][r][c];
            if (val === CELL.SHIP) {
                cell.classList.add('ship-placed');
                markShipEnds(cell, r, c, playerNum, 'placement-board');
            }
            cell.addEventListener('click', () => handlePlacementClick(r, c, playerNum));
            cell.addEventListener('mouseenter', () => showPlacementPreview(r, c, playerNum));
            cell.addEventListener('mouseleave', () => clearPlacementPreview());
            container.appendChild(cell);
        }
    }
}

function markShipEnds(cell, r, c, playerNum, boardId) {
    const ship = state.ships[playerNum].find(s => s.positions.some(([sr, sc]) => sr === r && sc === c));
    if (!ship) return;
    const positions = ship.positions;
    const isHead = positions[0][0] === r && positions[0][1] === c;
    const isTail = positions[positions.length - 1][0] === r && positions[positions.length - 1][1] === c;
    if (isHead) cell.classList.add('ship-head');
    if (isTail) cell.classList.add('ship-tail');
}

function getCellEl(boardId, row, col) {
    const board = document.getElementById(boardId);
    return board ? board.children[row * BOARD_SIZE + col] : null;
}

function showPlacementPreview(row, col, playerNum) {
    clearPlacementPreview();
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

function clearPlacementPreview() {
    document.querySelectorAll('#placement-board .cell').forEach(cell => {
        cell.classList.remove('ship-preview', 'invalid');
    });
}

function handlePlacementClick(row, col, playerNum) {
    if (state.selectedShipIdx === null) return;
    const ship = SHIP_TYPES[state.selectedShipIdx];
    if (!state.remaining[playerNum].some(r => r.id === ship.id)) return;
    if (!canPlace(state.boards[playerNum], row, col, ship.size, state.placementDirection)) return;
    const placed = placeShip(state.boards[playerNum], row, col, ship.size, state.placementDirection, { id: ship.id, name: ship.name, size: ship.size });
    state.ships[playerNum].push(placed);
    state.remaining[playerNum] = state.remaining[playerNum].filter(r => r.id !== ship.id);
    const next = state.remaining[playerNum][0];
    state.selectedShipIdx = next ? SHIP_TYPES.findIndex(s => s.id === next.id) : null;
    renderPlacementScreen(playerNum);
}

function updateReadyButton(playerNum) {
    document.getElementById('btn-ready').disabled = state.remaining[playerNum].length > 0;
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
            showPvpOverlay('PASSE O DISPOSITIVO', 'para o Jogador 2 posicionar seus navios', () => {
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
    buildBoardLabels('game-col-labels-1', 'game-row-labels-1');
    buildBoardLabels('game-col-labels-2', 'game-row-labels-2');
    renderGameScreen();
}

function renderGameScreen() {
    document.getElementById('p1-name').textContent = 'JOGADOR 1';
    document.getElementById('p2-name').textContent = state.mode === 'pve' ? 'BOT' : 'JOGADOR 2';

    // Show difficulty badge
    const badge = document.getElementById('turn-badge');
    if (state.mode === 'pve') {
        const d = DIFF[state.difficulty];
        badge.title = d.label;
    }

    updateShipCounts();
    updateTurnUI();
    renderGameBoards();
}

function renderGameBoards() {
    renderBoardDisplay('player-board', state.boards[1], state.ships[1], false, 1);
    renderBoardDisplay('enemy-board', state.boards[2], state.ships[2], true, 2);
}

function renderBoardDisplay(boardId, board, ships, isAttack, playerNum) {
    const container = document.getElementById(boardId);
    if (!container) return;
    container.innerHTML = '';

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            const val = board[r][c];

            if (val === CELL.SHIP && !isAttack) {
                cell.classList.add('ship-placed');
                const ship = ships.find(s => s.positions.some(([sr, sc]) => sr === r && sc === c));
                if (ship) {
                    if (ship.positions[0][0] === r && ship.positions[0][1] === c) cell.classList.add('ship-head');
                    if (ship.positions[ship.positions.length - 1][0] === r && ship.positions[ship.positions.length - 1][1] === c) cell.classList.add('ship-tail');
                }
            }
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
    if (result !== 'miss') state.stats.hits++;

    const label = `[${COLS[col]}${row + 1}]`;

    if (result === 'sunk') {
        const sunk = state.ships[2].find(s => s.sunk && s.positions.some(([r, c]) => r === row && c === col));
        addLog(`VOCE AFUNDOU: ${sunk ? sunk.name : 'NAVIO'}!`, 'sunk');
    } else if (result === 'hit') {
        addLog(`ACERTO ${label}`, 'hit');
    } else {
        addLog(`ERRO ${label}`, 'miss');
    }

    renderGameBoards();
    updateShipCounts();

    if (allShipsSunk(state.ships[2])) { endGame(1); return; }

    if (state.mode === 'pve') {
        if (result === 'miss') {
            // Player missed -> bot's turn
            state.currentTurn = 2;
            updateTurnUI();
            setThinking(true);
            setTimeout(() => {
                if (state.phase === 'game' && state.currentTurn === 2) aiDoTurn();
            }, 900);
        } else {
            updateTurnUI();
        }
    } else {
        if (result === 'miss') {
            state.currentTurn = 2;
            updateTurnUI();
            showPvpOverlay('PASSE O DISPOSITIVO', 'para o Jogador 2 atacar', () => {
                renderPvpEnemyBoard();
            });
        } else {
            updateTurnUI();
        }
    }
}

function renderPvpEnemyBoard() {
    renderBoardDisplay('player-board', state.boards[2], state.ships[2], false, 2);
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
    document.getElementById('p1-name').textContent = 'JOGADOR 2';
    document.getElementById('p2-name').textContent = 'JOGADOR 1';
}

function handlePvpAttack(row, col) {
    if (state.currentTurn !== 2) return;
    const val = state.boards[1][row][col];
    if (val !== CELL.EMPTY && val !== CELL.SHIP) return;

    const result = attack(state.boards[1], state.ships[1], row, col);
    if (!result) return;

    state.stats.shots++;
    if (result !== 'miss') state.stats.hits++;

    const label = `[${COLS[col]}${row + 1}]`;

    if (result === 'sunk') {
        const sunk = state.ships[1].find(s => s.sunk && s.positions.some(([r, c]) => r === row && c === col));
        addLog(`J2 AFUNDOU: ${sunk ? sunk.name : 'NAVIO'}!`, 'sunk');
    } else if (result === 'hit') {
        addLog(`J2 ACERTOU ${label}`, 'hit');
    } else {
        addLog(`J2 ERROU ${label}`, 'miss');
    }

    renderBoardDisplay('enemy-board', state.boards[1], state.ships[1], false, 1);
    renderBoardDisplay('player-board', state.boards[2], state.ships[2], false, 2);
    updateShipCounts();

    if (allShipsSunk(state.ships[1])) { endGame(2); return; }

    if (result === 'miss') {
        state.currentTurn = 1;
        showPvpOverlay('PASSE O DISPOSITIVO', 'para o Jogador 1 atacar', () => {
            renderGameBoards();
            document.getElementById('p1-name').textContent = 'JOGADOR 1';
            document.getElementById('p2-name').textContent = 'JOGADOR 2';
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
            badge.textContent = '> SEU TURNO';
            badge.className = 'turn-badge';
        } else {
            badge.textContent = '> BOT JOGANDO...';
            badge.className = 'turn-badge bot-thinking';
        }
    } else {
        badge.textContent = state.currentTurn === 1 ? '> TURNO J1' : '> TURNO J2';
        badge.className = `turn-badge ${state.currentTurn === 2 ? 'enemy-turn' : ''}`;
    }
}

function updateShipCounts() {
    const s1 = state.ships[1].filter(s => !s.sunk).length;
    const s2 = state.ships[2].filter(s => !s.sunk).length;
    document.getElementById('p1-ships').textContent = `NAVIOS: ${s1}`;
    document.getElementById('p2-ships').textContent = `NAVIOS: ${s2}`;
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
    if (overlay._callback) { overlay._callback(); overlay._callback = null; }
}

function endGame(winnerNum) {
    state.phase = 'victory';
    setThinking(false);
    const elapsed = Math.round((Date.now() - state.stats.start) / 1000);
    const acc = state.stats.shots > 0 ? Math.round((state.stats.hits / state.stats.shots) * 100) : 0;

    const titleEl = document.getElementById('victory-title');
    const subtitleEl = document.getElementById('victory-subtitle');
    const iconEl = document.getElementById('victory-icon');
    const statsEl = document.getElementById('victory-stats');

    if (state.mode === 'pve') {
        if (winnerNum === 1) {
            iconEl.textContent = '*** WIN ***';
            iconEl.style.color = '#ffe600';
            titleEl.textContent = 'VITORIA!';
            subtitleEl.textContent = 'Voce derrotou o Bot!';
        } else {
            iconEl.textContent = '--- KO ---';
            iconEl.style.color = '#ff2020';
            titleEl.textContent = 'DERROTA!';
            subtitleEl.textContent = 'O Bot afundou tudo.';
        }
    } else {
        iconEl.textContent = '*** WIN ***';
        iconEl.style.color = '#ffe600';
        titleEl.textContent = `JOGADOR ${winnerNum} VENCEU!`;
        subtitleEl.textContent = 'Parabens pela vitoria!';
    }

    const diffLabel = state.mode === 'pve' ? ` | ${DIFF[state.difficulty].label}` : '';
    statsEl.innerHTML = `
    <div>TIROS: <strong>${state.stats.shots}</strong></div>
    <div>ACERTOS: <strong>${state.stats.hits}</strong></div>
    <div>PRECISAO: <strong>${acc}%</strong></div>
    <div>TEMPO: <strong>${elapsed}s</strong>${diffLabel}</div>
  `;

    setTimeout(() => showScreen('victory'), 600);
}

document.addEventListener('keydown', e => {
    if ((e.key === 'r' || e.key === 'R') && state.phase === 'placement') rotateShip();
});

buildBoardLabels('placement-col-labels', 'placement-row-labels');

function onExitClick() {
    if (state.phase === 'game') {
        showExitOverlay();
    } else {
        backToMenu();
    }
}

function showExitOverlay() {
    const overlay = document.getElementById('exit-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
}

function hideExitOverlay() {
    const overlay = document.getElementById('exit-overlay');
    if (!overlay) return;
    overlay.style.display = 'none';
}

function confirmExit() {
    hideExitOverlay();
    backToMenu();
}

window.addEventListener('beforeunload', (e) => {
    if (state.phase === 'game') {
        e.preventDefault();
        e.returnValue = '';
        return '';
    }
});