'use strict';

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        toggleRules(false);
        hideExitOverlay();
        skipFinale();
        return;
    }
    if (e.target instanceof HTMLInputElement) return;
    if ((e.key === 'r' || e.key === 'R') && state.phase === 'placement') rotateShip();
});

window.addEventListener('beforeunload', e => {
    if (state.phase === 'game') {
        e.preventDefault();
        e.returnValue = '';
        return '';
    }
});

resetState();
initMenu();
initHoldButton();
initOnlineUi();
