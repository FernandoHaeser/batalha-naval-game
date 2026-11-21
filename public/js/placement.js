'use strict';

const PLACEMENT_HINT = 'Escolha um navio, passe o mouse no mar e clique para ancorar. Navios não podem se encostar.';

function startGame(mode, diff) {
    state.mode = mode;
    if (diff) state.difficulty = diff;
    state.currentPlacer = 1;
    showScreen('placement');
    buildBoardLabels('placement-col-labels', 'placement-row-labels');
    renderPlacementScreen(1);
}

function buildBoardLabels(colId, rowId) {
    byId(colId).replaceChildren(...Array.from({ length: BOARD_SIZE }, (_, c) => el('span', '', String(c + 1))));
    byId(rowId).replaceChildren(...Array.from({ length: BOARD_SIZE }, (_, r) => el('span', '', COLS[r])));
}

function placementLocked() {
    return currentMode().placementLocked();
}

function ensureSelection(playerNum) {
    const remaining = state.remaining[playerNum];
    const current = state.selectedShipIdx !== null ? SHIP_TYPES[state.selectedShipIdx] : null;
    if (current && remaining.some(r => r.id === current.id)) return;
    state.selectedShipIdx = remaining.length ? SHIP_TYPES.findIndex(s => s.id === remaining[0].id) : null;
}

function renderPlacementScreen(playerNum) {
    const title = byId('placement-title');
    title.replaceChildren();
    if (state.mode === 'pvp') title.append(`JOGADOR ${playerNum}:`, el('br'), 'POSICIONE SUA FROTA');
    else title.append('POSICIONE', el('br'), 'SUA FROTA');
    if (!placementLocked()) byId('placement-subtitle').textContent = PLACEMENT_HINT;
    ensureSelection(playerNum);
    renderShipList(playerNum);
    renderPlacementBoard(playerNum);
    updateReadyButton(playerNum);
    renderPlacementStatus();
}

function renderPlacementStatus() {
    const status = currentMode().placementStatus;
    if (status) { status(); return; }
    byId('ready-panel').hidden = true;
    byId('placement-wait').hidden = true;
}

function renderShipList(playerNum) {
    byId('ship-list').replaceChildren(...SHIP_TYPES.map((ship, idx) => {
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
    const progress = byId('fleet-progress');
    progress.replaceChildren(...SHIP_TYPES.map(ship =>
        el('i', state.remaining[playerNum].some(r => r.id === ship.id) ? '' : 'on')));
    progress.setAttribute('aria-label', `${placedCount} de ${SHIP_TYPES.length} navios posicionados`);
    byId('fleet-count').textContent = `${placedCount}/${SHIP_TYPES.length}`;
    byId('dir-label').textContent = `GIRAR · ${state.placementDirection === 'h' ? 'H' : 'V'}`;
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
    const { board, ships } = randomPlacementForPlayer();
    state.boards[state.currentPlacer] = board;
    state.ships[state.currentPlacer] = ships;
    state.remaining[state.currentPlacer] = [];
    state.selectedShipIdx = null;
    renderPlacementScreen(state.currentPlacer);
}

function renderPlacementBoard(playerNum) {
    const container = byId('placement-board');
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
    const board = byId(boardId);
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
    const button = byId('btn-ready');
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
    currentMode().ready();
}
