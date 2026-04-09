import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { initVrHud, showVrHud, hideVrHud, updateVrHud } from './js/vrHud.js';

import { TRACK_SEGMENTS } from './js/config.js';
import { State } from './js/state.js';
import { setupAudio, playCoinSound, playBoostSound, updateEngineAudio, audioCtx } from './js/audio.js';
import { setupInput, setupXRInput } from './js/input.js';
import { initUI, updateHUD, showCoinScoreEffect, flashScore, updateDebugPanel, updateMinimap, showMatchResult, hideMatchResult } from './js/ui.js';
import { buildScene, currentDirLight, createCartModel } from './js/trackGenerator.js';
import ThreeMeshUI from 'three-mesh-ui';
import { create3DMenu, interactiveUIMeshes } from './js/menu3d.js';
// --- Global Renderer Setup ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const playerRig = new THREE.Group();
const playerRig2 = new THREE.Group();
scene.add(playerRig);
scene.add(playerRig2);

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1500);
const camera2 = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1500);
scene.add(camera);
scene.add(camera2);

State.players = [
    { id: 1, lane: -1, currentLaneOffset: 0, currentSpeed: 0, targetSpeed: 0, isBoosting: false, rideProgress: 0, score: 0, rank: 1, vrGForce: 1, coinCombo: 0, comboText: '', collisionFlashUntil: 0 },
    { id: 2, lane: 1,  currentLaneOffset: 0, currentSpeed: 0, targetSpeed: 0, isBoosting: false, rideProgress: 0, score: 0, rank: 1, vrGForce: 1, coinCombo: 0, comboText: '', collisionFlashUntil: 0 }
];

const renderer = new THREE.WebGLRenderer({ antialias: false }); 
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ReinhardToneMapping; 

// --- Enable VR / WebXR ---
renderer.xr.enabled = true;
// 'local-floor' gives correct standing/seated height on Quest 3 & Vive XR Elite
renderer.xr.setReferenceSpaceType('local-floor');

const xrRig = new THREE.Group();
playerRig.add(xrRig);

renderer.xr.addEventListener('sessionstart', () => {
    xrRig.add(camera);
    playerRig.add(cartGroup);
    // local-floor: origin is at floor. Offset down by standing eye-height so
    // the player feels seated in the cart (~1.6 m offset).
    xrRig.position.set(0, -1.6, 0);
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    showVrHud();
    // Try to start BGM (requires user gesture — XR button click qualifies)
    const bgm = document.getElementById('bg-music');
    if (bgm) bgm.play().catch(() => {});
});
renderer.xr.addEventListener('sessionend', () => {
    scene.add(camera);
    camera.add(cartGroup);
    hideVrHud();
    xrRig.position.set(0, 0, 0);
});

// Setup XR Controller Raycaster
const xrController = renderer.xr.getController(0);
xrController.addEventListener('selectstart', () => { xrController.userData.selectPressed = true; });
xrController.addEventListener('selectend', () => { xrController.userData.selectPressed = false; });
scene.add(xrController);

const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -10)]);
const laserLine = new THREE.Line(laserGeo, new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 }));
xrController.add(laserLine);

container.appendChild(renderer.domElement);

const vrBtn = VRButton.createButton(renderer);
if (vrBtn) {
    vrBtn.style.position = 'static';
    vrBtn.style.margin = '0';
    vrBtn.style.width = '100%';
    vrBtn.style.height = '100%';
    vrBtn.style.padding = '0 20px';
    vrBtn.style.borderRadius = '8px';
    vrBtn.style.fontSize = '1.1rem';
    vrBtn.style.textTransform = 'uppercase';
    vrBtn.style.fontWeight = 'bold';
    vrBtn.style.transition = 'all 0.3s ease';
    vrBtn.style.boxShadow = '0 0 15px rgba(0, 238, 255, 0.4)';
    vrBtn.style.border = '2px solid rgba(0, 238, 255, 0.8)';
    vrBtn.style.background = 'rgba(0, 50, 100, 0.6)';
    vrBtn.style.color = '#fff';
    vrBtn.style.cursor = 'pointer';
    
    // Attempt to rename if it says 'ENTER VR'
    if(vrBtn.textContent === 'ENTER VR') vrBtn.textContent = 'ENTER VR RIDE';

    vrBtn.addEventListener('click', () => {
        if (vrBtn.textContent !== 'VR NOT SUPPORTED' && !State.isRiding) {
            window.startGame();
        }
    });
    
    document.getElementById('vr-btn-container').appendChild(vrBtn);
}

// --- Player 1 Cart Model ---
const { cartGroup, wheelsData } = createCartModel(0xdd1111, false, '01');
State.wheelsData.push(...wheelsData);
camera.add(cartGroup);
cartGroup.scale.setScalar(0.675 * 0.8); 
cartGroup.position.set(0, -1.0, -1.0);  

// --- Player 2 Cart Model ---
const p2 = createCartModel(0x1111dd, false, '02');
State.wheelsData.push(...p2.wheelsData);
camera2.add(p2.cartGroup);
p2.cartGroup.scale.setScalar(0.675 * 0.8); 
p2.cartGroup.position.set(0, -1.0, -1.0);  

