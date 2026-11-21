'use strict';

function startGamePhase() {
    state.phase = 'game';
    state.gameId = Date.now();
    state.currentTurn = 1;
    state.stats.start = Date.now();
    state.banner = { last: null, streak: 0 };
    state.pvpViewer = 1;
    state.pvpEvents = [];
    enterBattleScreen();
}

function enterBattleScreen() {
    byId('game-log').replaceChildren();
    showScreen('game');
    buildBoardLabels('game-col-labels-1', 'game-row-labels-1');
    buildBoardLabels('game-col-labels-2', 'game-row-labels-2');
    renderGameScreen();
}

function renderGameScreen() {
    const mode = currentMode();
    const viewer = getViewer();
    const foe = otherPlayer(viewer);
    byId('screen-game').classList.toggle('mode-online', state.mode === 'online');

    const meAvatar = byId('me-avatar');
    const foeAvatar = byId('foe-avatar');
    meAvatar.className = `avatar avatar-${playerColor(viewer)}`;
    foeAvatar.className = `avatar avatar-${playerColor(foe)}`;

    const labels = mode.labels(viewer, foe);
    meAvatar.textContent = `P${viewer}`;
    foeAvatar.textContent = labels.foeAvatar || `P${foe}`;
    byId('p1-name').textContent = labels.me;
    byId('p2-name').textContent = labels.foe;
    byId('game-mode-label').textContent = labels.mode;
    byId('label-enemy').textContent = labels.enemyBoard;
    byId('label-player').textContent = labels.ownBoard;

    updateShipCounts();
    updateTurnUI();
    renderGameBoards();
    updateShotStats();
}

function renderGameBoards() {
    const viewer = getViewer();
    const foe = otherPlayer(viewer);
    renderOwnBoard(state.boards[viewer]);
    renderEnemyBoard(state.boards[foe]);
    renderEnemyFleet(state.ships[foe]);
}

function renderOwnBoard(board) {
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
    byId('player-board').replaceChildren(...cells);
    const damage = board.flat().filter(v => v === CELL.HIT || v === CELL.SUNK).length;
    byId('own-damage').textContent = `${damage} danos`;
}

function hitMark() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 10 10');
    svg.setAttribute('class', 'mark-x');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M1 1h2v2H1zM7 1h2v2H7zM3 3h4v4H3zM1 7h2v2H1zM7 7h2v2H7z');
    path.setAttribute('fill', '#fff4c2');
    svg.appendChild(path);
    return svg;
}

function renderEnemyBoard(board) {
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
    byId('enemy-board').replaceChildren(...cells);
}

