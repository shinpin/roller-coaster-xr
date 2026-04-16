import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { initVrHud, showVrHud, hideVrHud, updateVrHud } from './js/vrHud.js';

import { TRACK_SEGMENTS } from './js/config.js';
import { State } from './js/state.js';
import { setupAudio, playCoinSound, playBoostSound, updateEngineAudio, updateUphillAudio, audioCtx } from './js/audio.js';
import { setupInput, setupXRInput } from './js/input.js';
import { initUI, updateHUD, showCoinScoreEffect, flashScore, updateDebugPanel, updateMinimap, showMatchResult, hideMatchResult } from './js/ui.js';
import { buildScene, currentDirLight, createCartModel } from './js/trackGenerator.js';
import ThreeMeshUI from 'three-mesh-ui';
import { create3DMenu, interactiveUIMeshes } from './js/menu3d.js';

// --- GLB Cart Loader (P1 & P2) ---
const _gltfLoader = new GLTFLoader();
/**
 * Loads a .glb file and returns { cartGroup, wheelsData }.
 * Falls back to createCartModel() if loading fails.
 */
function loadGlbCart(url, fallbackColor, fallbackNum) {
    return new Promise((resolve) => {
        _gltfLoader.load(
            url,
            (gltf) => {
                const cartGroup = gltf.scene;
                // Enable shadows on all meshes inside the GLB
                cartGroup.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                // GLB models don't expose individual wheels — return empty array
                resolve({ cartGroup, wheelsData: [] });
            },
            undefined,
            (err) => {
                console.warn('GLB load failed, using procedural cart:', url, err);
                resolve(createCartModel(fallbackColor, false, fallbackNum));
            }
        );
    });
}
// --- Global Renderer Setup ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const playerRig = new THREE.Group(); playerRig.userData.isCore = true;
const playerRig2 = new THREE.Group(); playerRig2.userData.isCore = true;
scene.add(playerRig);
scene.add(playerRig2);

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1500); camera.userData.isCore = true;
const camera2 = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1500); camera2.userData.isCore = true;
scene.add(camera);
scene.add(camera2);

// --- Camera Layer Configuration ---
// Layer 0: Global Environment (track, trees)
// Layer 1/2: P1/P2 Avatar cars (hidden from self, visible to other)
// Layer 3/4: P1/P2 HUD and FX (visible to self, hidden from other)
camera.layers.enable(0);
camera.layers.disable(1); camera.layers.enable(2);
camera.layers.enable(3); camera.layers.disable(4);

camera2.layers.enable(0);
camera2.layers.enable(1); camera2.layers.disable(2);
camera2.layers.disable(3); camera2.layers.enable(4);

State.players = [
    { id: 1, lane: -1, currentLaneOffset: 0, currentSpeed: 0, targetSpeed: 0, isBoosting: false, rideProgress: 0, score: 0, rank: 1, vrGForce: 1, coinCombo: 0, comboText: '', collisionFlashUntil: 0 },
    { id: 2, lane: 1,  currentLaneOffset: 0, currentSpeed: 0, targetSpeed: 0, isBoosting: false, rideProgress: 0, score: 0, rank: 1, vrGForce: 1, coinCombo: 0, comboText: '', collisionFlashUntil: 0 }
];

const renderer = new THREE.WebGLRenderer({ antialias: true }); 
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; 
renderer.toneMappingExposure = 1.2;

// --- Enable VR / WebXR ---
renderer.xr.enabled = true;
// 'local-floor' gives correct standing/seated height on Quest 3 & Vive XR Elite
renderer.xr.setReferenceSpaceType('local-floor');

const xrRig = new THREE.Group();
playerRig.add(xrRig);

renderer.xr.addEventListener('sessionstart', () => {
    xrRig.add(camera);
    playerRig.add(cartGroup); // cartGroup may be GLB or procedural at this point
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
    camera.add(cartGroup); // re-attach current cartGroup back to camera
    hideVrHud();
    xrRig.position.set(0, 0, 0);
});

// Setup XR Controller Raycaster
const xrController = renderer.xr.getController(0);
xrController.userData.isCore = true;
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

// --- Player 1 Cart Model (Lego_car01.glb) ---
// Placeholder group attached immediately; replaced by GLB once loaded
let cartGroup = new THREE.Group();
let wheelsData = [];
camera.add(cartGroup);
cartGroup.scale.setScalar(0.35);
cartGroup.position.set(0, -1.0, -1.0);

