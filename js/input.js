import { State } from './state.js';

export function setupInput(callbacks) {
    window.addEventListener('keydown', (e) => { 
        if (e.code === 'KeyS' && State.isRiding && State.currentLevelConfig) {
            const sbtn = document.getElementById('save-btn');
            if(sbtn) sbtn.click();
        }
        
        // Player 1 (W, A, D / Space)
        if (State.players && State.players[0]) {
            if (e.code === 'Space' || e.code === 'KeyW') State.players[0].isBoosting = true; 
            if (e.code === 'KeyA') State.players[0].lane = -1;
            if (e.code === 'KeyD') State.players[0].lane = 1;
        }

        // Player 2 (Up, Left, Right / Enter)
        if (State.players && State.players[1]) {
            if (e.code === 'Enter' || e.code === 'ArrowUp') State.players[1].isBoosting = true; 
            if (e.code === 'ArrowLeft') State.players[1].lane = -1;
            if (e.code === 'ArrowRight') State.players[1].lane = 1;
        }
    });

    window.addEventListener('keyup', (e) => { 
        if (State.players && State.players[0]) {
            if (e.code === 'Space' || e.code === 'KeyW') State.players[0].isBoosting = false; 
        }
        if (State.players && State.players[1]) {
            if (e.code === 'Enter' || e.code === 'ArrowUp') State.players[1].isBoosting = false; 
        }
    });
    window.addEventListener('mousedown', (e) => { 
        if (e.target.id === 'save-btn' || !State.players || !State.players[0]) return;
        if (e.clientX < window.innerWidth / 2) State.players[0].lane = -1;
        else State.players[0].lane = 1;
    });
    window.addEventListener('touchstart', (e) => { 
        if (e.target.id === 'save-btn' || !State.players || !State.players[0]) return;
        if (e.touches.length > 1) {
            State.players[0].isBoosting = true; 
        } else {
            if (e.touches[0].clientX < window.innerWidth / 2) State.players[0].lane = -1;
            else State.players[0].lane = 1;
        }
    });
    window.addEventListener('touchend', (e) => { 
        if (State.players && State.players[0] && e.touches.length < 2) State.players[0].isBoosting = false; 
    });
}

export function setupXRInput(renderer, callbacks) {
    const controller1 = renderer.xr.getController(0);
    controller1.addEventListener('selectstart', () => {
        if (!State.isRiding && callbacks.onStart) { callbacks.onStart(); return; }
        if (State.players && State.players[0]) State.players[0].lane = -1; 
    });
    controller1.addEventListener('squeezestart', () => { if(State.isRiding && State.players && State.players[0]) State.players[0].isBoosting = true; });
    controller1.addEventListener('squeezeend', () => { if (State.players && State.players[0]) State.players[0].isBoosting = false; });

    const controller2 = renderer.xr.getController(1);
    controller2.addEventListener('selectstart', () => {
        if (!State.isRiding && callbacks.onStart) { callbacks.onStart(); return; }
        if (State.players && State.players[0]) State.players[0].lane = 1; 
    });
    controller2.addEventListener('squeezestart', () => { if(State.isRiding && State.players && State.players[0]) State.players[0].isBoosting = true; });
    controller2.addEventListener('squeezeend', () => { if (State.players && State.players[0]) State.players[0].isBoosting = false; });

    return { controller1, controller2 };
}