// --- Menu Cart Showcase (INDEPENDENT renderer, scene, camera) ---
// This completely avoids all main scene conflicts (buildScene clearing, lighting, etc.)
const showcaseCanvas = document.getElementById('cart-showcase');
const showcaseScene = new THREE.Scene();
const showcaseCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
showcaseCamera.position.set(5, 3, 8);
showcaseCamera.lookAt(0, 0, 0);

const showcaseRenderer = new THREE.WebGLRenderer({ canvas: showcaseCanvas, alpha: true, antialias: true });
showcaseRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
showcaseRenderer.toneMapping = THREE.ACESFilmicToneMapping;
showcaseRenderer.toneMappingExposure = 1.5;

// Showcase lighting - completely self-contained
const scLight1 = new THREE.DirectionalLight(0xffffff, 3);
scLight1.position.set(5, 10, 7);
showcaseScene.add(scLight1);
const scLight2 = new THREE.DirectionalLight(0x00ffcc, 2);
scLight2.position.set(-5, 5, -3);
showcaseScene.add(scLight2);
const scAmbient = new THREE.AmbientLight(0x334455, 1.5);
showcaseScene.add(scAmbient);
// Rim light for dramatic effect
const scRim = new THREE.PointLight(0xff00aa, 4, 30);
scRim.position.set(-3, 2, -5);
showcaseScene.add(scRim);

// Create the showcase cart model
const showcaseCart = createCartModel(0x00ffcc, true, '★');
showcaseScene.add(showcaseCart.cartGroup);
    showcaseScene.add(showcaseCart.cartGroup);
    showcaseCart.cartGroup.scale.setScalar(3.0); // 2x larger
    showcaseCart.cartGroup.position.set(0, -1.2, 0); // Moved down

// Remove the number tag sprite from the showcase (it shows "No.★" which looks odd)
showcaseCart.cartGroup.children.forEach(child => {
    if (child.isSprite) child.visible = false;
});

let showcaseActive = true;
const showcaseClock = new THREE.Clock();

function updateShowcase() {
    if (!showcaseActive) return;
    const dt = showcaseClock.getDelta();
    const t = showcaseClock.getElapsedTime();
    
    // Slow turntable rotation (1/5th speed)
    showcaseCart.cartGroup.rotation.y = t * 0.08;
    showcaseCart.cartGroup.rotation.z = Math.sin(t * 1.5) * 0.05;
    showcaseCart.cartGroup.position.y = -1.2 + Math.sin(t * 2) * 0.15;
    
    // Spin wheels
    showcaseCart.wheelsData.forEach(w => w.rotation.x += dt * 8);
    
    // Resize canvas to match its CSS display size
    const rect = showcaseCanvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (showcaseCanvas.width !== w || showcaseCanvas.height !== h) {
        showcaseRenderer.setSize(w, h, false);
        showcaseCamera.aspect = w / h;
        showcaseCamera.updateProjectionMatrix();
    }
    
    showcaseRenderer.render(showcaseScene, showcaseCamera);
}

// 建立 3D 選單實體 (Web 端預覽用)
const webMenu = create3DMenu(showcaseScene);
// 建立 3D 選單實體 (VR 端預覽用，預設置於 VR 遊玩準備空間)
const vrMenu = create3DMenu(scene);
vrMenu.position.set(0, 1.5, -4);

// Setup Web Mouse Raycaster
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-1, -1);
let mouseClick = false;

window.addEventListener('pointermove', (e) => {
    if (!showcaseActive) return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});
window.addEventListener('pointerdown', () => { if(showcaseActive) mouseClick = true; });
window.addEventListener('pointerup', () => { mouseClick = false; });

// --- Initialize Random Player Profile ---
function initPlayerProfile() {
    const names = ["NeonRider", "CyberPunk", "RetroGhost", "SpeedDemon", "VoxelFox", "ByteNinja", "GridWalker"];
    const avatars = ["🦊", "🐷", "🐮", "🐔", "🦄", "🐍", "🦇", "🐙"];
    const nameEl = document.getElementById('profile-name');
    const idEl = document.getElementById('profile-id');
    const scoreEl = document.getElementById('profile-score');
    const avatarEl = document.getElementById('profile-avatar');
    
    if (nameEl) nameEl.innerText = names[Math.floor(Math.random() * names.length)];
    if (idEl) idEl.innerText = "#" + Math.floor(1000 + Math.random() * 9000);
    if (scoreEl) scoreEl.innerText = Math.floor(5000 + Math.random() * 95000);
    if (avatarEl) avatarEl.innerText = avatars[Math.floor(Math.random() * avatars.length)];
}
initPlayerProfile();

// Remove old menuCartObj references - no longer needed
let menuCartObj = null;
function ensureMenuCart() { /* no-op: showcase is independent */ }

// Spotlight (Only P1 needs it for VR compatibility, P2 splitscreen gets it naturally from global lights or we duplicate if too dark. Let's duplicate)
const headLight = new THREE.SpotLight(0xffffff, 20); 
headLight.angle = Math.PI / 6; headLight.penumbra = 0.3; headLight.distance = 350; headLight.castShadow = true;
camera.add(headLight);
const headLightTarget = new THREE.Object3D(); camera.add(headLightTarget); headLightTarget.position.set(0, -4, -15); headLight.target = headLightTarget;