// --- Player 2 Cart Model (Lego_car0101.glb) ---
let p2CartGroup = new THREE.Group();
let p2WheelsData = [];
camera2.add(p2CartGroup);
p2CartGroup.scale.setScalar(0.20);
p2CartGroup.position.set(0, -1.0, -1.0);

// Async GLB load — swap placeholder once ready
loadGlbCart('assets/models/Lego_car01.glb', 0xdd1111, '01').then(({ cartGroup: g1, wheelsData: w1 }) => {
    camera.remove(cartGroup); // remove placeholder
    cartGroup = g1;
    wheelsData = w1;
    State.wheelsData = State.wheelsData.filter(w => !w.__p1); // remove old placeholder wheels
    State.wheelsData.push(...wheelsData);
    camera.add(cartGroup);
    cartGroup.scale.setScalar(0.35);
    cartGroup.position.set(0, -1.0, -1.0);
    // Update rig reference so VR sessionstart can use it
    if (playerRig) playerRig.userData.cartGroup = cartGroup;
});

loadGlbCart('assets/models/Lego_car0101.glb', 0x1111dd, '02').then(({ cartGroup: g2, wheelsData: w2 }) => {
    camera2.remove(p2CartGroup);
    p2CartGroup = g2;
    p2WheelsData = w2;
    camera2.add(p2CartGroup);
    p2CartGroup.scale.setScalar(0.20);
    p2CartGroup.position.set(0, -1.0, -1.0);
});

// Keep legacy alias so existing code that references p2.cartGroup keeps working
const p2 = { get cartGroup() { return p2CartGroup; }, get wheelsData() { return p2WheelsData; } };

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

// ── Car Roster (5 cars) ───────────────────────────────────────────────────────
// Define roster: first 2 are GLB, rest are procedural
const CAR_ROSTER_DEFS = [
    { label: 'Rabbit',   type: 'proc', url: 'assets/models/CAR01_rabbit.glb',  color: 0xffaaaa, num: '01', modelScale: 0.1, modelRotateY: -Math.PI / 2, showcaseScale: 0.7, showcaseY: -0.6 },
    { label: 'Fox',      type: 'proc', url: 'assets/models/CAR02_FOX.glb',     color: 0xff8822, num: '02', modelScale: 0.1, modelRotateY: -Math.PI / 2, showcaseScale: 0.7, showcaseY: -0.6 },
    { label: 'Seadog',   type: 'proc', url: 'assets/models/CAR03_seadog.glb',  color: 0x44aaff, num: '03', modelScale: 0.2, modelRotateY: -Math.PI / 2, showcaseScale: 0.7, showcaseY: -0.6 },
    { label: 'Monkey',   type: 'proc', url: 'assets/models/CAR04_,mokey.glb',  color: 0xaa8844, num: '04', modelScale: 0.1, modelRotateY: -Math.PI / 2, showcaseScale: 0.7, showcaseY: -0.6 },
    { label: 'Tiger',    type: 'proc', url: 'assets/models/CAR05_tiger.glb',   color: 0xff6600, num: '05', modelScale: 0.1, modelRotateY: -Math.PI / 2, showcaseScale: 0.7, showcaseY: -0.6 },
    { label: 'Giraffe',  type: 'proc', url: 'assets/models/CAR06_giraffe.glb', color: 0xddcc44, num: '06', modelScale: 5.0,  modelRotateY: -Math.PI / 2, showcaseScale: 0.7, showcaseY: -0.6 },
    { label: 'Panda',    type: 'proc', url: 'assets/models/CAR07_panda.glb',   color: 0xffffff, num: '07', modelScale: 5.0,  modelRotateY: -Math.PI / 2, showcaseScale: 0.7, showcaseY: -0.6 }
];

// Loaded car groups — filled asynchronously
const carRosterGroups = new Array(CAR_ROSTER_DEFS.length).fill(null);
let selectedCarIndex = 0;   // which car P1 is using
let activeShowcaseGroup = null;  // the THREE.Group currently in showcaseScene

