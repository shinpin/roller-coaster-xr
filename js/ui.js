import { State } from './state.js';
import { THEMES, TIMES } from './config.js';

let UI = {};

export function initUI(callbacks) {
    // Cache DOM Elements to avoid expensive querying in game loop
    UI = {
        speedVal: document.getElementById('speed-val'),
        accelBar: document.getElementById('accel-bar'),
        altVal: document.getElementById('alt-val'),
        headVal: document.getElementById('head-val'),
        compass: document.getElementById('compass'),
        gforceVal: document.getElementById('gforce-val'),
        pitchLadder: document.getElementById('pitch-ladder'),
        leftIdr: document.getElementById('turn-indicator-left'),
        rightIdr: document.getElementById('turn-indicator-right'),
        warningAlert: document.getElementById('warning-alert'),
        scoreVal: document.getElementById('score-val'),
        scoreUI: document.getElementById('score-ui'),
        envVal: document.getElementById('env-val'),
        debugPanel: document.getElementById('debug-panel')
    };

    // Attach Event Listeners
    setupEventListeners(callbacks);
    populateSavedTracksUI();
}

function setupEventListeners(callbacks) {
    document.getElementById('debug-btn').addEventListener('click', () => {
        State.isDebug = !State.isDebug;
        const panel = document.getElementById('debug-panel');
        const btn = document.getElementById('debug-btn');
        if (State.isDebug) {
            panel.classList.remove('hidden');
            btn.style.color = '#0f0'; btn.style.borderColor = '#0f0';
        } else {
            panel.classList.add('hidden');
            btn.style.color = '#aaa'; btn.style.borderColor = '#555';
        }
    });

    document.getElementById('close-inst-btn').addEventListener('click', () => {
        document.getElementById('instructions-overlay').style.display = 'none';
    });

    document.getElementById('help-btn').addEventListener('click', () => {
        const inst = document.getElementById('instructions-overlay');
        if (inst.style.display === 'none' || inst.style.display === '') {
            inst.style.display = 'flex';
            inst.style.opacity = '1';
            inst.style.pointerEvents = 'auto';
        } else {
            inst.style.display = 'none';
        }
    });

    document.getElementById('menu-btn').addEventListener('click', callbacks.onMenu);
    document.getElementById('audio-toggle-btn').addEventListener('click', callbacks.onToggleAudio);
    document.getElementById('save-btn').addEventListener('click', () => saveCurrentTrack());
    document.getElementById('start-btn').addEventListener('click', callbacks.onStart);

    document.getElementById('theme-select').addEventListener('change', callbacks.onSettingChange);
    document.getElementById('time-select').addEventListener('change', callbacks.onSettingChange);
    document.getElementById('weather-select').addEventListener('change', callbacks.onSettingChange);

    const savedTracksSelect = document.getElementById('saved-tracks-select');
    if (savedTracksSelect) {
        savedTracksSelect.addEventListener('change', (e) => {
            if(e.target.value !== "") {
                const conf = JSON.parse(e.target.value);
                document.getElementById('theme-select').value = conf.theme;
                document.getElementById('time-select').value = conf.time;
                document.getElementById('weather-select').value = conf.weather;
                callbacks.onLoadTrack(conf);
            } else {
                callbacks.onSettingChange();
            }
        });
    }
}

// State Caching for Throttling UI Updates
let lastSpeedTxt = '';
let lastAltTxt = '';
let lastHeadTxt = '';
let lastGForceTxt = '';
let lastPitchTxt = '';

export function updateHUD(data) {
    // Use string caching to prevent redundant DOM updates
    const speedTxt = `${data.displaySpeed}<span> km/h</span>`;
    if (speedTxt !== lastSpeedTxt) {
        UI.speedVal.innerHTML = speedTxt;
        UI.accelBar.style.width = `${data.accelRatio}%`;
        lastSpeedTxt = speedTxt;
    }

    const altTxt = `${data.displayAlt}<span> m</span>`;
    if (altTxt !== lastAltTxt) {
        UI.altVal.innerHTML = altTxt;
        lastAltTxt = altTxt;
    }

    const headTxt = `${data.deg}<span> &deg;</span>`;
    if (headTxt !== lastHeadTxt) {
        UI.headVal.innerHTML = headTxt;
        UI.compass.style.transform = `translateX(${-data.deg * 2}px)`;
        lastHeadTxt = headTxt;
    }

    const gForceTxt = `${data.gForce.toFixed(1)}<span> G</span>`;
    if (gForceTxt !== lastGForceTxt) {
        UI.gforceVal.innerHTML = gForceTxt;
        lastGForceTxt = gForceTxt;
    }

    const pitchTxt = `translateY(${data.pitchDeg * 3}px)`;
    if (pitchTxt !== lastPitchTxt) {
        UI.pitchLadder.style.transform = pitchTxt;
        lastPitchTxt = pitchTxt;
    }

    // Indicators Check
    if(data.isTurnLeft) {
        UI.leftIdr.classList.remove('hidden'); 
        UI.rightIdr.classList.add('hidden');
    } else if(data.isTurnRight) {
        UI.rightIdr.classList.remove('hidden'); 
        UI.leftIdr.classList.add('hidden');
    } else {
        UI.leftIdr.classList.add('hidden'); 
        UI.rightIdr.classList.add('hidden');
    }

    if (data.isWarning) {
        UI.warningAlert.classList.remove('hidden');
    } else {
        UI.warningAlert.classList.add('hidden');
    }
}

