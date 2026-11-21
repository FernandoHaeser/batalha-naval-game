'use strict';

const RADIO_SCREENS = ['placement', 'game', 'victory'];
const GAME_START_DELAY_MS = 1100;
let radioOpen = true;
let radioMuted = false;

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
    byId('server-dot').className = `server-dot ${status === 'on' ? 'on' : status === 'off' ? 'off' : ''}`;
    byId('server-label').textContent = status === 'on' ? 'SERVIDOR ONLINE'
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
    byId('lobby-menu').hidden = false;
    byId('lobby-waiting').hidden = true;
    byId('lobby-code').value = '';
    showLobbyError('');
}

function showLobbyError(message) {
    byId('lobby-error').textContent = message;
    byId('lobby-code').classList.toggle('error', Boolean(message));
    if (message) restartAnimation(byId('join-row'), 'shake');
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
    const code = byId('lobby-code').value.trim().toUpperCase();
    if (code.length < 4) { showLobbyError('O código tem 4 caracteres.'); return; }
    showLobbyError('');
    socket.emit('join-lobby', { code });
}

function showLobbyWaiting(code) {
    const host = state.online.isHost;
    state.online.lobbyCode = code;
    state.online.ready = { 1: false, 2: false };
    byId('lobby-menu').hidden = true;
    byId('lobby-waiting').hidden = false;
    const chars = byId('lobby-code-display');
    chars.replaceChildren(...code.split('').map(ch => el('span', '', ch)));
    chars.setAttribute('aria-label', `Código da sala: ${code.split('').join(' ')}`);
    byId('room-caption').textContent = host ? 'CÓDIGO DA SUA SALA' : 'VOCÊ ENTROU NA SALA';
    byId('btn-copy').hidden = !host;
    byId('copy-label').textContent = 'COPIAR CÓDIGO';
    clearChat();
    renderLobbyRoom(!host);
}

function renderLobbyRoom(opponentConnected) {
    const host = state.online.isHost;
    byId('lobby-waiting').classList.toggle('waiting', !opponentConnected);
    byId('radar-icon').setAttribute('fill', opponentConnected ? '#00ff88' : '#1e4a70');

    const status = byId('lobby-status');
    if (!opponentConnected) status.replaceChildren('Aguardando adversário', dotsEl());
    else status.textContent = host ? 'Adversário conectado! Hora da batalha.' : 'Conectado ao anfitrião.';

    const slots = [
        { n: 'P1', badge: 'badge-p1', name: host ? 'VOCÊ' : 'ANFITRIÃO', role: 'ANFITRIÃO', on: true },
        { n: 'P2', badge: 'badge-p2', name: host ? (opponentConnected ? 'ADVERSÁRIO' : 'VAGA ABERTA') : 'VOCÊ', role: 'CONVIDADO', on: opponentConnected },
    ];
    byId('crew-slots').replaceChildren(...slots.map(slot => {
        const row = el('div', `slot ${slot.on ? 'on' : ''}`);
        const info = el('span', 'slot-info');
        info.append(el('span', 'slot-name', slot.name), el('span', 'slot-status', slot.on ? '● CONECTADO' : 'aguardando…'));
        row.append(el('span', `slot-badge ${slot.badge}`, slot.n), info, el('span', 'slot-role', slot.role));
        return row;
    }));
}

