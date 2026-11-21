'use strict';

const BOARD_SIZE = 10;
const COLS = 'ABCDEFGHIJ';

const SHIP_TYPES = [
    { id: 'carrier', name: 'PORTA-AVIÕES', size: 5 },
    { id: 'battleship', name: 'ENCOURAÇADO', size: 4 },
    { id: 'cruiser', name: 'CRUZADOR', size: 3 },
    { id: 'submarine', name: 'SUBMARINO', size: 3 },
    { id: 'destroyer', name: 'DESTRUIDOR', size: 2 },
];

const CELL = { EMPTY: 0, SHIP: 1, HIT: 2, MISS: 3, SUNK: 4 };

const DIFF = {
    easy: {
        label: 'FÁCIL', cls: 'diff-easy',
        huntCheckerboard: false,
        targetSmartDir: false,
        accuracy: 0.5,
    },
    medium: {
        label: 'MÉDIO', cls: 'diff-medium',
        huntCheckerboard: true,
        targetSmartDir: false,
        accuracy: 0.75,
    },
    hard: {
        label: 'DIFÍCIL', cls: 'diff-hard',
        huntCheckerboard: true,
        targetSmartDir: true,
        accuracy: 0.95,
    },
    impossible: {
        label: 'IMPOSSÍVEL', cls: 'diff-impossible',
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
    online: {
        socket: null,
        playerNumber: null,
        lobbyCode: null,
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

    state.lastOwnCell = [row, col];
    const name = cellName(row, col);

    if (result === 'sunk') {
        const sunk = state.ships[1].find(s => s.sunk && s.positions.some(([r, c]) => r === row && c === col));
        addLog('BOT', `Afundou seu ${sunk ? sunk.name : 'NAVIO'}!`, 'bad');
        state.ai.targetQueue = [];
        state.ai.mode = 'hunt';
        state.ai.hitDir = null;
        state.ai.firstHit = null;
    } else if (result === 'hit') {
        addLog('BOT', `Acertou ${name}`, 'bad');
        if (!state.ai.firstHit) state.ai.firstHit = [row, col];
        aiAddTargets(row, col);
        state.ai.mode = 'target';
    } else {
        addLog('BOT', `Errou em ${name}`, 'miss');
    }

    renderGameBoards();
    updateShipCounts();
    updateShotStats();

    if (allShipsSunk(state.ships[1])) { endGame(2); return; }

    endBotTurn(result);
}

function endBotTurn(result) {
    if (state.phase !== 'game') return;
    if (result === 'miss') {
        state.thinking = false;
        state.currentTurn = 1;
        updateTurnUI();
        renderGameBoards();
        return;
    }
    scheduleBotTurn(900);
}

function scheduleBotTurn(delay) {
    const gameId = state.gameId;
    setTimeout(() => {
        if (state.gameId === gameId && state.phase === 'game' && state.currentTurn === 2) aiDoTurn();
    }, delay);
}

function cellName(r, c) { return `${COLS[r]}${c + 1}`; }

function newStats() { return { shots: 0, hits: 0, streak: 0, bestStreak: 0 }; }

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function otherPlayer(n) { return n === 1 ? 2 : 1; }

function getViewer() {
    if (state.mode === 'online') return state.online.playerNumber || 1;
    if (state.mode === 'pvp') return state.pvpViewer;
    return 1;
}

function playerColor(n) {
    if (state.mode === 'pvp') return n === 1 ? 'cyan' : 'orange';
    if (state.mode === 'online') return n === getViewer() ? 'cyan' : 'orange';
    return n === 1 ? 'cyan' : 'red';
}

function restartAnimation(node, className) {
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
}

function setThinking(active) {
    state.thinking = active;
    if (state.phase === 'game') updateTurnUI();
}

function recordShot(player, result) {
    const s = state.stats[player];
    s.shots++;
    if (result === 'miss') {
        s.streak = 0;
    } else {
        s.hits++;
        s.streak++;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
    }
    if (result === 'miss') state.banner = { last: null, streak: 0 };
    else state.banner = { last: result, streak: state.banner.streak + 1 };
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${id}`).classList.add('active');
    state.phase = id;
    hideExitOverlay();
    updateRadioVisibility();
    window.scrollTo(0, 0);
}

function backToMenu() {
    if (state.online.socket && state.online.lobbyCode) state.online.socket.emit('leave-lobby');
    resetState();
    document.getElementById('pvp-overlay').style.display = 'none';
    selectMode(state.mode);
    showScreen('menu');
}

function playAgain() {
    const { mode, difficulty } = state;
    if (mode === 'online') { backToMenu(); return; }
    resetState();
    state.mode = mode;
    startGame(mode, difficulty);
}

function resetState() {
    const { mode, difficulty } = state;
    const nextMode = mode === 'online' ? 'pve' : mode;
    state = {
        mode: nextMode, difficulty,
        phase: 'menu',
        gameId: 0,
        currentPlacer: 1,
        currentTurn: 1,
        placementDirection: 'h',
        selectedShipIdx: null,
        hoverCell: null,
        boards: { 1: createEmptyBoard(), 2: createEmptyBoard() },
        ships: { 1: [], 2: [] },
        remaining: { 1: [...SHIP_TYPES], 2: [...SHIP_TYPES] },
        stats: { 1: newStats(), 2: newStats(), start: null },
        banner: { last: null, streak: 0 },
        thinking: false,
        lastShotCell: null,
        lastOwnCell: null,
        pvpViewer: 1,
        pvpEvents: [],
        ai: { mode: 'hunt', lastHit: null, targetQueue: [], dirQueue: [], hitDir: null, firstHit: null, attacked: new Set() },
        online: { socket: state.online.socket, playerNumber: null, lobbyCode: null, shipsLeft: null, readySent: false, isHost: false },
    };
}

function selectMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.mode-card').forEach(card => {
        card.setAttribute('aria-pressed', String(card.dataset.mode === mode));
    });
    document.getElementById('diff-section').style.display = mode === 'pve' ? '' : 'none';
    document.getElementById('launch-label').textContent = mode === 'online' ? 'ABRIR LOBBY' : 'ZARPAR';
}

function selectDifficulty(diff) {
    state.difficulty = diff;
    document.querySelectorAll('.diff-card').forEach(card => {
        card.setAttribute('aria-pressed', String(card.dataset.diff === diff));
    });
}

function launchMode() {
    if (state.mode === 'online') { openLobby(); return; }
    startGame(state.mode, state.mode === 'pve' ? state.difficulty : null);
}

function toggleRules(open) {
    document.getElementById('rules-overlay').style.display = open ? 'flex' : 'none';
}

function initMenu() {
    const stars = document.getElementById('stars');
    for (let k = 0; k < 28; k++) {
        const star = el('span', 'star');
        star.style.left = `${(k * 37 + 11) % 100}%`;
        star.style.top = `${(k * 53) % 250 + 8}px`;
        star.style.animationDelay = `-${((k * 0.43) % 3).toFixed(2)}s`;
        if (k % 4 === 0) { star.style.width = '4px'; star.style.height = '4px'; }
        stars.appendChild(star);
    }
    document.querySelectorAll('.pips[data-level]').forEach(pips => {
        const level = Number(pips.dataset.level);
        for (let i = 1; i <= 4; i++) pips.appendChild(el('i', i <= level ? 'on' : ''));
    });
    selectMode(state.mode);
    selectDifficulty(state.difficulty);
}

function getOnlineSocket() {
    if (!state.online.socket && window.io) {
        const serverUrl = (window.SOCKET_SERVER_URL || '').trim();
        const socket = serverUrl ? window.io(serverUrl) : window.io();
        state.online.socket = socket;
        socket.on('connect', () => updateServerStatus('on'));
        socket.on('disconnect', () => updateServerStatus('off'));
        socket.on('connect_error', () => {
            updateServerStatus('off');
            showLobbyError('Não foi possível conectar ao servidor online.');
        });
        setupOnlineListeners(socket);
    }
    return state.online.socket;
}

function updateServerStatus(status) {
    const dot = document.getElementById('server-dot');
    const label = document.getElementById('server-label');
    dot.className = `server-dot ${status === 'on' ? 'on' : status === 'off' ? 'off' : ''}`;
    label.textContent = status === 'on' ? 'SERVIDOR ONLINE'
        : status === 'off' ? 'SERVIDOR OFFLINE'
            : 'CONECTANDO...';
}

function openLobby() {
    state.mode = 'online';
    showLobbyMenu();
    showScreen('lobby');
    const socket = getOnlineSocket();
    if (!socket) {
        updateServerStatus('off');
        showLobbyError('Cliente online indisponível. Recarregue a página.');
        return;
    }
    updateServerStatus(socket.connected ? 'on' : 'pending');
}

function showLobbyMenu() {
    document.getElementById('lobby-menu').style.display = '';
    document.getElementById('lobby-waiting').style.display = 'none';
    document.getElementById('lobby-code').value = '';
    showLobbyError('');
}

function showLobbyError(message) {
    const error = document.getElementById('lobby-error');
    const input = document.getElementById('lobby-code');
    error.textContent = message;
    input.classList.toggle('error', Boolean(message));
    if (message) restartAnimation(document.getElementById('join-row'), 'shake');
}

function createLobby() {
    const socket = getOnlineSocket();
    if (!socket) return;
    showLobbyError('');
    socket.emit('create-lobby');
}

function joinLobby(event) {
    if (event) event.preventDefault();
    const socket = getOnlineSocket();
    if (!socket) return;
    const code = document.getElementById('lobby-code').value.trim().toUpperCase();
    if (code.length < 4) { showLobbyError('O código tem 4 caracteres.'); return; }
    showLobbyError('');
    socket.emit('join-lobby', { code });
}

function showLobbyWaiting(code) {
    state.online.lobbyCode = code;
    document.getElementById('lobby-menu').style.display = 'none';
    document.getElementById('lobby-waiting').style.display = '';
    const chars = document.getElementById('lobby-code-display');
    chars.replaceChildren(...code.split('').map(ch => el('span', '', ch)));
    chars.setAttribute('aria-label', `Código da sala: ${code.split('').join(' ')}`);
    document.getElementById('room-caption').textContent = state.online.isHost ? 'CÓDIGO DA SUA SALA' : 'VOCÊ ENTROU NA SALA';
    document.getElementById('btn-copy').style.display = state.online.isHost ? '' : 'none';
    document.getElementById('copy-label').textContent = 'COPIAR CÓDIGO';
    clearChat();
    renderLobbyRoom(!state.online.isHost);
}

function renderLobbyRoom(opponentConnected) {
    const host = state.online.isHost;
    const room = document.getElementById('lobby-waiting');
    room.classList.toggle('waiting', !opponentConnected);
    document.getElementById('radar-icon').setAttribute('fill', opponentConnected ? '#00ff88' : '#1e4a70');

    const status = document.getElementById('lobby-status');
    if (!opponentConnected) {
        status.replaceChildren('Aguardando adversário', dotsEl());
    } else {
        status.textContent = host ? 'Adversário conectado! Hora da batalha.' : 'Conectado ao anfitrião.';
    }

    const slots = [
        { n: 'P1', name: host ? 'VOCÊ' : 'ANFITRIÃO', role: 'ANFITRIÃO', on: true, color: 'var(--cyan)' },
        { n: 'P2', name: host ? (opponentConnected ? 'ADVERSÁRIO' : 'VAGA ABERTA') : 'VOCÊ', role: 'CONVIDADO', on: opponentConnected, color: 'var(--orange)' },
    ];
    document.getElementById('crew-slots').replaceChildren(...slots.map(slot => {
        const row = el('div', `slot ${slot.on ? 'on' : ''}`);
        const badge = el('span', 'slot-badge', slot.n);
        if (slot.on) badge.style.background = slot.color;
        const info = el('span', 'slot-info');
        info.append(el('span', 'slot-name', slot.name), el('span', 'slot-status', slot.on ? '● CONECTADO' : 'aguardando…'));
        row.append(badge, info, el('span', 'slot-role', slot.role));
        return row;
    }));
}

function dotsEl() {
    const dots = el('span', 'dots');
    for (let i = 0; i < 3; i++) dots.appendChild(el('span', '', '.'));
    return dots;
}

function copyLobbyCode() {
    const code = state.online.lobbyCode;
    if (!code) return;
    try {
        if (navigator.clipboard) navigator.clipboard.writeText(code);
    } catch (e) { }
    const label = document.getElementById('copy-label');
    label.textContent = 'COPIADO!';
    setTimeout(() => { label.textContent = 'COPIAR CÓDIGO'; }, 1600);
}

function leaveRoom() {
    if (state.online.socket && state.online.lobbyCode) state.online.socket.emit('leave-lobby');
    state.online.lobbyCode = null;
    state.online.playerNumber = null;
    state.online.isHost = false;
    showLobbyMenu();
}

function leaveLobby() {
    backToMenu();
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
    if (colEl) colEl.replaceChildren(...Array.from({ length: BOARD_SIZE }, (_, c) => el('span', '', String(c + 1))));
    if (rowEl) rowEl.replaceChildren(...Array.from({ length: BOARD_SIZE }, (_, r) => el('span', '', COLS[r])));
}

function placementLocked() {
    return state.mode === 'online' && state.online.readySent;
}

function ensureSelection(playerNum) {
    const remaining = state.remaining[playerNum];
    const current = state.selectedShipIdx !== null ? SHIP_TYPES[state.selectedShipIdx] : null;
    if (current && remaining.some(r => r.id === current.id)) return;
    state.selectedShipIdx = remaining.length ? SHIP_TYPES.findIndex(s => s.id === remaining[0].id) : null;
}

function renderPlacementScreen(playerNum) {
    const title = document.getElementById('placement-title');
    title.replaceChildren();
    if (state.mode === 'pvp') title.append(`JOGADOR ${playerNum}:`, el('br'), 'POSICIONE SUA FROTA');
    else title.append('POSICIONE', el('br'), 'SUA FROTA');
    if (!placementLocked()) {
        document.getElementById('placement-subtitle').textContent =
            'Escolha um navio, passe o mouse no mar e clique para ancorar. Navios não podem se encostar.';
    }
    ensureSelection(playerNum);
    renderShipList(playerNum);
    renderPlacementBoard(playerNum);
    updateReadyButton(playerNum);
}

function renderShipList(playerNum) {
    const container = document.getElementById('ship-list');
    container.replaceChildren(...SHIP_TYPES.map((ship, idx) => {
        const placed = !state.remaining[playerNum].some(r => r.id === ship.id);
        const selected = state.selectedShipIdx === idx;
        const button = el('button', `dock-item ${placed ? 'placed' : ''}`);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(selected));
        button.disabled = placed || placementLocked();
        const left = el('span', 'dock-left');
        const blocks = el('span', 'dock-blocks');
        blocks.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < ship.size; i++) blocks.appendChild(el('i'));
        left.append(el('span', 'dock-name', ship.name), blocks);
        const status = selected ? 'SELECIONADO' : placed ? '✓ ANCORADO' : `${ship.size} CASAS`;
        button.append(left, el('span', 'dock-status', status));
        button.addEventListener('click', () => selectShip(idx, playerNum));
        return button;
    }));

    const placedCount = SHIP_TYPES.length - state.remaining[playerNum].length;
    const progress = document.getElementById('fleet-progress');
    progress.replaceChildren(...SHIP_TYPES.map(ship =>
        el('i', state.remaining[playerNum].some(r => r.id === ship.id) ? '' : 'on')));
    progress.setAttribute('aria-label', `${placedCount} de ${SHIP_TYPES.length} navios posicionados`);
    document.getElementById('fleet-count').textContent = `${placedCount}/${SHIP_TYPES.length}`;
    document.getElementById('dir-label').textContent = `GIRAR · ${state.placementDirection === 'h' ? 'H' : 'V'}`;
}

function selectShip(idx, playerNum) {
    if (placementLocked()) return;
    if (!state.remaining[playerNum].some(r => r.id === SHIP_TYPES[idx].id)) return;
    state.selectedShipIdx = idx;
    renderShipList(playerNum);
}

function rotateShip() {
    if (placementLocked()) return;
    state.placementDirection = state.placementDirection === 'h' ? 'v' : 'h';
    renderShipList(state.currentPlacer);
    if (state.hoverCell) showPlacementPreview(...state.hoverCell, state.currentPlacer);
}

function clearBoard() {
    if (placementLocked()) return;
    state.boards[state.currentPlacer] = createEmptyBoard();
    state.ships[state.currentPlacer] = [];
    state.remaining[state.currentPlacer] = [...SHIP_TYPES];
    state.selectedShipIdx = null;
    renderPlacementScreen(state.currentPlacer);
}

function randomPlacement() {
    if (placementLocked()) return;
    const { board, ships } = randomPlacementForPlayer(state.currentPlacer);
    state.boards[state.currentPlacer] = board;
    state.ships[state.currentPlacer] = ships;
    state.remaining[state.currentPlacer] = [];
    state.selectedShipIdx = null;
    renderPlacementScreen(state.currentPlacer);
}

function renderPlacementBoard(playerNum) {
    const container = document.getElementById('placement-board');
    const cells = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const isShip = state.boards[playerNum][r][c] === CELL.SHIP;
            const cell = el('button', `cell ${(r + c) % 2 ? 'alt' : ''} ${isShip ? 'ship' : ''}`);
            cell.type = 'button';
            cell.setAttribute('aria-label', `${cellName(r, c)} — ${isShip ? 'navio' : 'água'}`);
            cell.addEventListener('click', () => handlePlacementClick(r, c, playerNum));
            cell.addEventListener('mouseenter', () => showPlacementPreview(r, c, playerNum));
            cell.addEventListener('focus', () => showPlacementPreview(r, c, playerNum));
            cells.push(cell);
        }
    }
    container.replaceChildren(...cells);
    container.onmouseleave = () => { state.hoverCell = null; clearPlacementPreview(); };
}

function getCellEl(boardId, row, col) {
    const board = document.getElementById(boardId);
    return board ? board.children[row * BOARD_SIZE + col] : null;
}

function showPlacementPreview(row, col, playerNum) {
    state.hoverCell = [row, col];
    clearPlacementPreview();
    if (placementLocked() || state.selectedShipIdx === null) return;
    const ship = SHIP_TYPES[state.selectedShipIdx];
    if (!state.remaining[playerNum].some(r => r.id === ship.id)) return;
    const valid = canPlace(state.boards[playerNum], row, col, ship.size, state.placementDirection);
    for (let i = 0; i < ship.size; i++) {
        const r = state.placementDirection === 'h' ? row : row + i;
        const c = state.placementDirection === 'h' ? col + i : col;
        if (!isValid(r, c)) break;
        const cell = getCellEl('placement-board', r, c);
        if (cell) cell.classList.add(valid ? 'preview-ok' : 'preview-bad');
    }
}

function clearPlacementPreview() {
    document.querySelectorAll('#placement-board .cell').forEach(cell => {
        cell.classList.remove('preview-ok', 'preview-bad');
    });
}

function pickUpShip(row, col, playerNum) {
    const ships = state.ships[playerNum];
    const idx = ships.findIndex(s => s.positions.some(([r, c]) => r === row && c === col));
    if (idx < 0) return false;
    const [ship] = ships.splice(idx, 1);
    for (const [r, c] of ship.positions) state.boards[playerNum][r][c] = CELL.EMPTY;
    const placedIds = new Set(ships.map(s => s.id));
    state.remaining[playerNum] = SHIP_TYPES.filter(t => !placedIds.has(t.id));
    state.selectedShipIdx = SHIP_TYPES.findIndex(t => t.id === ship.id);
    return true;
}

function handlePlacementClick(row, col, playerNum) {
    if (placementLocked()) return;
    if (state.selectedShipIdx === null) {
        if (pickUpShip(row, col, playerNum)) renderPlacementScreen(playerNum);
        return;
    }
    const ship = SHIP_TYPES[state.selectedShipIdx];
    if (!state.remaining[playerNum].some(r => r.id === ship.id)) return;
    if (!canPlace(state.boards[playerNum], row, col, ship.size, state.placementDirection)) return;
    const placed = placeShip(state.boards[playerNum], row, col, ship.size, state.placementDirection, { id: ship.id, name: ship.name, size: ship.size });
    state.ships[playerNum].push(placed);
    state.remaining[playerNum] = state.remaining[playerNum].filter(r => r.id !== ship.id);
    state.selectedShipIdx = null;
    renderPlacementScreen(playerNum);
}

function updateReadyButton(playerNum) {
    const button = document.getElementById('btn-ready');
    const left = state.remaining[playerNum].length;
    if (placementLocked()) {
        button.disabled = true;
        button.textContent = 'AGUARDANDO...';
    } else if (left > 0) {
        button.disabled = true;
        button.textContent = left === 1 ? 'FALTA 1 NAVIO' : `FALTAM ${left} NAVIOS`;
    } else {
        button.disabled = false;
        button.textContent = 'PRONTO! FOGO!';
    }
}

function playerReady() {
    if (state.mode === 'online') {
        const socket = getOnlineSocket();
        state.online.readySent = true;
        document.getElementById('placement-subtitle').textContent = 'Frota pronta. Aguardando o adversário...';
        renderPlacementScreen(state.online.playerNumber);
        clearPlacementPreview();
        if (socket) socket.emit('player-ready', {
            board: state.boards[state.online.playerNumber],
            ships: state.ships[state.online.playerNumber],
        });
    } else if (state.mode === 'pve') {
        const { board, ships } = randomPlacementForPlayer(2);
        state.boards[2] = board;
        state.ships[2] = ships;
        startGamePhase();
    } else if (state.currentPlacer === 1) {
        state.currentPlacer = 2;
        state.selectedShipIdx = null;
        showPvpOverlay({ to: 2, msg: 'Jogador 1, não olhe! Agora o Jogador 2 posiciona a frota.' }, () => {
            renderPlacementScreen(2);
        });
    } else {
        showPvpOverlay({ to: 1, msg: 'Frotas posicionadas. O Jogador 1 abre fogo.' }, startGamePhase);
    }
}

function startGamePhase() {
    state.phase = 'game';
    state.gameId = Date.now();
    state.currentTurn = 1;
    state.stats.start = Date.now();
    state.banner = { last: null, streak: 0 };
    state.pvpViewer = 1;
    state.pvpEvents = [];
    document.getElementById('game-log').replaceChildren();
    showScreen('game');
    buildBoardLabels('game-col-labels-1', 'game-row-labels-1');
    buildBoardLabels('game-col-labels-2', 'game-row-labels-2');
    renderGameScreen();
}

function renderGameScreen() {
    const viewer = getViewer();
    const foe = otherPlayer(viewer);
    const screen = document.getElementById('screen-game');
    screen.classList.toggle('mode-online', state.mode === 'online');

    const meAvatar = document.getElementById('me-avatar');
    const foeAvatar = document.getElementById('foe-avatar');
    meAvatar.className = `avatar avatar-${playerColor(viewer)}`;
    foeAvatar.className = `avatar avatar-${playerColor(foe)}`;
    meAvatar.textContent = `P${viewer}`;
    foeAvatar.textContent = state.mode === 'pve' ? 'IA' : `P${foe}`;

    const modeLabel = document.getElementById('game-mode-label');
    const labelEnemy = document.getElementById('label-enemy');
    const labelPlayer = document.getElementById('label-player');
    if (state.mode === 'pve') {
        document.getElementById('p1-name').textContent = 'VOCÊ';
        document.getElementById('p2-name').textContent = `BOT · ${DIFF[state.difficulty].label}`;
        modeLabel.textContent = `VS BOT · ${DIFF[state.difficulty].label}`;
        labelEnemy.textContent = '> RADAR INIMIGO';
        labelPlayer.textContent = 'SEU MAR';
    } else if (state.mode === 'pvp') {
        document.getElementById('p1-name').textContent = `JOGADOR ${viewer}`;
        document.getElementById('p2-name').textContent = `JOGADOR ${foe}`;
        modeLabel.textContent = '1 VS 1';
        labelEnemy.textContent = `> MAR DO JOGADOR ${foe}`;
        labelPlayer.textContent = `SEU MAR · J${viewer}`;
    } else {
        document.getElementById('p1-name').textContent = 'VOCÊ';
        document.getElementById('p2-name').textContent = 'ADVERSÁRIO';
        modeLabel.textContent = `ONLINE · SALA ${state.online.lobbyCode || ''}`;
        labelEnemy.textContent = 'ALVO · MAR DO ADVERSÁRIO';
        labelPlayer.textContent = 'SUA FROTA';
    }

    updateShipCounts();
    updateTurnUI();
    renderGameBoards();
    updateShotStats();
}

function renderGameBoards() {
    const viewer = getViewer();
    const foe = otherPlayer(viewer);
    renderOwnBoard(state.boards[viewer], state.ships[viewer]);
    renderEnemyBoard(state.boards[foe]);
    renderEnemyFleet(state.ships[foe]);
}

function renderOwnBoard(board, ships) {
    const container = document.getElementById('player-board');
    const cells = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const val = board[r][c];
            const cell = el('span', `cell ${(r + c) % 2 ? 'alt' : ''}`);
            if (val === CELL.SHIP) cell.classList.add('ship');
            if (val === CELL.HIT) cell.classList.add('hit');
            if (val === CELL.SUNK) cell.classList.add('sunk');
            if (val === CELL.MISS) cell.classList.add('miss');
            const last = state.lastOwnCell;
            if (last && last[0] === r && last[1] === c) cell.classList.add('fx-hit');
            cells.push(cell);
        }
    }
    container.replaceChildren(...cells);
    const damage = board.flat().filter(v => v === CELL.HIT || v === CELL.SUNK).length;
    document.getElementById('own-damage').textContent = `${damage} danos`;
}

function hitMark() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 10 10');
    svg.setAttribute('class', 'mark-x');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M1 1h2v2H1zM7 1h2v2H7zM3 3h4v4H3zM1 7h2v2H1zM7 7h2v2H7z');
    path.setAttribute('fill', '#fff4c2');
    svg.appendChild(path);
    return svg;
}

function renderEnemyBoard(board) {
    const container = document.getElementById('enemy-board');
    const cells = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const val = board[r][c];
            const cell = el('button', 'cell');
            cell.type = 'button';
            let label = 'atirar';
            if (val === CELL.HIT || val === CELL.SUNK) {
                cell.classList.add(val === CELL.SUNK ? 'sunk' : 'hit');
                cell.appendChild(hitMark());
                label = val === CELL.SUNK ? 'afundado' : 'acerto';
            } else if (val === CELL.MISS) {
                cell.classList.add('miss');
                cell.appendChild(el('span', 'mark-dot'));
                label = 'água';
            }
            const last = state.lastShotCell;
            if (last && last[0] === r && last[1] === c) cell.classList.add(val === CELL.MISS ? 'fx-miss' : 'fx-hit');
            if (canAttack(r, c)) {
                cell.classList.add('target');
                cell.addEventListener('click', () => handleAttack(r, c));
            } else {
                cell.disabled = true;
            }
            cell.setAttribute('aria-label', `${cellName(r, c)} — ${label}`);
            cells.push(cell);
        }
    }
    container.replaceChildren(...cells);
}

function renderEnemyFleet(ships) {
    const container = document.getElementById('enemy-fleet');
    const ordered = SHIP_TYPES.map(type => ships.find(s => s.id === type.id)).filter(Boolean);
    container.replaceChildren(...ordered.map(ship => {
        const row = el('div', `fleet-row ${ship.sunk ? 'sunk' : ''}`);
        const segs = el('span', 'fleet-segs');
        segs.setAttribute('aria-label', ship.sunk ? 'afundado' : `${ship.hits} de ${ship.size} atingidos`);
        for (let i = 0; i < ship.size; i++) segs.appendChild(el('i', i < ship.hits ? 'hit' : ''));
        row.append(el('span', 'fleet-row-name', ship.name), segs);
        return row;
    }));
}

function canAttack(r, c) {
    if (state.phase !== 'game') return false;
    const viewer = getViewer();
    if (state.currentTurn !== viewer) return false;
    if (state.mode === 'pvp' && document.getElementById('pvp-overlay').style.display !== 'none') return false;
    const val = state.boards[otherPlayer(viewer)][r][c];
    return val === CELL.EMPTY || val === CELL.SHIP;
}

function handleAttack(row, col) {
    if (!canAttack(row, col)) return;
    if (state.mode === 'online') {
        getOnlineSocket()?.emit('attack', { row, col });
        return;
    }

    const attacker = state.mode === 'pvp' ? state.currentTurn : 1;
    const target = otherPlayer(attacker);
    const result = attack(state.boards[target], state.ships[target], row, col);
    if (!result) return;

    recordShot(attacker, result);
    state.lastShotCell = [row, col];
    const name = cellName(row, col);
    const who = state.mode === 'pve' ? 'VOCÊ' : `J${attacker}`;
    const sunkShip = result === 'sunk'
        ? state.ships[target].find(s => s.sunk && s.positions.some(([r, c]) => r === row && c === col))
        : null;
    const hitShip = result === 'hit'
        ? state.ships[target].find(s => s.positions.some(([r, c]) => r === row && c === col))
        : null;

    if (sunkShip) addLog(who, `AFUNDOU o ${sunkShip.name}!`, 'sunk');
    else if (result === 'hit') addLog(who, state.banner.streak > 1 ? `Acertou ${name} — combo x${state.banner.streak}!` : `Acertou ${name}`, 'hit');
    else addLog(who, `Água em ${name}`, 'miss');

    if (state.mode === 'pvp') {
        const text = sunkShip ? `Jogador ${attacker} afundou seu ${sunkShip.name} em ${name}`
            : hitShip ? `Jogador ${attacker} acertou seu ${hitShip.name} em ${name}`
                : `Jogador ${attacker} errou em ${name} — sua vez`;
        state.pvpEvents.push({ hit: result !== 'miss', text });
    }

    renderGameBoards();
    updateShipCounts();
    updateShotStats();
    if (result !== 'miss') restartAnimation(document.getElementById('enemy-board-wrap'), 'shake');

    if (allShipsSunk(state.ships[target])) { endGame(attacker); return; }

    if (result !== 'miss') { updateTurnUI(); return; }

    state.currentTurn = target;
    if (state.mode === 'pve') {
        setThinking(true);
        renderGameBoards();
        scheduleBotTurn(1100);
        return;
    }

    updateTurnUI();
    renderGameBoards();
    const gameId = state.gameId;
    setTimeout(() => {
        if (state.gameId !== gameId || state.phase !== 'game') return;
        showPvpOverlay({ to: target, msg: `Jogador ${attacker}, não olhe! Os tabuleiros ficam escondidos até o Jogador ${target} confirmar.`, events: state.pvpEvents }, () => {
            state.pvpViewer = target;
            state.pvpEvents = [];
            state.lastShotCell = null;
            state.banner = { last: null, streak: 0 };
            renderGameScreen();
        });
    }, 800);
}

function updateTurnUI() {
    if (state.phase !== 'game') return;
    const viewer = getViewer();
    const myTurn = state.currentTurn === viewer;
    let cls = '', title = 'SEU TURNO', sub = 'Escolha um alvo no radar', dots = false;

    if (state.mode === 'pvp') title = `VEZ DO JOGADOR ${viewer}`;
    if (state.mode === 'online') sub = 'Escolha um alvo no mar do adversário';

    if (myTurn && state.banner.last === 'hit') {
        cls = 'hit';
        title = state.banner.streak > 1 ? `COMBO x${state.banner.streak}!` : 'ACERTOU!';
        sub = 'Atire de novo';
    } else if (myTurn && state.banner.last === 'sunk') {
        cls = 'sunk';
        title = 'AFUNDOU!';
        sub = 'Continue atirando';
    } else if (!myTurn) {
        if (state.mode === 'pve') {
            cls = 'bot'; title = 'VEZ DO BOT'; sub = 'Inimigo mirando'; dots = true;
        } else if (state.mode === 'online') {
            cls = 'foe'; title = 'VEZ DO ADVERSÁRIO'; sub = 'Proteja sua frota';
        } else {
            cls = 'foe'; title = `VEZ DO JOGADOR ${state.currentTurn}`; sub = 'Passe o aparelho';
        }
    }

    const banner = document.getElementById('turn-badge');
    const titleEl = document.getElementById('banner-title');
    const changed = titleEl.textContent !== title;
    banner.className = `turn-banner ${cls}`;
    titleEl.textContent = title;
    const subEl = document.getElementById('banner-sub');
    subEl.replaceChildren(sub);
    if (dots) subEl.appendChild(dotsEl());
    if (changed) restartAnimation(banner, 'pop');

    document.getElementById('enemy-board-wrap').classList.toggle('active', myTurn);
    document.getElementById('player-board').classList.toggle('active', !myTurn);
    const screen = document.getElementById('screen-game');
    screen.classList.toggle('my-turn', myTurn);
    screen.classList.toggle('foe-turn', !myTurn);
    document.getElementById('label-enemy').classList.toggle('title-yellow', myTurn);
    document.getElementById('label-player').classList.toggle('title-orange', !myTurn && state.mode === 'online');
}

function renderPips(containerId, alive, total, color, label) {
    const container = document.getElementById(containerId);
    container.replaceChildren(...Array.from({ length: total }, (_, i) => {
        const pip = el('i');
        pip.style.background = i < alive ? `var(--${color})` : 'var(--pip-dead)';
        return pip;
    }));
    container.setAttribute('aria-label', label);
}

function updateShipCounts() {
    const viewer = getViewer();
    const foe = otherPlayer(viewer);
    const total = SHIP_TYPES.length;
    const mine = state.ships[viewer].filter(s => !s.sunk).length;
    const theirs = state.mode === 'online'
        ? (state.online.shipsLeft ? state.online.shipsLeft[foe] : total)
        : state.ships[foe].filter(s => !s.sunk).length;
    renderPips('p1-pips', mine, total, playerColor(viewer), `${mine} de ${total} navios seus ativos`);
    renderPips('p2-pips', theirs, total, playerColor(foe), `${theirs} de ${total} navios inimigos ativos`);
}

function updateShotStats() {
    const s = state.stats[getViewer()];
    const acc = s.shots ? `${Math.round((s.hits / s.shots) * 100)}%` : '—';
    document.getElementById('shot-stats').textContent = `Tiros ${s.shots} · Precisão ${acc}`;
}

function addLog(who, text, tone = 'miss') {
    const log = document.getElementById('game-log');
    const entry = el('li', `log-${tone}`);
    entry.append(el('span', 'log-who', who), el('span', '', text));
    log.prepend(entry);
    while (log.children.length > 30) log.lastChild.remove();
}

let holdTimer = null;

function showPvpOverlay({ to, msg, events = [] }, callback) {
    const from = otherPlayer(to);
    const overlay = document.getElementById('pvp-overlay');
    const fromEl = document.getElementById('swap-from');
    const toEl = document.getElementById('swap-to');
    fromEl.className = `avatar avatar-lg avatar-${from === 1 ? 'cyan' : 'orange'} dim`;
    toEl.className = `avatar avatar-lg avatar-${to === 1 ? 'cyan' : 'orange'}`;
    fromEl.textContent = `P${from}`;
    toEl.textContent = `P${to}`;

    const target = el('span', 'swap-target', `JOGADOR ${to}`);
    target.style.color = to === 1 ? 'var(--cyan)' : 'var(--orange)';
    document.getElementById('overlay-title').replaceChildren('PASSE O APARELHO', el('br'), 'PARA O ', target);
    document.getElementById('overlay-msg').textContent = msg;

    const box = document.getElementById('swap-events-box');
    box.style.display = events.length ? '' : 'none';
    document.getElementById('swap-events').replaceChildren(...events.slice(-6).map(ev => {
        const li = el('li', ev.hit ? 'hit' : '');
        li.append(el('i'), ev.text);
        return li;
    }));

    const hold = document.getElementById('hold-btn');
    hold.classList.remove('holding');
    hold.setAttribute('aria-label', `Segure para revelar o tabuleiro do Jogador ${to}`);
    overlay._callback = callback;
    overlay.style.display = 'flex';
    hold.focus();
}

function hidePvpOverlay() {
    const overlay = document.getElementById('pvp-overlay');
    clearTimeout(holdTimer);
    overlay.style.display = 'none';
    const callback = overlay._callback;
    overlay._callback = null;
    if (callback) callback();
}

function initHoldButton() {
    const hold = document.getElementById('hold-btn');
    const cancel = () => {
        clearTimeout(holdTimer);
        hold.classList.remove('holding');
    };
    hold.addEventListener('pointerdown', () => {
        hold.classList.add('holding');
        clearTimeout(holdTimer);
        holdTimer = setTimeout(hidePvpOverlay, 800);
    });
    hold.addEventListener('pointerup', cancel);
    hold.addEventListener('pointerleave', cancel);
    hold.addEventListener('pointercancel', cancel);
    hold.addEventListener('click', (e) => { if (e.detail === 0) hidePvpOverlay(); });
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function statCard(label, value, note, extra) {
    const card = el('div', `stat ${extra || ''}`);
    card.append(el('span', 'stat-label', label));
    const v = el('span', 'stat-value', value);
    card.append(v);
    if (note instanceof Node) card.append(note);
    else if (note) card.append(el('span', 'stat-note', note));
    return { card, value: v };
}

function endGame(winnerNum) {
    state.phase = 'victory';
    state.thinking = false;
    const elapsed = Math.round((Date.now() - (state.stats.start || Date.now())) / 1000);

    let won, subject, subtitle, mapBoard, revealShips;
    if (state.mode === 'online') {
        const me = state.online.playerNumber;
        won = winnerNum === me;
        subject = me;
        mapBoard = state.boards[otherPlayer(me)];
        revealShips = false;
        subtitle = won ? 'Você afundou a frota do adversário.' : 'O adversário afundou toda a sua frota.';
    } else if (state.mode === 'pve') {
        won = winnerNum === 1;
        subject = 1;
        mapBoard = state.boards[2];
        revealShips = true;
        subtitle = won
            ? `Você afundou a frota do bot no nível ${DIFF[state.difficulty].label}.`
            : `O bot (${DIFF[state.difficulty].label}) afundou toda a sua frota.`;
    } else {
        won = true;
        subject = winnerNum;
        mapBoard = state.boards[otherPlayer(winnerNum)];
        revealShips = true;
        subtitle = `O Jogador ${winnerNum} afundou a frota do Jogador ${otherPlayer(winnerNum)}.`;
    }

    const kicker = document.getElementById('victory-kicker');
    const title = document.getElementById('victory-title');
    kicker.textContent = won ? 'MISSÃO CUMPRIDA' : 'MISSÃO FRACASSADA';
    kicker.style.color = won ? 'var(--green)' : 'var(--red)';
    title.textContent = won
        ? (state.mode === 'pvp' ? `JOGADOR ${winnerNum} VENCEU!` : 'VITÓRIA!')
        : 'DERROTA!';
    title.classList.toggle('lose', !won);
    document.getElementById('victory-subtitle').textContent = subtitle;

    const s = state.stats[subject];
    const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
    const bar = el('span', 'stat-bar');
    const fill = el('i');
    fill.style.width = `${acc}%`;
    bar.appendChild(fill);
    const precision = statCard('PRECISÃO', `${acc}%`, bar);
    precision.value.style.color = 'var(--cyan)';
    document.getElementById('victory-stats').replaceChildren(
        precision.card,
        statCard('TIROS', String(s.shots), `${s.hits} acertos · ${s.shots - s.hits} na água`).card,
        statCard('TEMPO', formatTime(elapsed)).card,
        statCard('MAIOR COMBO', `x${s.bestStreak}`, 'acertos seguidos', 'stat-gold').card,
    );

    const map = document.getElementById('shot-map');
    map.replaceChildren(...mapBoard.flat().map(val => {
        if (val === CELL.HIT || val === CELL.SUNK) return el('span', 'hit');
        if (val === CELL.MISS) return el('span', 'miss');
        if (val === CELL.SHIP && revealShips) return el('span', 'ship');
        return el('span');
    }));

    const confetti = document.getElementById('confetti');
    const colors = ['#ffe600', '#00e5ff', '#ff6b6b', '#00ff88', '#ff9d3c'];
    confetti.replaceChildren(...(won ? Array.from({ length: 24 }, (_, k) => {
        const piece = el('span');
        piece.style.left = `${(k * 41) % 100}%`;
        piece.style.background = colors[k % 5];
        piece.style.animationDuration = `${4 + (k % 5)}s`;
        piece.style.animationDelay = `-${((k * 0.7) % 5).toFixed(1)}s`;
        return piece;
    }) : []));

    document.getElementById('btn-rematch').style.display = state.mode === 'online' ? 'none' : '';

    const gameId = state.gameId;
    setTimeout(() => {
        if (state.gameId === gameId && state.phase === 'victory') showScreen('victory');
    }, 900);
}

function onExitClick() {
    const risky = state.phase === 'game' || (state.phase === 'placement' && state.mode === 'online');
    if (risky) showExitOverlay();
    else backToMenu();
}

function showExitOverlay() {
    document.getElementById('exit-overlay').style.display = 'flex';
}

function hideExitOverlay() {
    const overlay = document.getElementById('exit-overlay');
    if (overlay) overlay.style.display = 'none';
}

function confirmExit() {
    hideExitOverlay();
    backToMenu();
}

const RADIO_SCREENS = ['placement', 'game', 'victory'];
let radioOpen = true;
let radioMuted = false;

function isRadioAvailable() {
    return state.mode === 'online'
        && Boolean(state.online.lobbyCode)
        && RADIO_SCREENS.includes(state.phase);
}

function updateRadioVisibility() {
    const radio = document.getElementById('radio');
    if (!radio) return;
    const available = isRadioAvailable();
    radio.style.display = available ? '' : 'none';
    document.body.classList.toggle('has-radio', available);
    document.getElementById('radio-channel').textContent = state.online.lobbyCode ? `sala ${state.online.lobbyCode}` : '';
}

function toggleRadioOpen() {
    radioOpen = !radioOpen;
    const radio = document.getElementById('radio');
    radio.classList.toggle('closed', !radioOpen);
    const toggle = document.getElementById('radio-toggle');
    toggle.setAttribute('aria-expanded', String(radioOpen));
    toggle.setAttribute('aria-label', radioOpen ? 'Minimizar rádio' : 'Abrir rádio');
    document.getElementById('radio-last').style.display = radioOpen ? 'none' : 'flex';
    if (radioOpen) scrollRadio();
}

function toggleRadioMute() {
    radioMuted = !radioMuted;
    const button = document.getElementById('radio-mute');
    button.textContent = radioMuted ? 'Silenciado' : 'Silenciar';
    button.setAttribute('aria-pressed', String(radioMuted));
    document.querySelectorAll('.radio-compose button, .radio-compose input').forEach(node => { node.disabled = radioMuted; });
    document.getElementById('chat-input').placeholder = radioMuted ? 'Rádio silenciado' : 'Transmitir mensagem…';
}

function emitChat(text) {
    const clean = (text || '').trim();
    if (!clean || radioMuted || !state.online.socket || !state.online.lobbyCode) return false;
    state.online.socket.emit('chat-message', { text: clean });
    return true;
}

function sendChatMessage(event) {
    event.preventDefault();
    const input = document.getElementById('chat-input');
    if (emitChat(input.value)) input.value = '';
}

function sendQuick(label) {
    emitChat(label);
}

function nowTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function scrollRadio() {
    const messages = document.getElementById('chat-messages');
    messages.scrollTop = messages.scrollHeight;
}

function pushRadioLine(kind, who, text, tone) {
    const messages = document.getElementById('chat-messages');
    const line = el('li', `msg-${kind}${tone ? ` tone-${tone}` : ''}`);
    line.append(el('span', 'msg-time', nowTime()), el('span', 'msg-who', who), el('span', 'msg-text', text));
    messages.append(line);
    while (messages.children.length > 80) messages.firstChild.remove();
    scrollRadio();

    const last = document.getElementById('radio-last');
    const lastLine = el('span', `msg-${kind}${tone ? ` tone-${tone}` : ''}`);
    lastLine.style.display = 'flex';
    lastLine.style.gap = '10px';
    lastLine.style.minWidth = '0';
    lastLine.append(el('span', 'msg-who', who), el('span', 'msg-text', text));
    last.replaceChildren(lastLine);
}

function radioSystem(text, tone) {
    pushRadioLine('sys', '»', text, tone);
}

function showSay(id, text) {
    if (state.phase !== 'game') return;
    const bubble = document.getElementById(id);
    bubble.textContent = text;
    restartAnimation(bubble, 'show');
}

function appendChatMessage(playerNumber, text) {
    const mine = playerNumber === state.online.playerNumber;
    if (radioMuted && !mine) return;
    pushRadioLine(mine ? 'me' : 'foe', mine ? 'VOCÊ' : 'ADVERSÁRIO', text);
    showSay(mine ? 'say-me' : 'say-foe', text);
}

function clearChat() {
    document.getElementById('chat-messages').replaceChildren();
    document.getElementById('radio-last').replaceChildren();
}

function setupOnlineListeners(socket) {
    socket.on('lobby-created', ({ code, playerNumber }) => {
        state.online.playerNumber = playerNumber;
        state.online.isHost = true;
        showLobbyWaiting(code);
    });

    socket.on('lobby-joined', ({ code, playerNumber }) => {
        state.online.playerNumber = playerNumber;
        state.online.isHost = false;
        showLobbyWaiting(code);
    });

    socket.on('lobby-error', ({ message }) => {
        showLobbyError(message);
    });

    socket.on('lobby-state', ({ connected }) => {
        if (connected !== 2) return;
        renderLobbyRoom(true);
        const code = state.online.lobbyCode;
        setTimeout(() => {
            if (state.phase !== 'lobby' || state.online.lobbyCode !== code) return;
            const playerNumber = state.online.playerNumber;
            state.currentPlacer = playerNumber;
            state.online.readySent = false;
            showScreen('placement');
            buildBoardLabels('placement-col-labels', 'placement-row-labels');
            renderPlacementScreen(playerNumber);
            radioSystem('Tripulação completa. Posicionem suas frotas.');
        }, 1200);
    });

    socket.on('player-ready', ({ playerNumber }) => {
        if (playerNumber === state.online.playerNumber) return;
        radioSystem('O adversário está com a frota pronta.');
        if (!state.online.readySent) {
            document.getElementById('placement-subtitle').textContent = 'Adversário pronto. Aguardando você...';
        }
    });

    socket.on('game-start', ({ turn }) => {
        state.phase = 'game';
        state.gameId = Date.now();
        state.currentTurn = turn;
        state.stats.start = Date.now();
        state.banner = { last: null, streak: 0 };
        state.online.readySent = false;
        document.getElementById('game-log').replaceChildren();
        showScreen('game');
        buildBoardLabels('game-col-labels-1', 'game-row-labels-1');
        buildBoardLabels('game-col-labels-2', 'game-row-labels-2');
        renderGameScreen();
        radioSystem(turn === state.online.playerNumber ? 'Partida iniciada. Você começa.' : 'Partida iniciada. O adversário começa.');
    });

    socket.on('attack-result', ({ attacker, target, row, col, result, sunkShip, turn, shipsLeft }) => {
        const board = state.boards[target];
        const ships = state.ships[target];
        board[row][col] = result === 'hit' ? CELL.HIT : CELL.MISS;
        let hitShip = null;
        if (result === 'hit') {
            for (const ship of ships) {
                if (ship.positions && ship.positions.some(([r, c]) => r === row && c === col)) {
                    ship.hits = (ship.hits || 0) + 1;
                    hitShip = ship;
                }
            }
        }
        if (sunkShip) {
            for (const [r, c] of sunkShip.positions) board[r][c] = CELL.SUNK;
            const sunk = ships.find(ship => ship.positions &&
                ship.positions.some(([r, c]) => r === sunkShip.positions[0][0] && c === sunkShip.positions[0][1]));
            if (sunk) sunk.sunk = true;
        }

        const me = state.online.playerNumber;
        const name = cellName(row, col);
        const outcome = sunkShip ? 'sunk' : result;
        if (attacker === me) {
            recordShot(me, outcome);
            state.lastShotCell = [row, col];
            if (sunkShip) {
                addLog('VOCÊ', `AFUNDOU o ${sunkShip.name || 'NAVIO'}!`, 'sunk');
                radioSystem(`Você afundou o ${sunkShip.name || 'NAVIO'}!`, 'sunk');
            } else if (result === 'hit') {
                addLog('VOCÊ', `Acertou ${name}`, 'hit');
                radioSystem(`Você acertou ${name}`, 'hit');
            } else {
                addLog('VOCÊ', `Água em ${name}`, 'miss');
            }
        } else {
            state.lastOwnCell = [row, col];
            if (sunkShip) {
                addLog('RIVAL', `Afundou seu ${sunkShip.name || 'NAVIO'}!`, 'bad');
                radioSystem(`O adversário afundou seu ${sunkShip.name || 'NAVIO'}`, 'bad');
            } else if (result === 'hit') {
                addLog('RIVAL', `Acertou ${name}`, 'bad');
                radioSystem(`O adversário acertou seu ${hitShip ? hitShip.name : 'navio'} em ${name}`, 'bad');
            } else {
                addLog('RIVAL', `Errou em ${name}`, 'miss');
            }
        }
        if (shipsLeft) state.online.shipsLeft = shipsLeft;
        if (turn) state.currentTurn = turn;
        updateTurnUI();
        renderGameBoards();
        updateShipCounts();
        updateShotStats();
        if (attacker === me && result !== 'miss') restartAnimation(document.getElementById('enemy-board-wrap'), 'shake');
    });

    socket.on('turn-changed', ({ turn }) => {
        if (!turn || turn === state.currentTurn) return;
        state.currentTurn = turn;
        updateTurnUI();
        renderGameBoards();
    });

    socket.on('game-over', ({ winner }) => {
        endGame(winner);
    });

    socket.on('chat-message', ({ playerNumber, text }) => {
        appendChatMessage(playerNumber, text);
    });

    socket.on('opponent-disconnected', () => {
        clearChat();
        state.online.lobbyCode = null;
        state.online.playerNumber = null;
        state.online.shipsLeft = null;
        state.online.isHost = false;
        updateRadioVisibility();
        if (state.mode === 'online' && state.phase !== 'victory') {
            resetState();
            state.mode = 'online';
            showScreen('lobby');
            showLobbyMenu();
            showLobbyError('O adversário saiu da sala.');
        }
    });
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        toggleRules(false);
        hideExitOverlay();
        return;
    }
    if (e.target instanceof HTMLInputElement) return;
    if ((e.key === 'r' || e.key === 'R') && state.phase === 'placement') rotateShip();
});

document.getElementById('lobby-code').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (document.getElementById('lobby-error').textContent) showLobbyError('');
});

window.addEventListener('beforeunload', (e) => {
    if (state.phase === 'game') {
        e.preventDefault();
        e.returnValue = '';
        return '';
    }
});

resetState();
initMenu();
initHoldButton();