const headLight2 = new THREE.SpotLight(0xffffff, 20); 
headLight2.angle = Math.PI / 6; headLight2.penumbra = 0.3; headLight2.distance = 350; headLight2.castShadow = true;
camera2.add(headLight2);
const headLightTarget2 = new THREE.Object3D(); camera2.add(headLightTarget2); headLightTarget2.position.set(0, -4, -15); headLight2.target = headLightTarget2;

// Speed Lines for P1
const speedLineCount = 200;
const speedLineGeo = new THREE.CylinderGeometry(0.15, 0.02, 60, 4); speedLineGeo.rotateX(Math.PI / 2); 
const speedLineGroup = new THREE.InstancedMesh(speedLineGeo, new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0 }), speedLineCount);
speedLineGroup.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
const tempObj = new THREE.Object3D();
for (let i = 0; i < speedLineCount; i++) {
    const angle = Math.random() * Math.PI * 2; const radius = Math.random() * 15 + 2; const zOff = -(Math.random() * 300 + 50); 
    tempObj.position.set(Math.cos(angle)*radius, Math.sin(angle)*radius, zOff);
    tempObj.scale.set(1, 1, Math.random() * 2.0 + 1.0); tempObj.updateMatrix();
    speedLineGroup.setMatrixAt(i, tempObj.matrix);
}
camera.add(speedLineGroup);
const speedLineGroup2 = speedLineGroup.clone();
camera2.add(speedLineGroup2);