function copyLobbyCode() {
    const code = state.online.lobbyCode;
    if (!code) return;
    try {
        if (navigator.clipboard) navigator.clipboard.writeText(code);
    } catch (e) { }
    const label = byId('copy-label');
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

function onlineReady() {
    const me = state.online.playerNumber;
    state.online.readySent = true;
    state.online.ready[me] = true;
    byId('placement-subtitle').textContent = 'Frota pronta. Aguardando o adversário...';
    renderPlacementScreen(me);
    clearPlacementPreview();
    const socket = getOnlineSocket();
    if (socket) socket.emit('player-ready', { board: state.boards[me], ships: state.ships[me] });
}

function renderReadyPanel() {
    const me = state.online.playerNumber || 1;
    const foe = otherPlayer(me);
    const ready = state.online.ready;
    const count = Number(Boolean(ready[1])) + Number(Boolean(ready[2]));
    const allReady = count === 2;

    const panel = byId('ready-panel');
    panel.hidden = false;
    panel.classList.toggle('all-ready', allReady);
    byId('ready-count').textContent = `${count}/2`;
    byId('ready-bar').querySelectorAll('i').forEach((bar, k) => bar.classList.toggle('on', k < count));

    const slots = [
        { n: me, name: 'VOCÊ', on: ready[me] },
        { n: foe, name: 'ADVERSÁRIO', on: ready[foe] },
    ];
    byId('ready-slots').replaceChildren(...slots.map(slot => {
        const row = el('div', `ready-slot ${slot.on ? 'on' : ''}`);
        const status = el('span', 'ready-state');
        if (slot.on) status.textContent = '✓ PRONTO';
        else status.replaceChildren('posicionando', dotsEl());
        row.append(el('span', `avatar avatar-sm avatar-${playerColor(slot.n)}`, `P${slot.n}`), el('span', 'ready-name', slot.name), status);
        return row;
    }));

    const wait = byId('placement-wait');
    wait.hidden = !state.online.readySent;
    wait.classList.toggle('all-ready', allReady);
    byId('placement-wait-title').textContent = allReady ? 'BATALHA INICIANDO' : 'AGUARDANDO ADVERSÁRIO';
    const sub = byId('placement-wait-sub');
    if (allReady) sub.textContent = 'Todos prontos. Aos canhões!';
    else sub.replaceChildren('O adversário ainda posiciona a frota', dotsEl());
}

function isRadioAvailable() {
    return state.mode === 'online'
        && Boolean(state.online.lobbyCode)
        && RADIO_SCREENS.includes(state.phase);
}

function updateRadioVisibility() {
    const radio = byId('radio');
    if (!radio) return;
    const available = isRadioAvailable();
    radio.hidden = !available;
    document.body.classList.toggle('has-radio', available);
    byId('radio-channel').textContent = state.online.lobbyCode ? `sala ${state.online.lobbyCode}` : '';
}

function toggleRadioOpen() {
    radioOpen = !radioOpen;
    byId('radio').classList.toggle('closed', !radioOpen);
    const toggle = byId('radio-toggle');
    toggle.setAttribute('aria-expanded', String(radioOpen));
    toggle.setAttribute('aria-label', radioOpen ? 'Minimizar rádio' : 'Abrir rádio');
    byId('radio-last').hidden = radioOpen;
    if (radioOpen) scrollRadio();
}

function toggleRadioMute() {
    radioMuted = !radioMuted;
    const button = byId('radio-mute');
    button.textContent = radioMuted ? 'Silenciado' : 'Silenciar';
    button.setAttribute('aria-pressed', String(radioMuted));
    document.querySelectorAll('.radio-compose button, .radio-compose input').forEach(node => { node.disabled = radioMuted; });
    byId('chat-input').placeholder = radioMuted ? 'Rádio silenciado' : 'Transmitir mensagem…';
}

function emitChat(text) {
    const clean = (text || '').trim();
    if (!clean || radioMuted || !state.online.socket || !state.online.lobbyCode) return false;
    state.online.socket.emit('chat-message', { text: clean });
    return true;
}

function sendChatMessage(event) {
    event.preventDefault();
    const input = byId('chat-input');
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
    const messages = byId('chat-messages');
    messages.scrollTop = messages.scrollHeight;
}

function pushRadioLine(kind, who, text, tone) {
    const cls = `msg-${kind}${tone ? ` tone-${tone}` : ''}`;
    const messages = byId('chat-messages');
    const line = el('li', cls);
    line.append(el('span', 'msg-time', nowTime()), el('span', 'msg-who', who), el('span', 'msg-text', text));
    messages.append(line);
    while (messages.children.length > 80) messages.firstChild.remove();
    scrollRadio();

    const last = el('span', `radio-last-line ${cls}`);
    last.append(el('span', 'msg-who', who), el('span', 'msg-text', text));
    byId('radio-last').replaceChildren(last);
}

function radioSystem(text, tone) {
    pushRadioLine('sys', '»', text, tone);
}

function showSay(id, text) {
    if (state.phase !== 'game') return;
    const bubble = byId(id);
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
    byId('chat-messages').replaceChildren();
    byId('radio-last').replaceChildren();
}

function applyAttackResult({ attacker, target, row, col, result, sunkShip, turn, shipsLeft }) {
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
        const [r0, c0] = sunkShip.positions[0];
        const sunk = ships.find(ship => ship.positions && ship.positions.some(([r, c]) => r === r0 && c === c0));
        if (sunk) sunk.sunk = true;
    }

    const me = state.online.playerNumber;
    const name = cellName(row, col);
    const shipName = sunkShip ? (sunkShip.name || 'NAVIO') : null;
    if (attacker === me) {
        recordShot(me, sunkShip ? 'sunk' : result);
        state.lastShotCell = [row, col];
        if (sunkShip) {
            addLog('VOCÊ', `AFUNDOU o ${shipName}!`, 'sunk');
            radioSystem(`Você afundou o ${shipName}!`, 'sunk');
        } else if (result === 'hit') {
            addLog('VOCÊ', `Acertou ${name}`, 'hit');
            radioSystem(`Você acertou ${name}`, 'hit');
        } else {
            addLog('VOCÊ', `Água em ${name}`, 'miss');
        }
    } else {
        state.lastOwnCell = [row, col];
        if (sunkShip) {
            addLog('RIVAL', `Afundou seu ${shipName}!`, 'bad');
            radioSystem(`O adversário afundou seu ${shipName}`, 'bad');
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
    if (attacker === me && result !== 'miss') restartAnimation(byId('enemy-board-wrap'), 'shake');
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

    socket.on('lobby-error', ({ message }) => showLobbyError(message));

    socket.on('lobby-state', ({ connected }) => {
        if (connected !== 2) return;
        renderLobbyRoom(true);
        const code = state.online.lobbyCode;
        setTimeout(() => {
            if (state.phase !== 'lobby' || state.online.lobbyCode !== code) return;
            const me = state.online.playerNumber;
            state.currentPlacer = me;
            state.online.readySent = false;
            showScreen('placement');
            buildBoardLabels('placement-col-labels', 'placement-row-labels');
            renderPlacementScreen(me);
            radioSystem('Tripulação completa. Posicionem suas frotas.');
        }, 1200);
    });

    socket.on('player-ready', ({ playerNumber }) => {
        if (playerNumber !== 1 && playerNumber !== 2) return;
        state.online.ready[playerNumber] = true;
        if (state.phase === 'placement') renderReadyPanel();
        if (playerNumber === state.online.playerNumber) return;
        radioSystem('O adversário está com a frota pronta.');
        if (!state.online.readySent) {
            byId('placement-subtitle').textContent = 'Adversário pronto. Aguardando você...';
        }
    });

    socket.on('game-start', ({ turn }) => {
        const code = state.online.lobbyCode;
        state.online.ready = { 1: true, 2: true };
        if (state.phase === 'placement') renderReadyPanel();
        state.phase = 'game';
        state.gameId = Date.now();
        state.currentTurn = turn;
        state.stats.start = Date.now();
        state.banner = { last: null, streak: 0 };
        radioSystem(turn === state.online.playerNumber ? 'Partida iniciada. Você começa.' : 'Partida iniciada. O adversário começa.');
        setTimeout(() => {
            if (state.mode !== 'online' || state.online.lobbyCode !== code) return;
            state.online.readySent = false;
            if (state.phase === 'game') enterBattleScreen();
        }, GAME_START_DELAY_MS);
    });

    socket.on('attack-result', applyAttackResult);

    socket.on('turn-changed', ({ turn }) => {
        if (!turn || turn === state.currentTurn) return;
        state.currentTurn = turn;
        updateTurnUI();
        renderGameBoards();
    });

    socket.on('game-over', ({ winner }) => endGame(winner));

    socket.on('chat-message', ({ playerNumber, text }) => appendChatMessage(playerNumber, text));

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

function initOnlineUi() {
    byId('lobby-code').addEventListener('input', e => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
        if (byId('lobby-error').textContent) showLobbyError('');
    });
}

defineMode('online', {
    viewer: () => state.online.playerNumber || 1,

    color: n => (n === getViewer() ? 'cyan' : 'orange'),

    placementLocked: () => state.online.readySent,

    placementStatus: renderReadyPanel,

    confirmPlacementExit: true,

    rematch: false,

    launch: openLobby,

    ready: onlineReady,

    attack(row, col) {
        getOnlineSocket()?.emit('attack', { row, col });
    },

    labels() {
        return {
            me: 'VOCÊ',
            foe: 'ADVERSÁRIO',
            mode: `ONLINE · SALA ${state.online.lobbyCode || ''}`,
            enemyBoard: 'ALVO · MAR DO ADVERSÁRIO',
            ownBoard: 'SUA FROTA',
        };
    },

    turnBanner: () => ({ title: 'SEU TURNO', sub: 'Escolha um alvo no mar do adversário' }),

    waitBanner: () => ({ cls: 'foe', title: 'VEZ DO ADVERSÁRIO', sub: 'Proteja sua frota' }),

    foeShipsLeft: foe => (state.online.shipsLeft ? state.online.shipsLeft[foe] : SHIP_TYPES.length),

    result(winner) {
        const me = state.online.playerNumber;
        const won = winner === me;
        return {
            won,
            subject: me,
            mapBoard: state.boards[otherPlayer(me)],
            revealShips: false,
            subtitle: won ? 'Você afundou a frota do adversário.' : 'O adversário afundou toda a sua frota.',
        };
    },
});
