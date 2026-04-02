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
import { initUI, updateHUD, showCoinScoreEffect, flashScore, updateDebugPanel, updateMinimap } from './js/ui.js';
import { buildScene, currentDirLight, createCartModel } from './js/trackGenerator.js';

// --- Global Renderer Setup ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const playerRig = new THREE.Group();
scene.add(playerRig);
const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1500);
scene.add(camera);

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

container.appendChild(renderer.domElement);
document.body.appendChild( VRButton.createButton( renderer ) );

// --- Player Cart Model ---
const { cartGroup, wheelsData } = createCartModel(0xdd1111);
State.wheelsData.push(...wheelsData);
camera.add(cartGroup);
cartGroup.scale.setScalar(0.675 * 0.8); 
cartGroup.position.set(0, -0.65, -1.0);  

// Spotlight
const headLight = new THREE.SpotLight(0xffffff, 20); 
headLight.angle = Math.PI / 6; headLight.penumbra = 0.3; headLight.distance = 350; headLight.castShadow = true;
camera.add(headLight);
const headLightTarget = new THREE.Object3D(); camera.add(headLightTarget); headLightTarget.position.set(0, -4, -15); headLight.target = headLightTarget;

// Speed Lines
const speedLineCount = 150;
const speedLineGeo = new THREE.CylinderGeometry(0.04, 0.04, 30, 4); speedLineGeo.rotateX(Math.PI / 2); 
const speedLineGroup = new THREE.InstancedMesh(speedLineGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }), speedLineCount);
speedLineGroup.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
const tempObj = new THREE.Object3D();
for (let i = 0; i < speedLineCount; i++) {
    const angle = Math.random() * Math.PI * 2; const radius = Math.random() * 20 + 3; const zOff = -(Math.random() * 250 + 50); // spawn far in front (-300 to -50)
    tempObj.position.set(Math.cos(angle)*radius, Math.sin(angle)*radius, zOff);
    tempObj.scale.set(1, 1, Math.random() * 1.5 + 0.5); tempObj.updateMatrix();
    speedLineGroup.setMatrixAt(i, tempObj.matrix);
}
camera.add(speedLineGroup);

// --- Post-Processing Pipeline ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bokehPass = new BokehPass(scene, camera, { focus: 30.0, aperture: 0.0001, maxblur: 0.005, width: window.innerWidth, height: window.innerHeight });
bokehPass.enabled = false; 
composer.addPass(bokehPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.4; bloomPass.strength = 0.4; bloomPass.radius = 0.3;    
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// --- User Interface & Input Subsystems ---
window.startGame = function() {
    if (State.isRiding) return;
    State.isRiding = true;
    
    State.baseSpeed = parseFloat(document.getElementById('speed-select').value) || 0.0007;

    if (audioCtx.state === 'suspended') audioCtx.resume();
    setupAudio(); 

    const bgMusic = document.getElementById('bg-music');
    if (bgMusic) {
        bgMusic.volume = 0.5;
        bgMusic.play().catch(e => console.log("Audio play failed:", e));
    }

    document.getElementById('start-screen').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('advanced-hud').classList.remove('hidden');
    
        if (audioCtx && audioCtx.state === 'suspended' && State.audioEnabled) audioCtx.resume();
        
        State.targetSpeed = 0; State.currentSpeed = State.baseSpeed * 1.5; 
        State.rideProgress = 0.0; State.lastProgress = 0.0; State.score = 0; 
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
        State.rideProgress = 0;
        document.getElementById('advanced-hud').classList.add('hidden');
        document.getElementById('start-screen').classList.remove('hidden');
        document.getElementById('start-screen').style.opacity = '1';
        document.getElementById('menu-btn').style.display = 'none';
        const bUI = document.getElementById('boost-alert'); if(bUI) bUI.classList.add('hidden');
        const bgMusic = document.getElementById('bg-music'); if (bgMusic) { bgMusic.pause(); bgMusic.currentTime = 0; }
    },
    onToggleAudio: () => {
        State.audioEnabled = !State.audioEnabled;
        const btn = document.getElementById('audio-toggle-btn');
        btn.innerText = State.audioEnabled ? '🔊 AUDIO: ON' : '🔇 AUDIO: OFF';
        const bgMusic = document.getElementById('bg-music');
        if (State.audioEnabled) {
            if (State.isRiding) bgMusic.play().catch(e=>console.log(e));
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        } else { bgMusic.pause(); }
    },
    onSettingChange: () => {
        const t = document.getElementById('theme-select').value;
        const tm = document.getElementById('time-select').value;
        const w = document.getElementById('weather-select').value;
        const sSelect = document.getElementById('saved-tracks-select');
        if(sSelect) sSelect.value = ""; 
        buildScene(scene, camera, t, tm, w);
    },
    onLoadTrack: (conf) => {
        buildScene(scene, camera, conf.theme, conf.time, conf.weather, conf.seed);
    }
});

