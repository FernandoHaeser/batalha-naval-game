'use strict';

function buildProbabilityMap() {
    const prob = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
    const remainingSizes = state.ships[1].filter(s => !s.sunk).map(s => s.size);
    const open = ([r, c]) => state.boards[1][r][c] === CELL.EMPTY || state.boards[1][r][c] === CELL.SHIP;

    for (const size of remainingSizes) {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                for (const dir of ['h', 'v']) {
                    const positions = getPositions(r, c, size, dir);
                    if (positions && positions.every(open)) {
                        for (const [pr, pc] of positions) prob[pr][pc]++;
                    }
                }
            }
        }
    }
    return prob;
}

function unattackedCells(filter = () => true) {
    const cells = [];
    for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++)
            if (!state.ai.attacked.has(`${r},${c}`) && filter(r, c)) cells.push([r, c]);
    return cells;
}

function pickRandom(cells) {
    return cells[Math.floor(Math.random() * cells.length)];
}

function aiBestMove() {
    const ai = state.ai;
    const diff = DIFF[state.difficulty];

    while (ai.targetQueue.length > 0) {
        const [r, c] = ai.targetQueue.shift();
        if (isValid(r, c) && !ai.attacked.has(`${r},${c}`)) return [r, c];
    }

    if (Math.random() > diff.accuracy) {
        const all = unattackedCells();
        if (all.length) return pickRandom(all);
    }

    if (diff.probability) {
        const prob = buildProbabilityMap();
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                if (state.boards[1][r][c] === CELL.HIT) prob[r][c] += 100;

        let best = -1, bestCells = [];
        for (const [r, c] of unattackedCells()) {
            if (prob[r][c] > best) { best = prob[r][c]; bestCells = [[r, c]]; }
            else if (prob[r][c] === best) bestCells.push([r, c]);
        }
        if (bestCells.length) return pickRandom(bestCells);
    }

    if (diff.huntCheckerboard) {
        const candidates = unattackedCells((r, c) => (r + c) % 2 === 0);
        if (candidates.length) return pickRandom(candidates);
    }

    return pickRandom(unattackedCells());
}

function aiAddTargets(row, col) {
    const ai = state.ai;
    const diff = DIFF[state.difficulty];
    const free = (r, c) => isValid(r, c) && !ai.attacked.has(`${r},${c}`);

    if (diff.targetSmartDir && ai.firstHit && ai.hitDir) {
        const [dr, dc] = ai.hitDir;
        const next = [row + dr, col + dc];
        const back = [ai.firstHit[0] - dr, ai.firstHit[1] - dc];
        if (free(...next)) ai.targetQueue.unshift(next);
        if (free(...back)) ai.targetQueue.push(back);
        return;
    }

    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (free(row + dr, col + dc)) ai.targetQueue.push([row + dr, col + dc]);
    }
    if (diff.targetSmartDir && ai.firstHit) {
        const dr = Math.sign(row - ai.firstHit[0]);
        const dc = Math.sign(col - ai.firstHit[1]);
        if (dr !== 0 || dc !== 0) {
            ai.hitDir = [dr, dc];
            const next = [row + dr, col + dc];
            const back = [ai.firstHit[0] - dr, ai.firstHit[1] - dc];
            ai.targetQueue = [];
            if (free(...next)) ai.targetQueue.push(next);
            if (free(...back)) ai.targetQueue.push(back);
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

defineMode('pve', {
    launch() {
        startGame('pve', state.difficulty);
    },

    ready() {
        const { board, ships } = randomPlacementForPlayer();
        state.boards[2] = board;
        state.ships[2] = ships;
        startGamePhase();
    },

    labels() {
        const level = DIFF[state.difficulty].label;
        return {
            me: 'VOCÊ',
            foe: `BOT · ${level}`,
            foeAvatar: 'IA',
            mode: `VS BOT · ${level}`,
            enemyBoard: '> RADAR INIMIGO',
            ownBoard: 'SEU MAR',
        };
    },

    shooterName: () => 'VOCÊ',

    passTurn() {
        setThinking(true);
        renderGameBoards();
        scheduleBotTurn(1100);
    },

    waitBanner: () => ({ cls: 'bot', title: 'VEZ DO BOT', sub: 'Inimigo mirando', dots: true }),

    result(winner) {
        const level = DIFF[state.difficulty].label;
        const won = winner === 1;
        return {
            won,
            subject: 1,
            mapBoard: state.boards[2],
            revealShips: true,
            subtitle: won
                ? `Você afundou a frota do bot no nível ${level}.`
                : `O bot (${level}) afundou toda a sua frota.`,
        };
    },
});
