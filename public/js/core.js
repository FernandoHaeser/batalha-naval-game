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
    easy: { label: 'FÁCIL', huntCheckerboard: false, targetSmartDir: false, accuracy: 0.5 },
    medium: { label: 'MÉDIO', huntCheckerboard: true, targetSmartDir: false, accuracy: 0.75 },
    hard: { label: 'DIFÍCIL', huntCheckerboard: true, targetSmartDir: true, accuracy: 0.95 },
    impossible: { label: 'IMPOSSÍVEL', huntCheckerboard: true, targetSmartDir: true, accuracy: 1.0, probability: true },
};

const MODES = {};

const BASE_MODE = {
    viewer: () => 1,
    color: n => (n === 1 ? 'cyan' : 'red'),
    placementLocked: () => false,
    inputBlocked: () => false,
    foeShipsLeft: foe => state.ships[foe].filter(s => !s.sunk).length,
    turnBanner: () => ({ title: 'SEU TURNO', sub: 'Escolha um alvo no radar' }),
    rematch: true,
    confirmPlacementExit: false,
    finale: false,
};

function defineMode(name, impl) {
    MODES[name] = { ...BASE_MODE, ...impl };
}

function currentMode() {
    return MODES[state.mode];
}

let state = {
    mode: 'pve',
    difficulty: 'medium',
    online: { socket: null },
};

function resetState() {
    const { mode, difficulty } = state;
    state = {
        mode: mode === 'online' ? 'pve' : mode,
        difficulty,
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
        lastSunk: null,
        pvpViewer: 1,
        pvpEvents: [],
        ai: { mode: 'hunt', targetQueue: [], hitDir: null, firstHit: null, attacked: new Set() },
        online: { socket: state.online.socket, playerNumber: null, lobbyCode: null, shipsLeft: null, readySent: false, isHost: false, ready: { 1: false, 2: false } },
    };
}

function createEmptyBoard() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(CELL.EMPTY));
}

function isValid(r, c) {
    return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function getPositions(row, col, size, dir) {
    const positions = [];
    for (let i = 0; i < size; i++) {
        const r = dir === 'h' ? row : row + i;
        const c = dir === 'h' ? col + i : col;
        if (!isValid(r, c)) return null;
        positions.push([r, c]);
    }
    return positions;
}

function canPlace(board, row, col, size, dir) {
    const positions = getPositions(row, col, size, dir);
    if (!positions) return false;
    for (const [r, c] of positions) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = r + dr, nc = c + dc;
                if (isValid(nr, nc) && board[nr][nc] === CELL.SHIP) return false;
            }
        }
    }
    return true;
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

function allShipsSunk(ships) {
    return ships.every(s => s.sunk);
}

function randomPlacementForPlayer() {
    const board = createEmptyBoard();
    const ships = [];
    for (const shipType of SHIP_TYPES) {
        for (let attempts = 0; attempts < 2000; attempts++) {
            const row = Math.floor(Math.random() * BOARD_SIZE);
            const col = Math.floor(Math.random() * BOARD_SIZE);
            const dir = Math.random() < 0.5 ? 'h' : 'v';
            if (canPlace(board, row, col, shipType.size, dir)) {
                ships.push(placeShip(board, row, col, shipType.size, dir, { id: shipType.id, name: shipType.name, size: shipType.size }));
                break;
            }
        }
    }
    return { board, ships };
}

function cellName(r, c) {
    return `${COLS[r]}${c + 1}`;
}

function newStats() {
    return { shots: 0, hits: 0, streak: 0, bestStreak: 0 };
}

function otherPlayer(n) {
    return n === 1 ? 2 : 1;
}

function getViewer() {
    return currentMode().viewer();
}

function playerColor(n) {
    return currentMode().color(n);
}

function recordShot(player, result) {
    const s = state.stats[player];
    s.shots++;
    if (result === 'miss') {
        s.streak = 0;
        state.banner = { last: null, streak: 0 };
        return;
    }
    s.hits++;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    state.banner = { last: result, streak: state.banner.streak + 1 };
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function byId(id) {
    return document.getElementById(id);
}

function restartAnimation(node, className) {
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
}

function dotsEl() {
    const dots = el('span', 'dots');
    for (let i = 0; i < 3; i++) dots.appendChild(el('span', '', '.'));
    return dots;
}