// --- Post-Processing Pipeline ---
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bokehPass = new BokehPass(scene, camera, { focus: 30.0, aperture: 0.0001, maxblur: 0.005, width: window.innerWidth, height: window.innerHeight });
bokehPass.enabled = false; 
composer.addPass(bokehPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.4; bloomPass.strength = 0.4; bloomPass.radius = 0.3;    
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// Attach physics rigs
State.players[0].rig = playerRig;
State.players[0].cam = camera;
State.players[0].slg = speedLineGroup;
State.players[0].hl = headLight;

State.players[1].rig = playerRig2;
State.players[1].cam = camera2;
State.players[1].slg = speedLineGroup2;
State.players[1].hl = headLight2;

// --- User Interface & Input Subsystems ---
window.startGame = function() {
    if (State.isRiding) return;
    State.isRiding = true;
    // Hide the independent showcase renderer
    showcaseActive = false;
    showcaseCanvas.style.display = 'none';
    State.baseSpeed = parseFloat(document.getElementById('speed-select').value) || 0.0007;

    if (audioCtx.state === 'suspended') audioCtx.resume();
    setupAudio(); 

    const bgMusic = document.getElementById('bg-music');
    if (bgMusic && State.audioEnabled && State.bgmEnabled) {
        bgMusic.volume = 0.5;
        bgMusic.play().catch(e => console.log("Audio play failed:", e));
    }

    document.getElementById('start-screen').style.opacity = '0';
    document.getElementById('main-title').style.opacity = '0';
    document.getElementById('player-profile').style.opacity = '0';
    document.getElementById('version-info').style.opacity = '0';
    const audioSettings = document.getElementById('audio-settings');
    if (audioSettings) audioSettings.style.opacity = '0';
    setTimeout(() => {
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('split-huds').classList.remove('hidden');
        
        State.multiplayerMode = document.getElementById('mode-select').value === '2p';
        
        if (State.multiplayerMode && !renderer.xr.isPresenting) {
            document.getElementById('advanced-hud-1').style.width = '50%';
            document.getElementById('advanced-hud-1').style.borderRight = '2px solid #00eeff';
            document.getElementById('advanced-hud-2').style.display = 'block';
            State.players[1].rig.visible = true;
        } else {
            document.getElementById('advanced-hud-1').style.width = '100%';
            document.getElementById('advanced-hud-1').style.borderRight = 'none';
            document.getElementById('advanced-hud-2').style.display = 'none';
            State.players[1].rig.visible = false;
        }
    
        if (audioCtx && audioCtx.state === 'suspended' && State.audioEnabled) audioCtx.resume();
        
        State.players.forEach(p => {
            p.targetSpeed = 0; p.currentSpeed = State.baseSpeed * 1.5; 
            p.rideProgress = 0.0; p.lastProgress = 0.0; p.score = 0; 
            p.coinCombo = 0; p.comboText = ''; p.collisionFlashUntil = 0;
            p.isBoosting = false;
        });
        flashScore();
        
        State.coinsData.forEach(c => { c.active = true; c.coin.visible = true; });
        State.boostRingsData.forEach(r => { r.active = true; r.ring.visible = true; });
        
        document.getElementById('start-btn').disabled = false;
        document.getElementById('menu-btn').style.display = 'block';
    }, 500);
};

initUI({
    onStart: window.startGame,
    onMenu: () => {
        if(!State.isRiding) return;
        State.isRiding = false;
        State.players.forEach(p => p.rideProgress = 0);
        document.getElementById('split-huds').classList.add('hidden');
        document.getElementById('start-screen').classList.remove('hidden');
        document.getElementById('start-screen').style.opacity = '1';
        document.getElementById('main-title').style.opacity = '1';
        document.getElementById('player-profile').style.opacity = '1';
        document.getElementById('version-info').style.opacity = '1';
        const audioSettings = document.getElementById('audio-settings');
        if (audioSettings) audioSettings.style.opacity = '1';
        document.getElementById('menu-btn').style.display = 'none';
        const bUI = document.getElementById('boost-alert'); if(bUI) bUI.classList.add('hidden');
        const bgMusic = document.getElementById('bg-music'); if (bgMusic) { bgMusic.pause(); bgMusic.currentTime = 0; }
    },
    onReturnMenu: () => {
        State.isRiding = false;
        State.players.forEach(p => p.rideProgress = 0);
        document.getElementById('split-huds').classList.add('hidden');
        hideMatchResult();
        document.getElementById('start-screen').classList.remove('hidden');
        document.getElementById('start-screen').style.opacity = '1';
        document.getElementById('main-title').style.opacity = '1';
        document.getElementById('player-profile').style.opacity = '1';
        document.getElementById('version-info').style.opacity = '1';
        const audioSettings = document.getElementById('audio-settings');
        if (audioSettings) audioSettings.style.opacity = '1';
        document.getElementById('menu-btn').style.display = 'none';
        ['boost-alert-1', 'boost-alert-2'].forEach(id => {
            const b = document.getElementById(id); if(b) b.classList.add('hidden');
        });
        const bgMusic = document.getElementById('bg-music'); if (bgMusic) { bgMusic.pause(); bgMusic.currentTime = 0; }
    },
    onToggleAudio: () => {
        State.audioEnabled = !State.audioEnabled;
        const btn = document.getElementById('audio-toggle-btn');
        if (btn) btn.innerText = State.audioEnabled ? '🔊 AUDIO: ON' : '🔇 AUDIO: OFF';
        const bgMusic = document.getElementById('bg-music');
        if (State.audioEnabled) {
            if (State.isRiding && State.bgmEnabled) bgMusic.play().catch(e=>console.log(e));
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        } else { bgMusic.pause(); }
    },
    onToggleBGM: () => {
        State.bgmEnabled = !State.bgmEnabled;
        const btn = document.getElementById('toggle-bgm-btn');
        if (btn) btn.innerText = State.bgmEnabled ? '🎵 BGM: ON' : '🎵 BGM: OFF';
        const bgMusic = document.getElementById('bg-music');
        if (bgMusic) {
            if (State.bgmEnabled && State.isRiding) {
                bgMusic.play().catch(e=>console.log(e));
            } else {
                bgMusic.pause();
            }
        }
    },
    onToggleSFX: () => {
        State.sfxEnabled = !State.sfxEnabled;
        const btn = document.getElementById('toggle-sfx-btn');
        if (btn) btn.innerText = State.sfxEnabled ? '🔊 SFX: ON' : '🔇 SFX: OFF';
        // The engine sound is continuous, so we'll immediately update it on next frame by the logic in updateEngineAudio
    },
    onSettingChange: () => {
        const t = document.getElementById('theme-select').value;
        const tm = document.getElementById('time-select').value;
        const w = document.getElementById('weather-select').value;
        const sSelect = document.getElementById('saved-tracks-select');
        if(sSelect) sSelect.value = ""; 
        buildScene(scene, camera, t, tm, w);
        ensureMenuCart();
    },
    onLoadTrack: (conf) => {
        buildScene(scene, camera, conf.theme, conf.time, conf.weather, conf.seed);
        ensureMenuCart();
    }
});

setupInput();
setupXRInput(renderer, { onStart: window.startGame });

// Initial Build
buildScene(scene, camera, 'underwater', 'day', 'clear');
ensureMenuCart(); // Create menu cart AFTER buildScene so it doesn't get cleared
initVrHud(camera);

// --- Global Animation Logic & Physics ---
const clock = new THREE.Clock();
let _vrGForce = 1.0; // shared across frames so VR HUD can display it

// Pool for animation to save memory
const _velVec = new THREE.Vector3();
const _binormalVec = new THREE.Vector3();
const _camPosVec = new THREE.Vector3();
const _lookPosVec = new THREE.Vector3();
const _normalVec = new THREE.Vector3();

function updateParticles(delta, time) {
    for(const anim of State.animatedObjects) { anim.update(time, delta); }

    if(State.weatherParticles) {
        const pCam = State.players[0].cam || camera;
        if(State.currentWeather === 'rain') {
            State.weatherParticles.position.set(pCam.position.x, pCam.position.y - ((time * 150) % 150), pCam.position.z); 
        } else {
            State.weatherParticles.position.copy(pCam.position); 
            const pos = State.weatherParticles.geometry.attributes.position.array;
            for(let i=0; i<pos.length; i+=3) {
                if(State.currentWeather === 'snow') {
                    pos[i+1] -= delta * 15; 
                    pos[i] += Math.sin(time + i)*0.05; 
                    if(pos[i+1] < -200) pos[i+1] = 200;
                }
            }
            State.weatherParticles.geometry.attributes.position.needsUpdate = true;
        }
    }

    for(let i = State.coinParticlesData.length - 1; i >= 0; i--) {
        const p = State.coinParticlesData[i];
        p.life -= delta * 2.5; 
        p.vel.y -= delta * 50; 
        p.mesh.position.addScaledVector(p.vel, delta);
        p.mesh.rotation.x += delta * 15;
        p.mesh.rotation.y += delta * 15;
        p.mesh.scale.setScalar(Math.max(0, p.life));
        if(p.life <= 0) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            State.coinParticlesData.splice(i, 1);
        }
    }
}