// Pre-build procedural cars right away
CAR_ROSTER_DEFS.forEach((def, i) => {
    if (def.type === 'proc') {
        const result = createCartModel(def.color, false, def.num);
        // Remove number sprite so showcase looks clean
        result.cartGroup.children.forEach(c => { if (c.isSprite) c.visible = false; });
        result.cartGroup.scale.setScalar(def.showcaseScale);
        result.cartGroup.position.set(0, def.showcaseY, 0);
        carRosterGroups[i] = { cartGroup: result.cartGroup, wheelsData: result.wheelsData };
    }
});

// Async-load GLB cars
CAR_ROSTER_DEFS.forEach((def, i) => {
    if (def.type !== 'glb') return;
    loadGlbCart(def.url, def.fallbackColor, def.num).then(({ cartGroup: rawG, wheelsData: w }) => {
        // Wrap the loaded mesh to allow static orientation offset
        const g = new THREE.Group();
        if (def.modelRotateY) rawG.rotation.y = def.modelRotateY;
        if (def.modelScale) rawG.scale.setScalar(def.modelScale);
        g.add(rawG);
        
        g.scale.setScalar(def.showcaseScale);
        g.position.set(0, def.showcaseY, 0);
        // Remove any number sprites if procedural fallback
        rawG.children.forEach(c => { if (c.isSprite) c.visible = false; });
        carRosterGroups[i] = { cartGroup: g, wheelsData: w };
        // If this is the currently displayed car, swap it in
        if (i === selectedCarIndex) _applyShowcaseCar(i);
        // Also set P1 / P2 game carts from the GLB once loaded
        if (i === selectedCarIndex) _applyP1Car(i);
        if (i === (selectedCarIndex + 1) % CAR_ROSTER_DEFS.length) _applyP2Car(i);
    });
    // Try applying NPCs whenever models finish loading
    _applyNPCCars();
});

function _applyShowcaseCar(idx) {
    const def = CAR_ROSTER_DEFS[idx];
    const loaded = carRosterGroups[idx];
    if (!loaded) return; // not ready yet
    if (activeShowcaseGroup) showcaseScene.remove(activeShowcaseGroup);
    activeShowcaseGroup = loaded.cartGroup;
    showcaseScene.add(activeShowcaseGroup);
    // Reset transform
    activeShowcaseGroup.scale.setScalar(def.showcaseScale);
    activeShowcaseGroup.position.set(0, def.showcaseY, 0);
    activeShowcaseGroup.rotation.set(0, 0, 0);
    // Update UI badge
    const nameEl = document.getElementById('car-name-label');
    const idxEl  = document.getElementById('car-index-label');
    if (nameEl) {
        nameEl.style.opacity = '0'; nameEl.style.transform = 'translateY(6px)';
        setTimeout(() => { nameEl.textContent = def.label; nameEl.style.opacity = '1'; nameEl.style.transform = ''; }, 150);
    }
    if (idxEl) idxEl.textContent = `${idx + 1} / ${CAR_ROSTER_DEFS.length}`;
}

function _applyP1Car(idx) {
    const loaded = carRosterGroups[idx];
    if (!loaded) return;
    const def = CAR_ROSTER_DEFS[idx];
    camera.remove(cartGroup);
    cartGroup = loaded.cartGroup.clone();
    wheelsData = [];
    cartGroup.scale.setScalar(def.type === 'glb' ? 0.375 : 0.675 * 1.6);
    cartGroup.position.set(0, -2.0, -1.8);
    cartGroup.visible = false;
    
    // Hide from own camera (Layer 0 is default. P1 car goes to Layer 1. P1 camera ignores Layer 1).
    cartGroup.traverse(child => { child.layers.set(1); });
    camera.layers.disable(1);
    camera2.layers.enable(1); // P2 can see P1
    
    camera.add(cartGroup);
}

function _applyP2Car(idx) {
    const loaded = carRosterGroups[idx];
    if (!loaded) return;
    const def = CAR_ROSTER_DEFS[idx];
    camera2.remove(p2CartGroup);
    p2CartGroup = loaded.cartGroup.clone();
    p2WheelsData = [];
    p2CartGroup.scale.setScalar(def.type === 'glb' ? 0.375 : 0.675 * 1.6);
    p2CartGroup.position.set(0, -2.0, -1.8);
    p2CartGroup.visible = false;
    
    // Hide from own camera (P2 car goes to Layer 2. P2 camera ignores Layer 2).
    p2CartGroup.traverse(child => { child.layers.set(2); });
    camera2.layers.disable(2);
    camera.layers.enable(2); // P1 can see P2
    
    camera2.add(p2CartGroup);
}