setupInput();
setupXRInput(renderer, { onStart: window.startGame });

// Initial Build
buildScene(scene, camera, 'underwater', 'day', 'clear');
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
        if(State.currentWeather === 'rain') {
            State.weatherParticles.position.set(camera.position.x, camera.position.y - ((time * 150) % 150), camera.position.z); 
        } else {
            State.weatherParticles.position.copy(camera.position); 
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

function processRideEvents(mapP, lastP, delta) {
    const crossedInterval = (rT) => (lastP <= rT && mapP >= rT) || (lastP > mapP && (rT >= lastP || rT <= mapP));
    let nextCoin = null;

    for (let r of State.boostRingsData) {
        if (r.active && crossedInterval(r.t)) {
            r.active = false; r.ring.visible = false;
            State.currentSpeed += State.baseSpeed * 15.0; 
            playBoostSound();
        }
    }
    
    for (let c of State.coinsData) {
        if (c.active) {
            if(!nextCoin && c.t > mapP) nextCoin = c;
            if (crossedInterval(c.t)) {
                const laneDist = Math.abs(State.currentLaneOffset - (c.lane * 2.2));
                if (laneDist < 1.5) { 
                    c.active = false; c.coin.visible = false;
                    const sx = window.innerWidth * 0.5; const sy = window.innerHeight * 0.6;
                    showCoinScoreEffect(sx, sy, c.lane, () => { State.score += 100; flashScore(); });
                    playCoinSound();
                    
                    const pGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
                    const pMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
                    for(let pk=0; pk<15; pk++) {
                        const p = new THREE.Mesh(pGeo, pMat);
                        p.position.copy(c.coin.position);
                        _velVec.set((Math.random()-0.5)*30, Math.random()*25+5, (Math.random()-0.5)*30);
                        scene.add(p);
                        State.coinParticlesData.push({ mesh: p, vel: _velVec.clone(), life: 1.0 });
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
        // ONLY override lighting when riding (dynamically progress Day -> Sunset -> Night)
        // Otherwise, leave the environment as set by the initial dropdown configuration!
        const dayNight = Math.PI * (State.rideProgress / 2.0); 
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

    if (speedLineGroup) {
        let speedLineOpacity = 0;
        if (State.isRiding && (State.isBoosting || State.currentSpeed > State.baseSpeed * 2.5)) {
            speedLineOpacity = 0.8;
            speedLineGroup.position.z = (time * 800) % 300; // loop through the local Z-space simulating rushing towards us
        }
        speedLineGroup.material.opacity = THREE.MathUtils.lerp(speedLineGroup.material.opacity, speedLineOpacity, delta * 8);
    }
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

        // 3. Collision with Player
        const pDist = Math.abs((State.rideProgress % 1.0) - mapP);
        const shortDist = Math.min(pDist, 1.0 - pDist);
        const distanceThreshold = 0.0016; // Roughly two cart lengths (scaled up)
        if (shortDist < distanceThreshold) {
            const laneDiff = Math.abs(State.currentLaneOffset - (npc.lane * 2.2));
            if (laneDiff < 1.0) {
                // COLLISION: Player loses speed, NPC gets bumped forward
                State.currentSpeed *= 0.85; 
                npc.currentSpeed += State.baseSpeed * 2.5; 
                // Slight screen shake for player
                if (camera.parent) camera.parent.position.y += (Math.random() - 0.5) * 0.1;
                else camera.position.y += (Math.random() - 0.5) * 0.1;
            }
        }

        // 4. Update 3D Model
        const rawIndex = mapP * TRACK_SEGMENTS;
        const idx = Math.floor(rawIndex);
        const nextIdx = (idx + 1) % TRACK_SEGMENTS;
        const weight = rawIndex - idx;
        
        const bVec = new THREE.Vector3().lerpVectors(State.frames.binormals[idx], State.frames.binormals[nextIdx], weight).normalize();
        const nVec = new THREE.Vector3().lerpVectors(State.frames.normals[idx], State.frames.normals[nextIdx], weight).normalize();
        const cPos = new THREE.Vector3().lerpVectors(State.curve.getPointAt(idx / TRACK_SEGMENTS), State.curve.getPointAt(nextIdx / TRACK_SEGMENTS), weight);
        const lPos = State.curve.getPointAt((mapP + 0.005) % 1.0);

        cPos.addScaledVector(nVec, 1.2);
        
        const targetOffset = npc.lane * 2.2;
        npc.laneOffset = THREE.MathUtils.lerp(npc.laneOffset, targetOffset, delta * 6);
        cPos.addScaledVector(bVec, npc.laneOffset);
        
        const laneDelta = targetOffset - npc.laneOffset;
        npc.cartGroup.rotation.z = -laneDelta * 0.08;
        npc.cartGroup.rotation.y = -laneDelta * 0.05;

        for (const w of npc.wheelsData) w.rotation.x -= npc.currentSpeed * delta * 1500;

        npc.cartGroup.position.copy(cPos);
        lPos.addScaledVector(nVec, 1.2);
        lPos.addScaledVector(bVec, npc.laneOffset);
        
        npc.cartGroup.up.copy(nVec);
        npc.cartGroup.lookAt(lPos);
    }
}

function updateCameraRig(delta, localLook, tangent, slopeImpact) {
    const mappedProgress = State.rideProgress % 1.0;
    const rawIndex = mappedProgress * TRACK_SEGMENTS;
    const i = Math.floor(rawIndex);
    const nextIndex = (i + 1) % TRACK_SEGMENTS;
    const weight = rawIndex - i;
    
    _binormalVec.lerpVectors(State.frames.binormals[i], State.frames.binormals[nextIndex], weight).normalize();
    _camPosVec.lerpVectors(State.curve.getPointAt(i / TRACK_SEGMENTS), State.curve.getPointAt(nextIndex / TRACK_SEGMENTS), weight);
    _lookPosVec.copy(State.curve.getPointAt((mappedProgress + 0.005) % 1.0));
    _normalVec.lerpVectors(State.frames.normals[i], State.frames.normals[nextIndex], weight).normalize();
    
    _camPosVec.addScaledVector(_normalVec, 1.2);
    
    const targetOffset = State.playerLane * 2.2; 
    State.currentLaneOffset = THREE.MathUtils.lerp(State.currentLaneOffset, targetOffset, delta * 12);
    _camPosVec.addScaledVector(_binormalVec, State.currentLaneOffset); 
    
    const laneDelta = targetOffset - State.currentLaneOffset;
    cartGroup.rotation.z = -laneDelta * 0.08; 
    cartGroup.rotation.y = -laneDelta * 0.05;

    for (const w of State.wheelsData) w.rotation.x -= State.currentSpeed * delta * 1500;
    
    if (renderer.xr.isPresenting) {
        playerRig.position.copy(_camPosVec);
        _lookPosVec.addScaledVector(_normalVec, 1.2);
        _lookPosVec.addScaledVector(_binormalVec, State.currentLaneOffset * 0.82);
        playerRig.up.copy(_normalVec);
        playerRig.lookAt(_lookPosVec);
    } else {
        camera.position.copy(_camPosVec);
        _lookPosVec.addScaledVector(_normalVec, 1.2);
        _lookPosVec.addScaledVector(_binormalVec, State.currentLaneOffset * 0.82);
        camera.up.copy(_normalVec);
        camera.lookAt(_lookPosVec);
    }
    
    const targetFov = 80 + (State.currentSpeed * 60000);
    camera.fov = THREE.MathUtils.lerp(camera.fov, Math.min(130, targetFov), delta * 4);
    camera.updateProjectionMatrix();

    updateEngineAudio(State.currentSpeed);
    
    localLook.copy(camera.worldToLocal(_lookPosVec.clone()));

    const gForceRaw = 1.0 + (slopeImpact * 2.0) + ((State.targetSpeed - State.currentSpeed) * 500);
    _vrGForce = Math.max(0, gForceRaw);
}

function updateHUDAndTelemetry(tangent, localLook, nextCoin) {
    const isWarning = (_vrGForce > 2.5 || _vrGForce < 0.2);
    updateHUD({
        displaySpeed: Math.floor(State.currentSpeed * 100000),
        accelRatio: Math.min(100, (State.currentSpeed / (State.baseSpeed * 4)) * 100),
        displayAlt: Math.floor(_camPosVec.y + 100),
        deg: Math.floor((Math.atan2(tangent.x, tangent.z) * 180 / Math.PI + 180)),
        gForce: _vrGForce,
        pitchDeg: Math.asin(Math.max(-1, Math.min(1, tangent.y))) * 180 / Math.PI,
        isTurnLeft: localLook.x < -0.15,
        isTurnRight: localLook.x > 0.15,
        isWarning: isWarning
    });

    updateMinimap(State.rideProgress % 1.0);

    if (State.isDebug) {
        const activeCoins = State.coinsData.filter(c => c.active).length;
        updateDebugPanel(`
=== TELEMETRY ===<br>
RIDE_T: ${(State.rideProgress % 1.0).toFixed(5)}<br>
LANE_IDX: ${State.playerLane}<br>
LANE_OFFSET: ${State.currentLaneOffset.toFixed(2)}<br>
SPD: ${(State.currentSpeed * 60).toFixed(3)}<br>
COINS_ALIVE: ${activeCoins}<br>
=================<br>
-- NEXT COIN --<br>
C_TIME: ${nextCoin ? nextCoin.t.toFixed(4) : 'N/A'}<br>
C_LANE: ${nextCoin ? nextCoin.lane : 'N/A'} (Offset: ${nextCoin ? (nextCoin.lane * 2.2).toFixed(2) : 'N/A'})<br>
HITBOX_DIST: <span style="color:${(nextCoin && Math.abs(State.currentLaneOffset - (nextCoin.lane * 2.2)) < 1.5) ? '#0f0' : '#f00'}">${nextCoin ? Math.abs(State.currentLaneOffset - (nextCoin.lane * 2.2)).toFixed(3) : 'N/A'}</span>
        `);
    }
}

function checkRideEnd() {
    if (State.rideProgress >= 2) {
        State.isRiding = false; State.rideProgress = 0;
        document.getElementById('advanced-hud').classList.add('hidden');
        document.getElementById('start-screen').classList.remove('hidden');
        setTimeout(() => { document.getElementById('start-screen').style.opacity = '1'; }, 50);
        const menuB = document.getElementById('menu-btn'); if (menuB) menuB.style.display = 'none';
        const bgMusic = document.getElementById('bg-music'); if (bgMusic) { bgMusic.pause(); bgMusic.currentTime = 0; }
    }
}

function animate() {
    const delta = Math.min(0.05, clock.getDelta());
    const time = clock.getElapsedTime();

    updateParticles(delta, time);

    if (State.isRiding) {
        State.lastProgress = State.rideProgress;
        const bUI = document.getElementById('boost-alert');
        
        if (State.isBoosting) {
            State.targetSpeed = State.baseSpeed * 3.5;
            bUI.classList.remove('hidden');
            headLight.intensity = 60; 
            headLight.color.setHex(State.currentTheme.accent[1] || 0xffffff);
        } else {
            State.targetSpeed = State.baseSpeed;
            bUI.classList.add('hidden');
            headLight.intensity = State.currentTheme.type === 'sky' ? 0 : 25; 
            headLight.color.setHex(0xffffff);
        }

        State.currentSpeed = THREE.MathUtils.lerp(State.currentSpeed, State.targetSpeed, delta * 3);
        const tangent = State.curve.getTangentAt(State.rideProgress).normalize();
        
        const slopeImpact = -tangent.y; 
        State.currentSpeed += slopeImpact * State.baseSpeed * 1.66 * delta; 
        State.currentSpeed = Math.max(0.0001, Math.min(State.currentSpeed, State.baseSpeed * 6.5));
        
        State.rideProgress += State.currentSpeed * delta * 60; 

        const mapP = State.rideProgress % 1.0;
        const lastP = State.lastProgress % 1.0;
        
        const nextCoin = processRideEvents(mapP, lastP, delta);
        
        const localLook = new THREE.Vector3();
        updateCameraRig(delta, localLook, tangent, slopeImpact);
        updateNPCs(delta, time);
        updateLightingAndSpeedLines(time, delta);
        updateHUDAndTelemetry(tangent, localLook, nextCoin);
        
        checkRideEnd();
    } else {
        if (renderer.xr.isPresenting) {
            playerRig.position.set(Math.sin(time * 0.2)*120, 50, Math.cos(time * 0.2)*120);
            playerRig.lookAt(0, 0, 0);
        } else {
            camera.position.set(Math.sin(time * 0.2)*120, 50, Math.cos(time * 0.2)*120);
            camera.lookAt(0, 0, 0);
        }
        updateLightingAndSpeedLines(time, delta);
    }
    
    if (renderer.xr.isPresenting) {
        updateVrHud({
            speed:     Math.floor(State.currentSpeed * 100000),
            score:     State.score,
            gForce:    _vrGForce,
            isBoosting: State.isBoosting,
        });
        renderer.render(scene, camera);
    } else {
        composer.render();
    }
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(animate);