function processRideEvents(p, mapP, lastP, delta) {
    const crossedInterval = (rT) => (lastP <= rT && mapP >= rT) || (lastP > mapP && (rT >= lastP || rT <= mapP));
    let nextCoin = null;

    for (let r of State.boostRingsData) {
        if (r.active && crossedInterval(r.t)) {
            r.active = false; r.ring.visible = false;
            p.currentSpeed += State.baseSpeed * 15.0; 
            playBoostSound(p.id - 1);
        }
    }
    
    for (let c of State.coinsData) {
        if (c.active) {
            if(!nextCoin && c.t > mapP) nextCoin = c;
            if (crossedInterval(c.t)) {
                const laneDist = Math.abs(p.currentLaneOffset - (c.lane * 2.2));
                if (laneDist < 1.5) { 
                    c.active = false; c.coin.visible = false;
                    const pIdx = p.id - 1;
                    const baseW = window.innerWidth;
                    const sx = (!State.multiplayerMode) ? baseW * 0.5 : (pIdx === 0 ? baseW * 0.25 : baseW * 0.75);
                    const sy = window.innerHeight * 0.6;
                    
                    p.coinCombo = (p.coinCombo || 0) + 1;
                    const mult = Math.floor(p.coinCombo / 10) + 1;
                    
                    showCoinScoreEffect(sx, sy, pIdx, () => { 
                        p.score += 100 * mult;
                        p.comboText = p.coinCombo >= 10 ? `COMBO x${p.coinCombo}! *${mult} 倍` : '';
                        flashScore(pIdx); 
                    });
                    playCoinSound(pIdx);
                    
                    const pGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
                    const pMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
                    for(let pk=0; pk<15; pk++) {
                        const pt = new THREE.Mesh(pGeo, pMat);
                        pt.position.copy(c.coin.position);
                        _velVec.set((Math.random()-0.5)*30, Math.random()*25+5, (Math.random()-0.5)*30);
                        scene.add(pt);
                        State.coinParticlesData.push({ mesh: pt, vel: _velVec.clone(), life: 1.0 });
                    }
                }
            }
            c.coin.rotation.z += delta * 6.0; 
        }
    }
    return nextCoin;
}

function updateLightingAndSpeedLines(time, delta) {
    if (State.isRiding && currentDirLight && scene.background) {
        // Average ride progress from P1 for world lighting progression
        const avgP = State.players[0].rideProgress; 
        const dayNight = Math.PI * (avgP / 2.0); 
        const sunH = Math.sin(dayNight);
        currentDirLight.position.set(Math.cos(dayNight) * 300, sunH * 200 - 20, 100);
        if (sunH > 0.3) {
            currentDirLight.color.setHex(0xffffff); scene.backgroundIntensity = 1.0;
        } else if (sunH > 0) {
            currentDirLight.color.setHex(0xff8844); scene.backgroundIntensity = Math.max(0.2, sunH / 0.3);
        } else {
            currentDirLight.color.setHex(0x111133); scene.backgroundIntensity = 0.2;
        }
    }

    State.players.forEach(p => {
        if (p.slg) {
            let slOp = 0;
            if (State.isRiding && (p.isBoosting || p.currentSpeed > State.baseSpeed * 2.5)) {
                slOp = 0.9;
                p.slg.position.z = (time * 1500) % 350; 
            }
            p.slg.material.opacity = THREE.MathUtils.lerp(p.slg.material.opacity, slOp, delta * 8);
        }
    });
}

