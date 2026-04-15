import { State } from './state.js';
import { THEMES, TIMES } from './config.js';

let UIs = [];
let lastStateTexts = [{}, {}];

export function initUI(callbacks) {
    // Cache DOM Elements for both screens (P1=-1, P2=-2)
    for (let i = 1; i <= 2; i++) {
        UIs.push({
            speedVal: document.getElementById(`speed-val-${i}`),
            accelBar: document.getElementById(`accel-bar-${i}`),
            altVal: document.getElementById(`alt-val-${i}`),
            headVal: document.getElementById(`head-val-${i}`),
            compass: document.getElementById(`compass-${i}`),
            gforceVal: document.getElementById(`gforce-val-${i}`),
            pitchLadder: document.getElementById(`pitch-ladder-${i}`),
            leftIdr: document.getElementById(`turn-indicator-left-${i}`),
            rightIdr: document.getElementById(`turn-indicator-right-${i}`),
            warningAlert: document.getElementById(`warning-alert-${i}`),
            scoreUI: document.getElementById(`score-ui-${i}`),
            scoreVal: document.getElementById(`score-val-${i}`),
            comboUI: document.getElementById(`combo-ui-${i}`),
            speedOverlay: document.getElementById(`speed-overlay-${i}`),
            collisionOverlay: document.getElementById(`collision-overlay-${i}`),
            leaderboardUI: document.getElementById(`leaderboard-${i}`),
            envVal: document.getElementById(`env-val-${i}`),
            rankVal: document.getElementById(`rank-val-${i}`),
            rankTotalEl: document.getElementById(`rank-total-${i}`)
        });
        lastStateTexts[i-1] = { speed: '', alt: '', head: '', g: '', pitch: '', rank: 1, combo: '', racersStr: '' };
    }

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
            if (panel.innerHTML.trim() === '') panel.innerHTML = 'Waiting for telemetry...';
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
    const audioBtn = document.getElementById('audio-toggle-btn');
    if (audioBtn) audioBtn.addEventListener('click', callbacks.onToggleAudio);

    const toggleBgmBtn = document.getElementById('toggle-bgm-btn');
    if (toggleBgmBtn) toggleBgmBtn.addEventListener('click', callbacks.onToggleBGM);

    const toggleSfxBtn = document.getElementById('toggle-sfx-btn');
    if (toggleSfxBtn) toggleSfxBtn.addEventListener('click', callbacks.onToggleSFX);
    document.getElementById('save-btn').addEventListener('click', () => saveCurrentTrack());
    document.getElementById('start-btn').addEventListener('click', callbacks.onStart);
    const retBtn = document.getElementById('return-menu-btn');
    if (retBtn) retBtn.addEventListener('click', callbacks.onReturnMenu);

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

    const perfBloom = document.getElementById('perf-bloom');
    if (perfBloom) perfBloom.addEventListener('change', (e) => { if(callbacks.onTogglePerf) callbacks.onTogglePerf('bloom', e.target.checked) });
    
    const perfShadows = document.getElementById('perf-shadows');
    if (perfShadows) perfShadows.addEventListener('change', (e) => { if(callbacks.onTogglePerf) callbacks.onTogglePerf('shadows', e.target.checked) });

    const perfParticles = document.getElementById('perf-particles');
    if (perfParticles) perfParticles.addEventListener('change', (e) => { if(callbacks.onTogglePerf) callbacks.onTogglePerf('particles', e.target.checked) });

    const perfResolution = document.getElementById('perf-resolution');
    if (perfResolution) perfResolution.addEventListener('change', (e) => { if(callbacks.onTogglePerf) callbacks.onTogglePerf('resolution', e.target.checked) });
}