function _applyNPCCars() {
    if (!State.npcs || State.npcs.length === 0) return;
    State.npcs.forEach((npc, index) => {
        // Offset starting car index to differ from P1 & P2
        let offset = State.multiplayerMode ? 2 : 1;
        let carIdx = (selectedCarIndex + offset + index) % CAR_ROSTER_DEFS.length;
        const loaded = carRosterGroups[carIdx];
        if (!loaded) return; 
        
        // Only replace if it doesn't already have the right group length (meaning it's the procedural cart)
        // or just safely enforce swapping it out:
        scene.remove(npc.cartGroup);
        const def = CAR_ROSTER_DEFS[carIdx];
        const newGroup = loaded.cartGroup.clone();
        newGroup.scale.setScalar(def.type === 'glb' ? 0.375 : 0.675 * 1.6);
        
        newGroup.position.copy(npc.cartGroup.position);
        newGroup.quaternion.copy(npc.cartGroup.quaternion);
        
        newGroup.visible = State.isRiding; // Hide early if we haven't started playing!

        scene.add(newGroup);
        npc.cartGroup = newGroup;
    });
}

function switchCar(dir) {
    selectedCarIndex = (selectedCarIndex + dir + CAR_ROSTER_DEFS.length) % CAR_ROSTER_DEFS.length;
    _applyShowcaseCar(selectedCarIndex);
    // If loaded, also set game carts
    const p2Idx = (selectedCarIndex + 1) % CAR_ROSTER_DEFS.length;
    _applyP1Car(selectedCarIndex);
    _applyP2Car(p2Idx);
    _applyNPCCars();
}

// Wire-up buttons
document.getElementById('car-prev-btn').addEventListener('click', () => switchCar(-1));
document.getElementById('car-next-btn').addEventListener('click', () => switchCar(+1));

// Show first car
_applyShowcaseCar(0);
// Apply first GLB/proc to P1 & P2 immediately if already loaded
_applyP1Car(0);
_applyP2Car(1);

let showcaseActive = true;
const showcaseClock = new THREE.Clock();

function updateShowcase() {
    if (!showcaseActive) return;
    const dt = showcaseClock.getDelta();
    const t = showcaseClock.getElapsedTime();

    if (activeShowcaseGroup) {
        const def = CAR_ROSTER_DEFS[selectedCarIndex];
        // Slow turntable rotation
        activeShowcaseGroup.rotation.y = t * 0.08;
        activeShowcaseGroup.rotation.z = Math.sin(t * 1.5) * 0.05;
        activeShowcaseGroup.position.y = def.showcaseY + Math.sin(t * 2) * 0.15;
        // Spin procedural wheels (GLB has none to spin via wheelsData)
        const rosterEntry = carRosterGroups[selectedCarIndex];
        if (rosterEntry && rosterEntry.wheelsData) {
            rosterEntry.wheelsData.forEach(w => w.rotation.x += dt * 8);
        }
    }

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
// 精確計算：放置於攝影機視野的左半邊 (離中心往左一點的安全區)，既不擋住中間的賽車，也不會超出畫面
webMenu.position.set(3.7, 1.5, 3.1); 
webMenu.lookAt(showcaseCamera.position); 
webMenu.scale.set(1.2, 1.2, 1.2); 

// 建立 3D 選單實體 (VR 端預覽用，預設置於 VR 遊玩準備空間)
const vrMenu = create3DMenu(scene);
vrMenu.position.set(0, 1.5, -4);

// Setup Web Mouse Raycaster
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-1, -1);
let mouseClick = false;