function updateNPCs(delta, time) {
    if (!State.npcs || !State.curve) return;

    for (let i = 0; i < State.npcs.length; i++) {
        const npc = State.npcs[i];
        
        // 1. AI Logic: Random Lane Switching
        if (time > npc.nextLaneDecisionTime) {
            npc.lane = Math.random() > 0.5 ? 1 : -1;
            npc.nextLaneDecisionTime = time + 2.0 + Math.random() * 5.0; // Next decision in 2-7s
        }

        // 2. Physics & Progress
        npc.currentSpeed = THREE.MathUtils.lerp(npc.currentSpeed, npc.baseSpeed, delta * 2);
        const nTangent = State.curve.getTangentAt(npc.rideProgress % 1.0).normalize();
        const nSlopeImpact = -nTangent.y;
        npc.currentSpeed += nSlopeImpact * State.baseSpeed * 1.66 * delta;
        npc.currentSpeed = Math.max(0.0001, npc.currentSpeed);
        
        npc.rideProgress += npc.currentSpeed * delta * 60;
        const mapP = npc.rideProgress % 1.0;

        // 3. Collision with Players
        State.players.forEach(p => {
            const pDist = Math.abs((p.rideProgress % 1.0) - mapP);
            const shortDist = Math.min(pDist, 1.0 - pDist);
            const distanceThreshold = 0.0016; // Roughly two cart lengths (scaled up)
            if (shortDist < distanceThreshold) {
                const laneDiff = Math.abs(p.currentLaneOffset - (npc.lane * 2.2));
                if (laneDiff < 1.0) {
                    // COLLISION: Player loses speed, NPC gets bumped forward
                    p.currentSpeed *= 0.2;
                    p.targetSpeed = State.baseSpeed * 0.5;
                    p.isBoosting = false;
                    p.coinCombo = 0;
                    p.comboText = '';
                    p.collisionFlashUntil = time + 0.5;
                    npc.currentSpeed += State.baseSpeed * 2.5; 
                    // Slight screen shake for player
                    p.rig.position.y += (Math.random() - 0.5) * 0.1;
                }
            }
        });

        // 4. Update 3D Model
        const rawIndex = mapP * TRACK_SEGMENTS;
        const idx = Math.floor(rawIndex);
        const nextIdx = (idx + 1) % TRACK_SEGMENTS;
        const weight = rawIndex - idx;
        
        const bVec = new THREE.Vector3().lerpVectors(State.frames.binormals[idx], State.frames.binormals[nextIdx], weight).normalize();
        const nVec = new THREE.Vector3().lerpVectors(State.frames.normals[idx], State.frames.normals[nextIdx], weight).normalize();
        const cPos = new THREE.Vector3().lerpVectors(State.curve.getPointAt(idx / TRACK_SEGMENTS), State.curve.getPointAt(nextIdx / TRACK_SEGMENTS), weight);
        const lPos = State.curve.getPointAt((mapP + 0.005) % 1.0);

        cPos.addScaledVector(nVec, 0.25);
        
        const targetOffset = npc.lane * 2.2;
        npc.laneOffset = THREE.MathUtils.lerp(npc.laneOffset, targetOffset, delta * 6);
        cPos.addScaledVector(bVec, npc.laneOffset);
        
        const laneDelta = targetOffset - npc.laneOffset;
        npc.cartGroup.rotation.z = -laneDelta * 0.08;
        npc.cartGroup.rotation.y = -laneDelta * 0.05;

        for (const w of npc.wheelsData) w.rotation.x -= npc.currentSpeed * delta * 1500;

        npc.cartGroup.position.copy(cPos);
        lPos.addScaledVector(nVec, 0.25);
        lPos.addScaledVector(bVec, npc.laneOffset);
        
        npc.cartGroup.up.copy(nVec);
        npc.cartGroup.lookAt(lPos);
    }
}

function updateCameraRig(p, delta, localLook, tangent, slopeImpact) {
    const mappedProgress = p.rideProgress % 1.0;
    const rawIndex = mappedProgress * TRACK_SEGMENTS;
    const i = Math.floor(rawIndex);
    const nextIndex = (i + 1) % TRACK_SEGMENTS;
    const weight = rawIndex - i;
    
    _binormalVec.lerpVectors(State.frames.binormals[i], State.frames.binormals[nextIndex], weight).normalize();
    _camPosVec.lerpVectors(State.curve.getPointAt(i / TRACK_SEGMENTS), State.curve.getPointAt(nextIndex / TRACK_SEGMENTS), weight);
    _lookPosVec.copy(State.curve.getPointAt((mappedProgress + 0.005) % 1.0));
    _normalVec.lerpVectors(State.frames.normals[i], State.frames.normals[nextIndex], weight).normalize();
    
    _camPosVec.addScaledVector(_normalVec, 1.2);
    
    const targetOffset = p.lane * 2.2; 
    p.currentLaneOffset = THREE.MathUtils.lerp(p.currentLaneOffset, targetOffset, delta * 12);
    _camPosVec.addScaledVector(_binormalVec, p.currentLaneOffset); 
    
    const laneDelta = targetOffset - p.currentLaneOffset;
    if (p.cam.children[0]) {
        p.cam.children[0].rotation.z = -laneDelta * 0.08; 
        p.cam.children[0].rotation.y = -laneDelta * 0.05;
    }

    for (const w of State.wheelsData) w.rotation.x -= p.currentSpeed * delta * 1500;
    
    if (renderer.xr.isPresenting && p.id === 1) {
        p.rig.position.copy(_camPosVec);
        _lookPosVec.addScaledVector(_normalVec, 1.2);
        _lookPosVec.addScaledVector(_binormalVec, p.currentLaneOffset * 0.82);
        p.rig.up.copy(_normalVec);
        p.rig.lookAt(_lookPosVec);
    } else {
        p.cam.position.copy(_camPosVec);
        _lookPosVec.addScaledVector(_normalVec, 1.2);
        _lookPosVec.addScaledVector(_binormalVec, p.currentLaneOffset * 0.82);
        p.cam.up.copy(_normalVec);
        p.cam.lookAt(_lookPosVec);
    }
    
    const targetFov = 80 + (p.currentSpeed * 60000);
    p.cam.fov = THREE.MathUtils.lerp(p.cam.fov, Math.min(130, targetFov), delta * 4);
    p.cam.updateProjectionMatrix();

    localLook.copy(p.cam.worldToLocal(_lookPosVec.clone()));

    const gForceRaw = 1.0 + (slopeImpact * 2.0) + ((p.targetSpeed - p.currentSpeed) * 500);
    p.vrGForce = Math.max(0, gForceRaw);
}