// State Caching for Throttling UI Updates
export function updateHUD(data, playerIndex) {
    const UI = UIs[playerIndex];
    if (!UI) return;
    const last = lastStateTexts[playerIndex];

    const speedTxt = `${data.displaySpeed}<span> km/h</span>`;
    if (speedTxt !== last.speed) {
        UI.speedVal.innerHTML = speedTxt;
        UI.accelBar.style.width = `${data.accelRatio}%`;
        last.speed = speedTxt;
    }

    if (data.rank && data.rank !== last.rank) {
        if (UI.rankVal) UI.rankVal.innerText = data.rank;
        last.rank = data.rank;
    }
    // Update total racer count whenever racers list is refreshed
    if (data.racers && UI.rankTotalEl) {
        const total = data.racers.length;
        if (UI.rankTotalEl.innerText !== String(total)) UI.rankTotalEl.innerText = total;
    }

    const altTxt = `${data.displayAlt}<span> m</span>`;
    if (altTxt !== last.alt) {
        UI.altVal.innerHTML = altTxt;
        last.alt = altTxt;
    }

    const headTxt = `${data.deg}<span> &deg;</span>`;
    if (headTxt !== last.head) {
        UI.headVal.innerHTML = headTxt;
        UI.compass.style.transform = `translateX(${-data.deg * 2}px)`;
        last.head = headTxt;
    }

    const gForceTxt = `${data.gForce.toFixed(1)}<span> G</span>`;
    if (gForceTxt !== last.g) {
        UI.gforceVal.innerHTML = gForceTxt;
        last.g = gForceTxt;
    }

    const pitchTxt = `translateY(${data.pitchDeg * 3}px)`;
    if (pitchTxt !== last.pitch) {
        UI.pitchLadder.style.transform = pitchTxt;
        last.pitch = pitchTxt;
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
    
    // Combo Text
    if (data.comboText !== undefined && data.comboText !== last.combo) {
        if (UI.comboUI) {
            UI.comboUI.innerText = data.comboText;
            if (data.comboText === '') {
                UI.comboUI.classList.add('hidden');
            } else {
                UI.comboUI.classList.remove('hidden');
                UI.comboUI.style.animation = 'none';
                void UI.comboUI.offsetWidth;
                UI.comboUI.style.animation = 'pop 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            }
        }
        last.combo = data.comboText;
    }
    
    // Overlays
    if (UI.speedOverlay) {
        if (data.isBoosting) UI.speedOverlay.classList.add('active');
        else UI.speedOverlay.classList.remove('active');
    }
    if (UI.collisionOverlay) {
        if (data.isColliding) UI.collisionOverlay.classList.add('active');
        else UI.collisionOverlay.classList.remove('active');
    }

    // Leaderboard
    if (data.racers && UI.leaderboardUI) {
        const racersStr = data.racers.map(r => `${r.name}_${r.score}_${r.isMe}`).join('|');
        if (racersStr !== last.racersStr) {
            let html = '<div style="text-align: center; color: #00ffff; font-weight: bold; margin-bottom: 5px; border-bottom: 1px solid rgba(0,255,255,0.3); padding-bottom: 5px;">RACE RANKING</div>';
            data.racers.forEach((r, idx) => {
                const color = r.isMe ? '#ff4444' : '#aaffaa';
                const fW = r.isMe ? '900' : 'normal';
                const fontSize = r.isMe ? '1.3rem' : '1.1rem';
                html += `<div style="color: ${color}; font-weight: ${fW}; font-size: ${fontSize}; display: flex; justify-content: space-between; gap: 20px;">
                    <span>${idx + 1}. ${r.icon} ${r.name}</span>
                    <span>${r.score}</span>
                </div>`;
            });
            UI.leaderboardUI.innerHTML = html;
            last.racersStr = racersStr;
        }
    }
}

export function showCoinScoreEffect(sx, sy, playerIndex, onComplete) {
    const floatingCoin = document.createElement('div');
    floatingCoin.className = 'floating-coin';
    floatingCoin.style.left = sx + 'px';
    floatingCoin.style.top = sy + 'px';
    document.body.appendChild(floatingCoin);
    
    // Force reflow
    void floatingCoin.offsetWidth;
    
    const u = UIs[playerIndex];
    if (!u) {
        onComplete();
        if (document.body.contains(floatingCoin)) floatingCoin.remove();
        return;
    }
    
    const rx1 = u.scoreUI?.getBoundingClientRect() || { left: 0, top: 0, width: 0, height: 0 };
    const tx = rx1.left + rx1.width/2;
    const ty = rx1.top + rx1.height/2;
    
    floatingCoin.style.transform = `translate(${tx - sx}px, ${ty - sy}px) scale(0.5)`;
    
    setTimeout(() => {
        if (document.body.contains(floatingCoin)) floatingCoin.remove();
        onComplete();
    }, 500);
}

export function flashScore(playerIndex) {
    const u = UIs[playerIndex];
    if (u && u.scoreVal) {
        u.scoreVal.innerText = State.players[playerIndex].score;
        u.scoreVal.classList.remove('score-bounce');
        void u.scoreVal.offsetWidth; 
        u.scoreVal.classList.add('score-bounce');
    }
}

export function updateDebugPanel(text) {
    const debugPanel = document.getElementById('debug-panel');
    if (debugPanel && !debugPanel.classList.contains('hidden')) {
        debugPanel.innerHTML = text;
    }
}

export function updateEnvironmentUI() {
    const weatherIcons = { 'clear': '☀️', 'rain': '🌧️', 'snow': '❄️' };
    const timeStrings = { 'day': '10:00 ', 'sunset': '17:30 ', 'night': '23:00 ' };
    UIs.forEach(u => {
        if (u && u.envVal) {
            const wIcon = weatherIcons[State.currentWeather] || '☁️';
            const tStr = timeStrings[Object.keys(TIMES).find(k => TIMES[k] === State.currentTime)] || '12:00 ';
            u.envVal.innerHTML = `${wIcon} ${tStr}`;
        }
    });
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

export function updateMinimap(playerIndex) {
    if (!State.curve || !State.players[playerIndex]) return;
    const canvas = document.getElementById(`minimap-${playerIndex + 1}`);
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
    
    // Draw Current Player
    const myProgress = State.players[playerIndex].rideProgress % 1.0;
    const bp = State.curve.getPointAt(myProgress);
    const px = (canvas.width / 2) + (bp.x - State.minimapCx) * State.minimapScale;
    const py = (canvas.height / 2) + (bp.z - State.minimapCz) * State.minimapScale;
    
    // Draw Player (Distinctive Ring/Pulse)
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI*2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 12;
    ctx.shadowColor = playerIndex === 0 ? '#00ffff' : '#ff00aa'; 
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.beginPath();
    ctx.arc(px, py, 8 + Math.sin(Date.now() * 0.005) * 2, 0, Math.PI*2);
    ctx.strokeStyle = playerIndex === 0 ? '#00ffff' : '#ff00aa';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw Opponent in Multiplayer Mode
    if (State.multiplayerMode) {
        const oppIndex = playerIndex === 0 ? 1 : 0;
        if (State.players[oppIndex]) {
            const oppProgress = State.players[oppIndex].rideProgress % 1.0;
            const oppBp = State.curve.getPointAt(oppProgress);
            const opx = (canvas.width / 2) + (oppBp.x - State.minimapCx) * State.minimapScale;
            const opy = (canvas.height / 2) + (oppBp.z - State.minimapCz) * State.minimapScale;
            
            ctx.beginPath();
            ctx.arc(opx, opy, 4, 0, Math.PI*2);
            ctx.fillStyle = '#ff0055'; // Red indicator
            ctx.fill();
        }
    }

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

export function showMatchResult(p1Score, p2Score, isMultiplayer) {
    const screen = document.getElementById('match-result-screen');
    const title = document.getElementById('match-winner-title');
    const p1ScoreEl = document.getElementById('match-p1-score');
    const p2ScoreEl = document.getElementById('match-p2-score');
    const p2StatsContainer = document.getElementById('match-p2-stats');
    
    if (!screen) return;
    
    p1ScoreEl.innerText = `Score: ${p1Score}`;
    
    if (isMultiplayer) {
        p2StatsContainer.style.display = 'block';
        p2ScoreEl.innerText = `Score: ${p2Score}`;
        
        if (p1Score > p2Score) {
            title.innerText = "PLAYER 1 WINS!";
            title.style.color = "#00ffff";
            title.style.textShadow = "0 0 20px #00ffff";
        } else if (p2Score > p1Score) {
            title.innerText = "PLAYER 2 WINS!";
            title.style.color = "#ff00aa";
            title.style.textShadow = "0 0 20px #ff00aa";
        } else {
            title.innerText = "DRAW!";
            title.style.color = "#ffffff";
            title.style.textShadow = "0 0 20px #ffffff";
        }
    } else {
        p2StatsContainer.style.display = 'none';
        title.innerText = "RIDE COMPLETE!";
        title.style.color = "#00ffff";
        title.style.textShadow = "0 0 20px #00ffff";
    }
    
    screen.classList.remove('hidden');
}

export function hideMatchResult() {
    const screen = document.getElementById('match-result-screen');
    if (screen) screen.classList.add('hidden');
}