export function showCoinScoreEffect(sx, sy, lane, onComplete) {
    const floatingCoin = document.createElement('div');
    floatingCoin.className = 'floating-coin';
    floatingCoin.style.left = sx + 'px';
    floatingCoin.style.top = sy + 'px';
    document.body.appendChild(floatingCoin);
    
    // Force reflow
    void floatingCoin.offsetWidth;
    
    const scoreRect = UI.scoreUI.getBoundingClientRect();
    const tx = scoreRect.left + scoreRect.width/2;
    const ty = scoreRect.top + scoreRect.height/2;
    
    floatingCoin.style.transform = `translate(${tx - sx}px, ${ty - sy}px) scale(0.5)`;
    
    setTimeout(() => {
        if (document.body.contains(floatingCoin)) floatingCoin.remove();
        onComplete();
    }, 500);
}

export function flashScore() {
    UI.scoreVal.innerText = State.score;
    UI.scoreUI.classList.remove('score-bounce');
    void UI.scoreUI.offsetWidth; 
    UI.scoreUI.classList.add('score-bounce');
}

export function updateDebugPanel(text) {
    if (State.isDebug) {
        UI.debugPanel.innerHTML = text;
    }
}

export function updateEnvironmentUI() {
    const weatherIcons = { 'clear': '☀️', 'rain': '🌧️', 'snow': '❄️' };
    const timeStrings = { 'day': '10:00 ', 'sunset': '17:30 ', 'night': '23:00 ' };
    if (UI.envVal) {
        const themeType = typeof State.currentTheme.type === 'string' ? State.currentTheme.type : 'underwater';
        const wIcon = weatherIcons[State.currentWeather] || '☁️';
        const tStr = timeStrings[Object.keys(TIMES).find(k => TIMES[k] === State.currentTime)] || '12:00 ';
        UI.envVal.innerHTML = `${wIcon} ${tStr}`;
    }
}

function getSavedTracks() {
    try {
        const data = localStorage.getItem('neon_coaster_saves');
        if (data) return JSON.parse(data);
    } catch(e) {}
    
    const defaultSaves = [
        { slot: 1, name: "Sky Drift", config: { seed: 881023, theme: 'sky', time: 'day', weather: 'clear' } },
        { slot: 2, name: "Neon Loop", config: { seed: 773124, theme: 'synthwave', time: 'night', weather: 'clear' } },
        { slot: 3, name: "Abyss Run", config: { seed: 442911, theme: 'underwater', time: 'night', weather: 'clear' } },
        { slot: 4, name: "Storm Peak", config: { seed: 221056, theme: 'land', time: 'sunset', weather: 'rain' } },
        { slot: 5, name: "Icy Climb", config: { seed: 994038, theme: 'sky', time: 'sunset', weather: 'snow' } }
    ];
    try {
        localStorage.setItem('neon_coaster_saves', JSON.stringify(defaultSaves));
    } catch(e) {}
    return defaultSaves;
}

function saveCurrentTrack() {
    if (!State.currentLevelConfig) return;
    const slotStr = prompt("Save this track? \nEnter Slot Number (1 to 5):", "1");
    if(!slotStr) return;
    const slotNum = parseInt(slotStr);
    if(isNaN(slotNum) || slotNum < 1 || slotNum > 5) { alert("Invalid slot number! Use 1 to 5."); return; }
    
    const name = prompt("Enter a name for this track:", `Epic Track ${slotNum}`);
    if(!name) return;
    
    const saves = getSavedTracks();
    const saveObj = { slot: slotNum, name: name, config: State.currentLevelConfig };
    
    const existingIdx = saves.findIndex(s => s.slot === slotNum);
    if(existingIdx >= 0) saves.splice(existingIdx, 1);
    
    saves.push(saveObj);
    saves.sort((a,b) => a.slot - b.slot);
    localStorage.setItem('neon_coaster_saves', JSON.stringify(saves));
    
    populateSavedTracksUI();
    
    const notif = document.createElement('div');
    notif.className = 'save-notif';
    notif.innerText = `Track Saved to Slot ${slotNum}!`;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 2500);
}

function populateSavedTracksUI() {
    const saves = getSavedTracks();
    const select = document.getElementById('saved-tracks-select');
    if(!select) return;
    select.innerHTML = '<option value="">-- Randomize New Track --</option>';
    saves.forEach(s => {
        const opt = document.createElement('option');
        opt.value = JSON.stringify(s.config);
        opt.innerText = `Slot ${s.slot}: ${s.name}`;
        select.appendChild(opt);
    });
}

export function updateMinimap(progress) {
    if (!State.curve) return;
    const canvas = document.getElementById('minimap');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.4)';
    ctx.lineWidth = 1.5;
    State.minimapTrackPoints.forEach((pt, i) => {
        if(i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();
    ctx.stroke();
    
    const bp = State.curve.getPointAt(progress);
    const px = (canvas.width / 2) + (bp.x - State.minimapCx) * State.minimapScale;
    const py = (canvas.height / 2) + (bp.z - State.minimapCz) * State.minimapScale;
    
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI*2);
    ctx.fillStyle = '#ff00ea';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ff00ea';
    ctx.fill();

    // Draw NPCs
    if (State.npcs) {
        State.npcs.forEach(npc => {
            const npcP = State.curve.getPointAt(npc.rideProgress % 1.0);
            const npx = (canvas.width / 2) + (npcP.x - State.minimapCx) * State.minimapScale;
            const npy = (canvas.height / 2) + (npcP.z - State.minimapCz) * State.minimapScale;
            
            ctx.beginPath();
            ctx.arc(npx, npy, 3, 0, Math.PI*2);
            // Use their vibrant body color for the minimap dot
            ctx.fillStyle = npc.cartGroup.children[0].material.color.getStyle();
            ctx.shadowBlur = 5;
            ctx.shadowColor = ctx.fillStyle;
            ctx.fill();
        });
    }

    ctx.shadowBlur = 0;
}