function updateHUDAndTelemetry(p, tangent, localLook, nextCoin, playerIndex, time) {
    const isWarning = (p.vrGForce > 2.5 || p.vrGForce < 0.2);
    
    // Build Leaderboard racers array
    const racers = [];
    State.players.forEach(pl => racers.push({ isMe: pl.id === p.id, name: `P${pl.id}`, score: pl.score, progress: pl.rideProgress, icon: '🏎️' }));
    State.npcs.forEach((n, idx) => racers.push({ isMe: false, name: `NPC${idx+1}`, score: Math.floor(n.rideProgress * 50), progress: n.rideProgress, icon: '🚗' }));
    racers.sort((a, b) => b.progress - a.progress);

    updateHUD({
        displaySpeed: Math.floor(p.currentSpeed * 100000),
        accelRatio: Math.min(100, (p.currentSpeed / (State.baseSpeed * 4)) * 100),
        displayAlt: Math.floor(_camPosVec.y + 100),
        deg: Math.floor((Math.atan2(tangent.x, tangent.z) * 180 / Math.PI + 180)),
        gForce: p.vrGForce,
        pitchDeg: Math.asin(Math.max(-1, Math.min(1, tangent.y))) * 180 / Math.PI,
        isTurnLeft: localLook.x < -0.15,
        isTurnRight: localLook.x > 0.15,
        isWarning: isWarning,
        rank: p.rank || 1,
        isBoosting: p.isBoosting,
        isColliding: time < (p.collisionFlashUntil || 0),
        comboText: p.comboText || '',
        racers: racers
    }, playerIndex);

    updateMinimap(playerIndex);

    if (State.isDebug && playerIndex === 0) {
        const activeCoins = State.coinsData.filter(c => c.active).length;
        updateDebugPanel(`
=== TELEMETRY ===<br>
RIDE_T: ${(p.rideProgress % 1.0).toFixed(5)}<br>
LANE_IDX: ${p.lane}<br>
LANE_OFFSET: ${p.currentLaneOffset.toFixed(2)}<br>
SPD: ${(p.currentSpeed * 60).toFixed(3)}<br>
COINS_ALIVE: ${activeCoins}<br>
=================<br>
-- NEXT COIN --<br>
C_TIME: ${nextCoin ? nextCoin.t.toFixed(4) : 'N/A'}<br>
C_LANE: ${nextCoin ? nextCoin.lane : 'N/A'} (Offset: ${nextCoin ? (nextCoin.lane * 2.2).toFixed(2) : 'N/A'})<br>
HITBOX_DIST: <span style="color:${(nextCoin && Math.abs(p.currentLaneOffset - (nextCoin.lane * 2.2)) < 1.5) ? '#0f0' : '#f00'}">${nextCoin ? Math.abs(p.currentLaneOffset - (nextCoin.lane * 2.2)).toFixed(3) : 'N/A'}</span>
        `);
    }
}

function checkRideEnd() {
    let allFinished = true;
    const activePlayers = (State.multiplayerMode && !renderer.xr.isPresenting) ? State.players : [State.players[0]];
    activePlayers.forEach(p => { if (p.rideProgress < 2) allFinished = false; });
    
    if (allFinished && State.isRiding) {
        State.isRiding = false; 
        const p1Score = State.players[0].score;
        let p2Score = 0;
        if (State.multiplayerMode && !renderer.xr.isPresenting) p2Score = State.players[1].score;
        showMatchResult(p1Score, p2Score, State.multiplayerMode && !renderer.xr.isPresenting);
    }
}


