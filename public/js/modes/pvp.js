'use strict';

let holdTimer = null;

function pvpColor(n) {
    return n === 1 ? 'cyan' : 'orange';
}

function showPvpOverlay({ to, msg, events = [] }, callback) {
    const from = otherPlayer(to);
    const fromEl = byId('swap-from');
    const toEl = byId('swap-to');
    fromEl.className = `avatar avatar-lg avatar-${pvpColor(from)} dim`;
    toEl.className = `avatar avatar-lg avatar-${pvpColor(to)}`;
    fromEl.textContent = `P${from}`;
    toEl.textContent = `P${to}`;

    const target = el('span', `swap-target target-${pvpColor(to)}`, `JOGADOR ${to}`);
    byId('overlay-title').replaceChildren('PASSE O APARELHO', el('br'), 'PARA O ', target);
    byId('overlay-msg').textContent = msg;

    byId('swap-events-box').hidden = events.length === 0;
    byId('swap-events').replaceChildren(...events.slice(-6).map(ev => {
        const li = el('li', ev.hit ? 'hit' : '');
        li.append(el('i'), ev.text);
        return li;
    }));

    const overlay = byId('pvp-overlay');
    const hold = byId('hold-btn');
    hold.classList.remove('holding');
    hold.setAttribute('aria-label', `Segure para revelar o tabuleiro do Jogador ${to}`);
    overlay._callback = callback;
    overlay.hidden = false;
    hold.focus();
}

function hidePvpOverlay() {
    const overlay = byId('pvp-overlay');
    clearTimeout(holdTimer);
    overlay.hidden = true;
    const callback = overlay._callback;
    overlay._callback = null;
    if (callback) callback();
}

function initHoldButton() {
    const hold = byId('hold-btn');
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
    hold.addEventListener('click', e => { if (e.detail === 0) hidePvpOverlay(); });
}

defineMode('pvp', {
    viewer: () => state.pvpViewer,

    color: pvpColor,

    inputBlocked: () => !byId('pvp-overlay').hidden,

    launch() {
        startGame('pvp', null);
    },

    ready() {
        if (state.currentPlacer === 1) {
            state.currentPlacer = 2;
            state.selectedShipIdx = null;
            showPvpOverlay({ to: 2, msg: 'Jogador 1, não olhe! Agora o Jogador 2 posiciona a frota.' }, () => {
                renderPlacementScreen(2);
            });
            return;
        }
        showPvpOverlay({ to: 1, msg: 'Frotas posicionadas. O Jogador 1 abre fogo.' }, startGamePhase);
    },

    labels(viewer, foe) {
        return {
            me: `JOGADOR ${viewer}`,
            foe: `JOGADOR ${foe}`,
            mode: '1 VS 1',
            enemyBoard: `> MAR DO JOGADOR ${foe}`,
            ownBoard: `SEU MAR · J${viewer}`,
        };
    },

    shooterName: attacker => `J${attacker}`,

    onShot({ attacker, name, result, sunkShip, hitShip }) {
        const text = sunkShip ? `Jogador ${attacker} afundou seu ${sunkShip.name} em ${name}`
            : hitShip ? `Jogador ${attacker} acertou seu ${hitShip.name} em ${name}`
                : `Jogador ${attacker} errou em ${name} — sua vez`;
        state.pvpEvents.push({ hit: result !== 'miss', text });
    },

    passTurn(attacker, target) {
        updateTurnUI();
        renderGameBoards();
        const gameId = state.gameId;
        setTimeout(() => {
            if (state.gameId !== gameId || state.phase !== 'game') return;
            const msg = `Jogador ${attacker}, não olhe! Os tabuleiros ficam escondidos até o Jogador ${target} confirmar.`;
            showPvpOverlay({ to: target, msg, events: state.pvpEvents }, () => {
                state.pvpViewer = target;
                state.pvpEvents = [];
                state.lastShotCell = null;
                state.banner = { last: null, streak: 0 };
                renderGameScreen();
            });
        }, 800);
    },

    turnBanner: viewer => ({ title: `VEZ DO JOGADOR ${viewer}`, sub: 'Escolha um alvo no radar' }),

    waitBanner: () => ({ cls: 'foe', title: `VEZ DO JOGADOR ${state.currentTurn}`, sub: 'Passe o aparelho' }),

    result(winner) {
        const loser = otherPlayer(winner);
        return {
            won: true,
            title: `JOGADOR ${winner} VENCEU!`,
            subject: winner,
            mapBoard: state.boards[loser],
            revealShips: true,
            subtitle: `O Jogador ${winner} afundou a frota do Jogador ${loser}.`,
        };
    },
});
