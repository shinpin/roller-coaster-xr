import { State } from './state.js';

export function setupInput(callbacks) {
    window.addEventListener('keydown', (e) => { 
        if (e.code === 'KeyS' && State.isRiding && State.currentLevelConfig) {
            // Save track logic is managed in ui.js, but triggered by button click there. Let's redirect key to click.
            const sbtn = document.getElementById('save-btn');
            if(sbtn) sbtn.click();
        }
        if (e.code === 'Space') State.isBoosting = true; 
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') State.playerLane = -1;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') State.playerLane = 1;
    });
    window.addEventListener('keyup', (e) => { 
        if (e.code === 'Space') State.isBoosting = false; 
    });
    window.addEventListener('mousedown', (e) => { 
        if (e.target.id === 'save-btn') return;
        if (e.clientX < window.innerWidth / 2) State.playerLane = -1;
        else State.playerLane = 1;
    });
    window.addEventListener('touchstart', (e) => { 
        if (e.target.id === 'save-btn') return;
        if (e.touches.length > 1) {
            State.isBoosting = true; 
        } else {
            if (e.touches[0].clientX < window.innerWidth / 2) State.playerLane = -1;
            else State.playerLane = 1;
        }
    });
    window.addEventListener('touchend', (e) => { 
        if (e.touches.length < 2) State.isBoosting = false; 
    });
}

export function setupXRInput(renderer, callbacks) {
    const controller1 = renderer.xr.getController(0);
    controller1.addEventListener('selectstart', () => {
        if (!State.isRiding && callbacks.onStart) { callbacks.onStart(); return; }
        State.playerLane = -1; // Switch Left
    });
    controller1.addEventListener('squeezestart', () => { if(State.isRiding) State.isBoosting = true; });
    controller1.addEventListener('squeezeend', () => State.isBoosting = false);

    const controller2 = renderer.xr.getController(1);
    controller2.addEventListener('selectstart', () => {
        if (!State.isRiding && callbacks.onStart) { callbacks.onStart(); return; }
        State.playerLane = 1;  // Switch Right
    });
    controller2.addEventListener('squeezestart', () => { if(State.isRiding) State.isBoosting = true; });
    controller2.addEventListener('squeezeend', () => State.isBoosting = false);

    return { controller1, controller2 };
}
