'use strict';

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    byId(`screen-${id}`).classList.add('active');
    state.phase = id;
    hideExitOverlay();
    updateRadioVisibility();
    window.scrollTo(0, 0);
}

function backToMenu() {
    if (state.online.socket && state.online.lobbyCode) state.online.socket.emit('leave-lobby');
    resetState();
    byId('pvp-overlay').hidden = true;
    selectMode(state.mode);
    showScreen('menu');
}

function playAgain() {
    const { mode, difficulty } = state;
    if (!currentMode().rematch) { backToMenu(); return; }
    resetState();
    state.mode = mode;
    state.difficulty = difficulty;
    currentMode().launch();
}

function selectMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.mode-card').forEach(card => {
        card.setAttribute('aria-pressed', String(card.dataset.mode === mode));
    });
    byId('diff-section').hidden = mode !== 'pve';
    byId('launch-label').textContent = mode === 'online' ? 'ABRIR LOBBY' : 'ZARPAR';
}

function selectDifficulty(diff) {
    state.difficulty = diff;
    document.querySelectorAll('.diff-card').forEach(card => {
        card.setAttribute('aria-pressed', String(card.dataset.diff === diff));
    });
}

function launchMode() {
    currentMode().launch();
}

function toggleRules(open) {
    byId('rules-overlay').hidden = !open;
}

function initMenu() {
    const stars = byId('stars');
    for (let k = 0; k < 28; k++) {
        const star = el('span', k % 4 === 0 ? 'star star-big' : 'star');
        star.style.left = `${(k * 37 + 11) % 100}%`;
        star.style.top = `${(k * 53) % 250 + 8}px`;
        star.style.animationDelay = `-${((k * 0.43) % 3).toFixed(2)}s`;
        stars.appendChild(star);
    }
    document.querySelectorAll('.pips[data-level]').forEach(pips => {
        const level = Number(pips.dataset.level);
        for (let i = 1; i <= 4; i++) pips.appendChild(el('i', i <= level ? 'on' : ''));
    });
    byId('rules-overlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) toggleRules(false);
    });
    selectMode(state.mode);
    selectDifficulty(state.difficulty);
}

function onExitClick() {
    const risky = state.phase === 'game' || (state.phase === 'placement' && currentMode().confirmPlacementExit);
    if (risky) showExitOverlay();
    else backToMenu();
}

function showExitOverlay() {
    byId('exit-overlay').hidden = false;
}

function hideExitOverlay() {
    const overlay = byId('exit-overlay');
    if (overlay) overlay.hidden = true;
}

function confirmExit() {
    hideExitOverlay();
    backToMenu();
}