window.addEventListener('pointermove', (e) => {
    if (!showcaseActive) return;
    const rect = showcaseCanvas.getBoundingClientRect();
    
    // 判斷滑鼠是否在 showcaseCanvas 範圍內
    if (e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom) {
        
        // 轉換為 -1 到 +1 之間的標準化設備座標 (NDC)
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    } else {
        // 如果滑鼠移出畫布範圍，將座標設為無限遠避免選取
        mouse.x = -9999;
        mouse.y = -9999;
    }
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
speedLineGroup.layers.set(3);
camera.add(speedLineGroup);
const speedLineGroup2 = speedLineGroup.clone();
speedLineGroup2.material = speedLineGroup.material.clone();
speedLineGroup2.layers.set(4);
camera2.add(speedLineGroup2);

// --- Post-Processing Pipeline ---
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bokehPass = new BokehPass(scene, camera, { focus: 30.0, aperture: 0.0001, maxblur: 0.005, width: window.innerWidth, height: window.innerHeight });
bokehPass.enabled = false; 
composer.addPass(bokehPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.15; bloomPass.strength = 0.16; bloomPass.radius = 0.5;    
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
    // Hide the independent showcase renderer (canvas + selector bar)
    showcaseActive = false;
    const _scWrapper = document.getElementById('cart-showcase-wrapper');
    if (_scWrapper) _scWrapper.style.display = 'none';
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
        
        State.players.forEach((p, idx) => {
            p.targetSpeed = 0; p.currentSpeed = State.baseSpeed * 0.75; // start at new normal (half the old value)
            p.rideProgress = idx * 0.002; p.lastProgress = p.rideProgress; p.score = 0; // Stagger P2 ahead of P1 
            p.currentLaneOffset = p.lane * 10; // Start immediately in respective lanes
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
        const sSelect = document.getElementById('saved-tracks-select');
        if(sSelect) sSelect.value = ""; 
        buildScene(scene, camera, t, tm);
        _applyNPCCars();
        ensureMenuCart();
    },
    onLoadTrack: (conf) => {
        buildScene(scene, camera, conf.theme, conf.time, conf.seed);
        _applyNPCCars();
        ensureMenuCart();
    },
    onTogglePerf: (key, value) => {
        State.perf[key] = value;
        if (key === 'bloom') {
            bloomPass.enabled = value;
        } else if (key === 'shadows') {
            renderer.shadowMap.enabled = value;
            scene.traverse(c => { if(c.material) c.material.needsUpdate = true; });
        } else if (key === 'resolution') {
            renderer.setPixelRatio(value ? Math.min(window.devicePixelRatio, 2) : 1);
        }
    }
});

setupInput();
setupXRInput(renderer, { onStart: window.startGame });

// Initial Build
buildScene(scene, camera, 'underwater', 'day');
_applyNPCCars();
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
            const timeDiff = c.t - mapP;
            // 1. Magnetic pull check (Magnetic radius: timeDiff < 0.005, laneDist < 2.5)
            if (timeDiff > 0 && timeDiff < 0.005) {
                const laneDist = Math.abs(p.currentLaneOffset - (c.lane * 2.2));
                if (laneDist < 2.5) {
                    c.magnetizingTo = p;
                }
            }

            // Execute magnetic pull
            if (c.magnetizingTo && c.magnetizingTo.cartGroup) {
                c.coin.position.lerp(c.magnetizingTo.cartGroup.position, delta * 15.0);
                c.coin.scale.setScalar(Math.max(0.1, c.coin.scale.x - delta * 2));
            }

            // Actual collection check
            if (crossedInterval(c.t) || (c.magnetizingTo === p && timeDiff <= 0.001)) {
                const laneDist = Math.abs(p.currentLaneOffset - (c.lane * 2.2));
                if (laneDist < 1.5 || c.magnetizingTo === p) { 
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
                        // Assign coin explosion to the player's private layer
                        pt.layers.set(pIdx === 0 ? 3 : 4);
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
        if (!npc.cartGroup.visible) npc.cartGroup.visible = true; // Reveal cars when the ride officially runs
        
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
    
    // 2. Camera Shake logic (Stronger in flat-screen, mild in VR to prevent sickness)
    const isHighSpeed = p.currentSpeed > State.baseSpeed * 2.0;
    const shakeIntensity = p.isBoosting ? 0.6 : (isHighSpeed ? Math.max(0, (p.currentSpeed / State.baseSpeed) * 0.1) : 0);
    
    if (renderer.xr.isPresenting && p.id === 1) {
        // VR Mode: Minimal shake
        _camPosVec.addScaledVector(_normalVec, (Math.random() - 0.5) * shakeIntensity * 0.2);
        _camPosVec.addScaledVector(_binormalVec, (Math.random() - 0.5) * shakeIntensity * 0.2);
        p.rig.position.copy(_camPosVec);
        _lookPosVec.addScaledVector(_normalVec, 1.2);
        _lookPosVec.addScaledVector(_binormalVec, p.currentLaneOffset * 0.82);
        p.rig.up.copy(_normalVec);
        p.rig.lookAt(_lookPosVec);
    } else {
        // Web Mode: Full intense shake
        _camPosVec.addScaledVector(_normalVec, (Math.random() - 0.5) * shakeIntensity);
        _camPosVec.addScaledVector(_binormalVec, (Math.random() - 0.5) * shakeIntensity);
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

    // Make player cars visible when the game starts, hide them in menus
    if (State.isRiding) {
        if (cartGroup && !cartGroup.visible) cartGroup.visible = true;
        if (typeof p2CartGroup !== 'undefined' && p2CartGroup && !p2CartGroup.visible) p2CartGroup.visible = true;
    } else {
        if (cartGroup && cartGroup.visible) cartGroup.visible = false;
        if (typeof p2CartGroup !== 'undefined' && p2CartGroup && p2CartGroup.visible) p2CartGroup.visible = false;
    }

    if (State.isRiding) {
        vrMenu.visible = false; // 掛載在 scene 上的選單在騎乘時需隱藏
        if (menuCartObj) menuCartObj.cartGroup.visible = false;
        
        const activePlayers = (State.multiplayerMode && !renderer.xr.isPresenting) ? State.players : [State.players[0]];

        activePlayers.forEach((p, idx) => {
            p.lastProgress = p.rideProgress;
            const bUI = document.getElementById('boost-alert-' + (idx+1));
            
            if (p.isBoosting) {
                p.targetSpeed = State.baseSpeed * 3.5;   // Boost: unchanged
                if(bUI) bUI.classList.remove('hidden');
                p.hl.intensity = 60; 
                p.hl.color.setHex(State.currentTheme.accent[1] || 0xffffff);
            } else {
                p.targetSpeed = State.baseSpeed * 0.5;   // Normal: 50% — much slower than boost
                if(bUI) bUI.classList.add('hidden');
                p.hl.intensity = State.currentTheme.type === 'sky' ? 0 : 25; 
                p.hl.color.setHex(0xffffff);
            }

            // 計算軌道起伏與斜度 (Gravity Impact)
            const tangent = State.curve.getTangentAt(p.rideProgress % 1.0).normalize();
            const slopeImpact = -tangent.y; // 變負值代表下坡 (加速), 負值代表上坡 (減速)
            
            // 如果是在上坡，減輕重力懲罰，確保車輛可以順利爬升
            let gravityBonus = slopeImpact * State.baseSpeed * 4.0;
            if (slopeImpact < 0) {
                gravityBonus = slopeImpact * State.baseSpeed * 0.4; // 上坡阻力大幅降低
            }
            const finalTargetSpeed = p.targetSpeed + gravityBonus;
            
            // 3. Dynamic Difficulty Curve: Base speed scales up over distance
            // Max base speed caps at 2.5x the initial base speed
            const initialBaseSpeed = 0.0007; // From State init
            const progressRatio = Math.floor(p.rideProgress); // Increases by 1 every loop
            const dynamicBaseSpeed = Math.min(initialBaseSpeed * 2.5, State.baseSpeed + (delta * 0.00001) * Math.max(1, progressRatio));
            State.baseSpeed = dynamicBaseSpeed;

            // 平滑過渡當前速度
            p.currentSpeed = THREE.MathUtils.lerp(p.currentSpeed, finalTargetSpeed, delta * (p.isBoosting ? 5.0 : 1.5));
            
            // 限制絕對最低速度為 35%
            p.currentSpeed = Math.max(State.baseSpeed * 0.35, Math.min(p.currentSpeed, State.baseSpeed * 8.0));
            
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
            
            // Add tick sound when climbing extremely steep slopes
            updateUphillAudio(idx, p.currentSpeed, tangent.y, time);
        });

        updateNPCs(delta, time);
        updateLightingAndSpeedLines(time, delta);
        checkRideEnd();
        updateEngineAudio(State.players[0].currentSpeed, State.multiplayerMode && !renderer.xr.isPresenting ? State.players[1].currentSpeed : 0);
    } else {
         // Update the independent showcase renderer (separate canvas)
         showcaseActive = true;
         const _scWrapper2 = document.getElementById('cart-showcase-wrapper');
         if (_scWrapper2) _scWrapper2.style.display = 'flex';
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