function renderEnemyFleet(ships) {
    const ordered = SHIP_TYPES.map(type => ships.find(s => s.id === type.id)).filter(Boolean);
    byId('enemy-fleet').replaceChildren(...ordered.map(ship => {
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
    if (currentMode().inputBlocked()) return false;
    const val = state.boards[otherPlayer(viewer)][r][c];
    return val === CELL.EMPTY || val === CELL.SHIP;
}

function handleAttack(row, col) {
    if (!canAttack(row, col)) return;
    const mode = currentMode();
    if (mode.attack) mode.attack(row, col);
    else resolveLocalShot(row, col);
}

function resolveLocalShot(row, col) {
    const mode = currentMode();
    const attacker = getViewer();
    const target = otherPlayer(attacker);
    const result = attack(state.boards[target], state.ships[target], row, col);
    if (!result) return;

    recordShot(attacker, result);
    state.lastShotCell = [row, col];
    const name = cellName(row, col);
    const who = mode.shooterName(attacker);
    const ships = state.ships[target];
    const shipAt = () => ships.find(s => s.positions.some(([r, c]) => r === row && c === col));
    const sunkShip = result === 'sunk' ? shipAt() : null;
    const hitShip = result === 'hit' ? shipAt() : null;

    if (sunkShip) addLog(who, `AFUNDOU o ${sunkShip.name}!`, 'sunk');
    else if (result === 'hit') addLog(who, state.banner.streak > 1 ? `Acertou ${name} — combo x${state.banner.streak}!` : `Acertou ${name}`, 'hit');
    else addLog(who, `Água em ${name}`, 'miss');

    if (mode.onShot) mode.onShot({ attacker, name, result, sunkShip, hitShip });

    renderGameBoards();
    updateShipCounts();
    updateShotStats();
    if (result !== 'miss') restartAnimation(byId('enemy-board-wrap'), 'shake');

    if (allShipsSunk(ships)) { endGame(attacker); return; }
    if (result !== 'miss') { updateTurnUI(); return; }

    state.currentTurn = target;
    mode.passTurn(attacker, target);
}

function updateTurnUI() {
    if (state.phase !== 'game') return;
    const mode = currentMode();
    const viewer = getViewer();
    const myTurn = state.currentTurn === viewer;
    let banner = { cls: '', ...mode.turnBanner(viewer) };

    if (myTurn && state.banner.last === 'hit') {
        banner = { cls: 'hit', title: state.banner.streak > 1 ? `COMBO x${state.banner.streak}!` : 'ACERTOU!', sub: 'Atire de novo' };
    } else if (myTurn && state.banner.last === 'sunk') {
        banner = { cls: 'sunk', title: 'AFUNDOU!', sub: 'Continue atirando' };
    } else if (!myTurn) {
        banner = mode.waitBanner();
    }

    const box = byId('turn-badge');
    const titleEl = byId('banner-title');
    const changed = titleEl.textContent !== banner.title;
    box.className = `turn-banner ${banner.cls || ''}`;
    titleEl.textContent = banner.title;
    const subEl = byId('banner-sub');
    subEl.replaceChildren(banner.sub);
    if (banner.dots) subEl.appendChild(dotsEl());
    if (changed) restartAnimation(box, 'pop');

    byId('enemy-board-wrap').classList.toggle('active', myTurn);
    byId('player-board').classList.toggle('active', !myTurn);
    const screen = byId('screen-game');
    screen.classList.toggle('my-turn', myTurn);
    screen.classList.toggle('foe-turn', !myTurn);
    byId('label-enemy').classList.toggle('title-yellow', myTurn);
    byId('label-player').classList.toggle('title-orange', !myTurn && state.mode === 'online');
}

function setThinking(active) {
    state.thinking = active;
    if (state.phase === 'game') updateTurnUI();
}

function renderPips(containerId, alive, total, color, label) {
    const container = byId(containerId);
    container.replaceChildren(...Array.from({ length: total }, (_, i) => el('i', i < alive ? `pip-${color}` : 'pip-dead')));
    container.setAttribute('aria-label', label);
}

function updateShipCounts() {
    const viewer = getViewer();
    const foe = otherPlayer(viewer);
    const total = SHIP_TYPES.length;
    const mine = state.ships[viewer].filter(s => !s.sunk).length;
    const theirs = currentMode().foeShipsLeft(foe);
    renderPips('p1-pips', mine, total, playerColor(viewer), `${mine} de ${total} navios seus ativos`);
    renderPips('p2-pips', theirs, total, playerColor(foe), `${theirs} de ${total} navios inimigos ativos`);
}

function updateShotStats() {
    const s = state.stats[getViewer()];
    const acc = s.shots ? `${Math.round((s.hits / s.shots) * 100)}%` : '—';
    byId('shot-stats').textContent = `Tiros ${s.shots} · Precisão ${acc}`;
}

function addLog(who, text, tone = 'miss') {
    const log = byId('game-log');
    const entry = el('li', `log-${tone}`);
    entry.append(el('span', 'log-who', who), el('span', '', text));
    log.prepend(entry);
    while (log.children.length > 30) log.lastChild.remove();
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function statCard(label, value, note, extra) {
    const card = el('div', `stat ${extra || ''}`);
    const valueEl = el('span', 'stat-value', value);
    card.append(el('span', 'stat-label', label), valueEl);
    if (note instanceof Node) card.append(note);
    else if (note) card.append(el('span', 'stat-note', note));
    return { card, value: valueEl };
}

function endGame(winnerNum) {
    state.phase = 'victory';
    state.thinking = false;
    const elapsed = Math.round((Date.now() - (state.stats.start || Date.now())) / 1000);
    const outcome = currentMode().result(winnerNum);
    const { won } = outcome;

    byId('screen-victory').classList.toggle('is-lose', !won);
    const kicker = byId('victory-kicker');
    kicker.textContent = won ? 'MISSÃO CUMPRIDA' : 'MISSÃO FRACASSADA';
    kicker.className = `kicker ${won ? 'kicker-green' : 'kicker-red'}`;
    const title = byId('victory-title');
    title.textContent = won ? (outcome.title || 'VITÓRIA!') : 'DERROTA!';
    title.classList.toggle('lose', !won);
    byId('victory-subtitle').textContent = outcome.subtitle;

    const s = state.stats[outcome.subject];
    const acc = accuracy(s);
    const bar = el('span', 'stat-bar');
    const fill = el('i');
    fill.style.width = `${acc}%`;
    bar.appendChild(fill);
    const precision = statCard('PRECISÃO', `${acc}%`, bar);
    precision.value.classList.add('value-cyan');
    const cards = [
        precision.card,
        statCard('TIROS', String(s.shots), `${s.hits} acertos · ${s.shots - s.hits} na água`).card,
        statCard('TEMPO', formatTime(elapsed)).card,
        statCard('MAIOR COMBO', `x${s.bestStreak}`, 'acertos seguidos', 'stat-gold').card,
    ];
    cards.forEach((card, k) => card.style.setProperty('--i', String(k)));
    byId('victory-stats').replaceChildren(...cards);

    renderDuel(outcome.duel);
    byId('shot-map-title').textContent = outcome.mapTitle || 'MAPA DOS TIROS';
    renderShotMap('shot-map', outcome.mapBoard, outcome.revealShips);
    byId('own-map-box').hidden = !outcome.ownBoard;
    if (outcome.ownBoard) {
        byId('own-map-title').textContent = outcome.ownTitle || 'SEU MAR';
        renderShotMap('own-map', outcome.ownBoard, true);
    }

    renderConfetti(won);
    byId('btn-rematch').hidden = !currentMode().rematch;

    const gameId = state.gameId;
    const reveal = () => {
        if (state.gameId === gameId && state.phase === 'victory') showScreen('victory');
    };
    if (currentMode().finale) {
        setTimeout(() => {
            if (state.gameId === gameId && state.phase === 'victory') playFinale(won, state.lastSunk, reveal);
        }, FINALE_LEAD_MS);
    } else {
        setTimeout(reveal, 900);
    }
}

const FINALE_LEAD_MS = 600;
const FINALE_MS = 4400;
let finaleFinish = null;

function playFinale(won, ship, done) {
    const overlay = byId('finale');
    overlay.classList.toggle('finale-win', won);
    overlay.classList.toggle('finale-lose', !won);
    const size = ship && ship.size ? ship.size : 3;
    overlay.style.setProperty('--ship-scale', String(0.7 + size * 0.08));
    byId('finale-kicker').textContent = won ? 'ÚLTIMO NAVIO INIMIGO ATINGIDO' : 'SEU ÚLTIMO NAVIO FOI ATINGIDO';
    byId('finale-ship-name').textContent = ship && ship.name ? ship.name : 'NAVIO';
    byId('finale-caption').textContent = won ? 'FROTA INIMIGA DESTRUÍDA' : 'SUA FROTA FOI AFUNDADA';
    overlay.hidden = false;
    restartAnimation(overlay, 'play');

    let timer = null;
    const finish = () => {
        if (finaleFinish !== finish) return;
        finaleFinish = null;
        clearTimeout(timer);
        overlay.onclick = null;
        overlay.hidden = true;
        overlay.classList.remove('play');
        done();
    };
    finaleFinish = finish;
    timer = setTimeout(finish, FINALE_MS);
    overlay.onclick = finish;
}

function skipFinale() {
    if (finaleFinish) finaleFinish();
}

function renderShotMap(id, board, revealShips) {
    byId(id).replaceChildren(...board.flat().map(val => {
        if (val === CELL.HIT || val === CELL.SUNK) return el('span', 'hit');
        if (val === CELL.MISS) return el('span', 'miss');
        if (val === CELL.SHIP && revealShips) return el('span', 'ship');
        return el('span');
    }));
}

function renderDuel(duel) {
    const box = byId('victory-duel');
    box.hidden = !duel;
    if (!duel) return;
    const sides = { a: duel.a, b: duel.b };
    for (const [key, n] of Object.entries(sides)) {
        const avatar = byId(`duel-${key}-avatar`);
        avatar.className = `avatar avatar-${playerColor(n)}`;
        avatar.textContent = `P${n}`;
        byId(`duel-${key}-name`).textContent = key === 'a' ? duel.aName : duel.bName;
        const tag = byId(`duel-${key}-tag`);
        tag.textContent = n === duel.winner ? 'VENCEU' : 'AFUNDADO';
        tag.className = `duel-tag ${n === duel.winner ? 'duel-tag-win' : 'duel-tag-lose'}`;
    }

    const sa = state.stats[duel.a];
    const sb = state.stats[duel.b];
    const rows = [
        { label: 'NAVIOS RESTANTES', a: duel.shipsLeft[duel.a], b: duel.shipsLeft[duel.b] },
        { label: 'ACERTOS', a: sa.hits, b: sb.hits },
        { label: 'PRECISÃO', a: accuracy(sa), b: accuracy(sb), suffix: '%' },
        { label: 'MAIOR COMBO', a: sa.bestStreak, b: sb.bestStreak, prefix: 'x' },
        { label: 'TIROS', a: sa.shots, b: sb.shots, neutral: true },
    ];
    byId('duel-rows').replaceChildren(...rows.map((row, k) => {
        const line = el('div', 'duel-row');
        line.style.setProperty('--i', String(k));
        const format = v => `${row.prefix || ''}${v}${row.suffix || ''}`;
        const valA = el('span', 'duel-val duel-val-a', format(row.a));
        const valB = el('span', 'duel-val duel-val-b', format(row.b));
        if (!row.neutral && row.a !== row.b) (row.a > row.b ? valA : valB).classList.add('best');
        const middle = el('span', 'duel-mid');
        const meter = el('span', 'duel-meter');
        const total = row.a + row.b;
        const fillA = el('i', `fill-${playerColor(duel.a)}`);
        const fillB = el('i', `fill-${playerColor(duel.b)}`);
        fillA.style.flexGrow = String(total ? row.a : 1);
        fillB.style.flexGrow = String(total ? row.b : 1);
        meter.append(fillA, fillB);
        middle.append(el('span', 'duel-label', row.label), meter);
        line.append(valA, middle, valB);
        return line;
    }));
}

function renderConfetti(won) {
    const box = byId('confetti');
    box.classList.toggle('bubbles', !won);
    if (!won) {
        box.replaceChildren(...Array.from({ length: 18 }, (_, k) => {
            const bubble = el('span');
            const size = 6 + (k % 4) * 3;
            bubble.style.left = `${(k * 37 + 7) % 100}%`;
            bubble.style.width = `${size}px`;
            bubble.style.height = `${size}px`;
            bubble.style.animationDuration = `${6 + (k % 5)}s`;
            bubble.style.animationDelay = `-${((k * 0.9) % 6).toFixed(1)}s`;
            return bubble;
        }));
        return;
    }
    const colors = ['#ffe600', '#00e5ff', '#ff6b6b', '#00ff88', '#ff9d3c'];
    box.replaceChildren(...Array.from({ length: 32 }, (_, k) => {
        const piece = el('span');
        piece.style.left = `${(k * 41) % 100}%`;
        piece.style.background = colors[k % 5];
        piece.style.animationDuration = `${4 + (k % 5)}s`;
        piece.style.animationDelay = `-${((k * 0.7) % 5).toFixed(1)}s`;
        return piece;
    }));
}