function animate() {
    ThreeMeshUI.update();
    const delta = Math.min(0.05, clock.getDelta());
    const time = clock.getElapsedTime();

    // 處理 3D UI 射線互動 (UI Raycasting)
    let currentIntersects = [];
    if (showcaseActive && interactiveUIMeshes.length > 0) {
        // Web 模式: 使用滑鼠射線
        raycaster.setFromCamera(mouse, showcaseCamera);
        currentIntersects = raycaster.intersectObjects(interactiveUIMeshes, true);
        
        interactiveUIMeshes.forEach(obj => { if(obj.onIdle) obj.onIdle(); });
        if (currentIntersects.length > 0) {
            let hitTarget = currentIntersects[0].object;
            while(hitTarget && !hitTarget.onHover && hitTarget.parent) hitTarget = hitTarget.parent;
            
            if (hitTarget && hitTarget.onHover) {
                if (mouseClick) {
                    if (hitTarget.onClick) hitTarget.onClick();
                    mouseClick = false; // 單次點擊防抖
                } else {
                    hitTarget.onHover();
                }
            }
        }
    } else if (renderer.xr.isPresenting && interactiveUIMeshes.length > 0 && !State.isRiding) {
        // VR 模式: 使用手把雷射射線
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(xrController.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(xrController.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
        
        currentIntersects = raycaster.intersectObjects(interactiveUIMeshes, true);
        interactiveUIMeshes.forEach(obj => { if(obj.onIdle) obj.onIdle(); });
        
        if (currentIntersects.length > 0) {
            let hitTarget = currentIntersects[0].object;
            while(hitTarget && !hitTarget.onHover && hitTarget.parent) hitTarget = hitTarget.parent;
            
            if (hitTarget && hitTarget.onHover) {
                if (xrController.userData.selectPressed) {
                    if (hitTarget.onClick) hitTarget.onClick();
                    xrController.userData.selectPressed = false; 
                } else {
                    hitTarget.onHover();
                }
            }
        }
    }

    updateParticles(delta, time);

    if (State.isRiding) {
        vrMenu.visible = false; // 掛載在 scene 上的選單在騎乘時需隱藏
        if (menuCartObj) menuCartObj.cartGroup.visible = false;
        
        const activePlayers = (State.multiplayerMode && !renderer.xr.isPresenting) ? State.players : [State.players[0]];
        
        activePlayers.forEach((p, idx) => {
            p.lastProgress = p.rideProgress;
            const bUI = document.getElementById('boost-alert-' + (idx+1));
            
            if (p.isBoosting) {
                p.targetSpeed = State.baseSpeed * 3.5;
                if(bUI) bUI.classList.remove('hidden');
                p.hl.intensity = 60; 
                p.hl.color.setHex(State.currentTheme.accent[1] || 0xffffff);
            } else {
                p.targetSpeed = State.baseSpeed;
                if(bUI) bUI.classList.add('hidden');
                p.hl.intensity = State.currentTheme.type === 'sky' ? 0 : 25; 
                p.hl.color.setHex(0xffffff);
            }

            p.currentSpeed = THREE.MathUtils.lerp(p.currentSpeed, p.targetSpeed, delta * 3);
            const tangent = State.curve.getTangentAt(p.rideProgress % 1.0).normalize();
            
            const slopeImpact = -tangent.y; 
            p.currentSpeed += slopeImpact * State.baseSpeed * 1.66 * delta; 
            p.currentSpeed = Math.max(0.0001, Math.min(p.currentSpeed, State.baseSpeed * 6.5));
            
            p.rideProgress += p.currentSpeed * delta * 60; 

            const mapP = p.rideProgress % 1.0;
            const lastP = p.lastProgress % 1.0;
            
            const nextCoin = processRideEvents(p, mapP, lastP, delta);
            
            const localLook = new THREE.Vector3();
            updateCameraRig(p, delta, localLook, tangent, slopeImpact);
            
            let currentRank = 1;
            if (State.npcs) {
                State.npcs.forEach(npc => {
                    if (npc.rideProgress % 1.0 > p.rideProgress % 1.0) currentRank++;
                });
            }
            State.players.forEach(op => {
                if (op.id !== p.id && op.rideProgress % 1.0 > p.rideProgress % 1.0) currentRank++;
            });
            p.rank = currentRank;

            updateHUDAndTelemetry(p, tangent, localLook, nextCoin, idx, time);
        });

        updateNPCs(delta, time);
        updateLightingAndSpeedLines(time, delta);
        checkRideEnd();
        updateEngineAudio(State.players[0].currentSpeed, State.multiplayerMode && !renderer.xr.isPresenting ? State.players[1].currentSpeed : 0);
    } else {
         // Update the independent showcase renderer (separate canvas)
         showcaseActive = true;
         showcaseCanvas.style.display = 'block';
         updateShowcase();

     if (renderer.xr.isPresenting) {
            vrMenu.visible = true; // 在 VR 準備畫面顯示 3D 選單
            State.players[0].rig.position.set(Math.sin(time * 0.2)*120, 50, Math.cos(time * 0.2)*120);
            State.players[0].rig.lookAt(0, 0, 0);
        } else {
            State.players[0].cam.position.set(Math.sin(time * 0.2)*120, 50, Math.cos(time * 0.2)*120);
            State.players[0].cam.lookAt(0, 0, 0);
        }
        updateLightingAndSpeedLines(time, delta);
    }
    
    if (renderer.xr.isPresenting) {
        updateVrHud({
            speed:     Math.floor(State.players[0].currentSpeed * 100000),
            score:     State.players[0].score,
            gForce:    State.players[0].vrGForce,
            isBoosting: State.players[0].isBoosting,
            rank:      State.players[0].rank || 1
        });
        renderer.render(scene, camera);
    } else {
        if(State.isRiding && State.multiplayerMode) {
            renderer.autoClear = false;
            renderer.clear();
            renderer.setScissorTest(true);
            const w = window.innerWidth, h = window.innerHeight;

            renderer.setViewport(0, 0, w/2, h);
            renderer.setScissor(0, 0, w/2, h);
            State.players[0].cam.aspect = (w/2) / h; 
            State.players[0].cam.updateProjectionMatrix();
            renderer.render(scene, State.players[0].cam);

            renderer.setViewport(w/2, 0, w/2, h);
            renderer.setScissor(w/2, 0, w/2, h);
            State.players[1].cam.aspect = (w/2) / h; 
            State.players[1].cam.updateProjectionMatrix();
            renderer.render(scene, State.players[1].cam);
            
            renderer.setScissorTest(false);
        } else {
            renderer.autoClear = true;
            renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
            State.players[0].cam.aspect = window.innerWidth / window.innerHeight;
            State.players[0].cam.updateProjectionMatrix();
            composer.render();
        }
    }
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(animate);
