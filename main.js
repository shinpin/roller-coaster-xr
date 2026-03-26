import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// --- Configuration ---
const TRACK_POINTS = 300;
const TRACK_SEGMENTS = 2500;
const TRACK_RADIUS = 1.0; // Doubled width for 2-lane layout

const THEMES = {
    underwater: { type: 'underwater', bg: 0x001e4a, track: 0x00ffff, ground: 0x001133, accent: [0x0077ff, 0x00ffff, 0x00ff88], fogExp: 0.02, groundWire: false },
    sky: { type: 'sky', bg: 0x55aaff, track: 0xffffff, ground: 0x3388cc, accent: [0xffffff, 0xeeeeee, 0xffddaa], fogExp: 0.005, groundWire: false },
    land: { type: 'land', bg: 0x4aacc5, track: 0x8B4513, ground: 0x228B22, accent: [0x228B22, 0x32CD32, 0x00ff00], fogExp: 0.008, groundWire: false },
    synthwave: { type: 'abstract', bg: 0x050510, track: 0x00f3ff, ground: 0x111122, accent: [0xff00ea, 0x00f3ff, 0x00ffaa], fogExp: 0.015, groundWire: true }
};

const TIMES = {
    day: { ambient: 1.0, dirLight: 1.5, dirCol: 0xffffff, fogMod: 1.0, bgMod: new THREE.Color(0xffffff) },
    sunset: { ambient: 0.7, dirLight: 1.2, dirCol: 0xff8833, fogMod: 0.8, bgMod: new THREE.Color(0xffaa55) },
    night: { ambient: 0.4, dirLight: 0.5, dirCol: 0x4444ff, fogMod: 0.5, bgMod: new THREE.Color(0x222244) }
};

let currentTheme = THEMES.underwater;
let currentTime = TIMES.day;
let currentWeather = 'clear';

// --- State ---
let isRiding = false;
let rideProgress = 0; 
let lastProgress = 0;
let baseSpeed = 0.0007; 
let currentSpeed = 0;
let targetSpeed = 0;
let isBoosting = false;

// Upgrades State
let boostRingsData = [];
let coinsData = [];
let coinParticlesData = [];
let wheelsData = [];
let score = 0;
let playerLane = 1; // 1 = right, -1 = left
let currentLaneOffset = 0;

let currentDirLight = null;
let currentHemiLight = null;

// --- Setup Scene ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const playerRig = new THREE.Group();
scene.add(playerRig);

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1500);
scene.add(camera);

// --- Little Player Cart ---
const cartGroup = new THREE.Group();
// Aerodynamic wedge body (Shorter, steeper hood)
const bodyGeo = new THREE.BoxGeometry(1.4, 0.35, 2.0); // Shorter length
const bodyPos = bodyGeo.attributes.position.array;
for(let i=0; i<bodyPos.length; i+=3) {
    if(bodyPos[i+2] < 0) { // Front 
        bodyPos[i] *= 0.6; // Taper width
        if(bodyPos[i+1] > 0) bodyPos[i+1] -= 0.25; // Steeper hood down
    } else {
        bodyPos[i] *= 1.1; // Widen back slightly
    }
}
bodyGeo.computeVertexNormals();

const bodyMat = new THREE.MeshPhysicalMaterial({ 
    color: 0xdd1111, roughness: 0.15, metalness: 0.6, clearcoat: 1.0, clearcoatRoughness: 0.1
});
const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
bodyMesh.position.y = 0.35;
cartGroup.add(bodyMesh);

// Wheels with rolling lines
const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.3, 16);
wheelGeo.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 });
const treadGeo = new THREE.BoxGeometry(0.32, 0.05, 0.05);
const treadMat = new THREE.MeshBasicMaterial({ color: 0x888888 }); // Gray lines

const wheelPositions = [
    [-0.8, 0.3, -0.6], [0.8, 0.3, -0.6], // Front wheels moved backwards by 0.3
    [-0.8, 0.3, 0.9], [0.8, 0.3, 0.9]    // Back wheels unchanged
];

wheelsData = [];
wheelPositions.forEach(wp => {
    const wGroup = new THREE.Group();
    wGroup.position.set(wp[0], wp[1], wp[2]);
    
    const wMesh = new THREE.Mesh(wheelGeo, wheelMat);
    wGroup.add(wMesh);
    
    for(let a=0; a<3; a++) {
        const angle = (a / 3) * Math.PI * 2;
        const tread = new THREE.Mesh(treadGeo, treadMat);
        tread.position.set(0, Math.sin(angle)*0.28, Math.cos(angle)*0.28);
        tread.rotation.x = -angle; 
        wGroup.add(tread);
    }
    
    cartGroup.add(wGroup);
    wheelsData.push(wGroup);
});

// Trapezoidal / Fastback Cockpit Canopy
const glassGeo = new THREE.BoxGeometry(1, 1, 1);
const posAttribute = glassGeo.attributes.position;
const H = 0.45; 
const Wf = 0.25, Wb = 0.45, Wr = 0.25; // Roof width matches front base width for massive flat top
const Fz = -0.5, Bz = 1.0;            // Z-bounds at base
const Fzr = -0.3, Bzr = 0.8;          // Z-bounds at roof (drastically expanded footprint)

for (let i = 0; i < posAttribute.count; i++) {
    let x = posAttribute.getX(i);
    let y = posAttribute.getY(i);
    let z = posAttribute.getZ(i);
    
    // Normalize Y from [-0.5, 0.5] to [0, 1]
    y = y + 0.5;
    
    // Z morphing (depth)
    const zBase = z > 0 ? Bz : Fz; 
    const zRoof = z > 0 ? Bzr : Fzr;
    z = THREE.MathUtils.lerp(zBase, zRoof, y);
    
    // X morphing (width)
    const wBase = z > 0 ? Wb : Wf;
    const wRoof = Wr;
    const w = THREE.MathUtils.lerp(wBase, wRoof, y);
    x = x > 0 ? w : -w;
    
    // Finalize Y
    y = y * H;
    
    posAttribute.setXYZ(i, x, y, z);
}
glassGeo.computeVertexNormals();
// Generate fake reflection environment map for glossy glass
const envCanvas = document.createElement('canvas');
envCanvas.width = envCanvas.height = 256;
const ctxEnv = envCanvas.getContext('2d');
const grad = ctxEnv.createLinearGradient(0, 0, 0, 256);
grad.addColorStop(0, '#ffffff'); // sky glare
grad.addColorStop(0.45, '#88aaff'); // sky
grad.addColorStop(0.5, '#445566'); // horizon 
grad.addColorStop(1, '#111122'); // ground
ctxEnv.fillStyle = grad;
ctxEnv.fillRect(0, 0, 256, 256);
const fakeEnvTex = new THREE.CanvasTexture(envCanvas);
fakeEnvTex.mapping = THREE.EquirectangularReflectionMapping;

const glassMat = new THREE.MeshPhysicalMaterial({ 
    color: 0x111115, roughness: 0.05, metalness: 0.9, 
    envMap: fakeEnvTex, envMapIntensity: 2.0,
    clearcoat: 1.0, clearcoatRoughness: 0.05
});
const glassMesh = new THREE.Mesh(glassGeo, glassMat);
glassMesh.position.set(0, 0.52, -0.2);
cartGroup.add(glassMesh);

camera.add(cartGroup);
cartGroup.scale.setScalar(0.675 * 0.8); // Shrink 20% further
cartGroup.position.set(0, -0.65, -1.0); // Pushed slightly forward (away from camera) to reveal lower rear wheel halves
const renderer = new THREE.WebGLRenderer({ antialias: false }); 
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ReinhardToneMapping; 

// --- Enable VR / WebXR ---
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local'); // Forces seated (0,0,0) tracking relative to our playerRig

const xrRig = new THREE.Group();
playerRig.add(xrRig);

// Dynamically swap rig architecture when entering/exiting VR
renderer.xr.addEventListener('sessionstart', () => {
    xrRig.add(camera);
    playerRig.add(cartGroup); // Cart physically binds to the rigid track geometry, ignoring head swivels!
    
    xrRig.position.set(0, 0, 0);
    window.vrHeightOffset = 0;

    camera.position.set(0,0,0);
    camera.rotation.set(0,0,0);
});
renderer.xr.addEventListener('sessionend', () => {
    scene.add(camera);
    camera.add(cartGroup); // Return to standard desktop HUD binding
});

container.appendChild(renderer.domElement);
document.body.appendChild( VRButton.createButton( renderer ) );

// --- VR Controllers Setup ---
const controller1 = renderer.xr.getController(0);
controller1.addEventListener('selectstart', onVRSelectStartLeft);
controller1.addEventListener('squeezestart', onVRSqueezeStart);
controller1.addEventListener('squeezeend', onVRSqueezeEnd);
scene.add(controller1);

const controller2 = renderer.xr.getController(1);
controller2.addEventListener('selectstart', onVRSelectStartRight);
controller2.addEventListener('squeezestart', onVRSqueezeStart);
controller2.addEventListener('squeezeend', onVRSqueezeEnd);
scene.add(controller2);

// Optionally display small hand pointers/models for controllers
const controllerModelFactory = { createControllerModel: function() { return new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.2), new THREE.MeshBasicMaterial({color: 0xff00ff, wireframe: true})); } };
controller1.add( controllerModelFactory.createControllerModel( controller1 ) );
controller2.add( controllerModelFactory.createControllerModel( controller2 ) );

function onVRSelectStartLeft(event) {
    if (!isRiding && window.startGame) { window.startGame(); return; }
    playerLane = -1; // Switch Left
}
function onVRSelectStartRight(event) {
    if (!isRiding && window.startGame) { window.startGame(); return; }
    playerLane = 1;  // Switch Right
}
function onVRSqueezeStart(event) {
    if(isRiding) isBoosting = true;
}
function onVRSqueezeEnd(event) {
    isBoosting = false;
}

// --- Post-Processing Pipeline (BLOOM & DEPTH OF FIELD) ---
const composer = new EffectComposer(renderer);

const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Depth of Field (Bokeh)
const bokehPass = new BokehPass(scene, camera, {
    focus: 30.0, 
    aperture: 0.0001,
    maxblur: 0.005, // Drastically reduced maximum blur
    width: window.innerWidth,
    height: window.innerHeight
});
bokehPass.enabled = false; // Completely disable depth of field blur at user's request
composer.addPass(bokehPass);

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.4; // Only very bright objects glow
bloomPass.strength = 0.4;  // Reduced glow strength
bloomPass.radius = 0.3;    // Tighter glow radius
composer.addPass(bloomPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);


// --- Audio System (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let engineAudio = null;

function setupAudio() {
    if (engineAudio) return; 
    
    // Wind noise
    const bufferSize = audioCtx.sampleRate * 2; 
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 50; 
    
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 0; 
    
    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    noise.start();
    engineAudio = { filter, gainNode };    // Background music disabled per user request

}


// --- Spotlight (Headlight) targeted at the track ---
const headLight = new THREE.SpotLight(0xffffff, 20); 
headLight.angle = Math.PI / 6; 
headLight.penumbra = 0.3;
headLight.distance = 350;
headLight.castShadow = true;
camera.add(headLight);
headLight.position.set(0, 0, 0);

const headLightTarget = new THREE.Object3D();
camera.add(headLightTarget);
headLightTarget.position.set(0, -4, -15); 
headLight.target = headLightTarget;


// Procedural Track Texture 
function createTrackTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#22222a';
    ctx.fillRect(0, 0, 512, 512);
    
    ctx.strokeStyle = '#333344';
    ctx.lineWidth = 6;
    for(let i=0; i<=512; i+=32) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
    }
    
    ctx.fillStyle = '#111';
    for(let x=16; x<=512; x+=64) {
        for(let y=16; y<=512; y+=64) {
            ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI*2); ctx.fill();
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(TRACK_SEGMENTS / 6, 2); 
    return tex;
}
const trackTexture = createTrackTexture();
// --- Speed Lines (Warp Particles) attached to camera ---
const speedLineCount = 150;
const speedLineGeo = new THREE.CylinderGeometry(0.04, 0.04, 30, 4);
speedLineGeo.rotateX(Math.PI / 2); 
const speedLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
const speedLineGroup = new THREE.InstancedMesh(speedLineGeo, speedLineMat, speedLineCount);
speedLineGroup.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
const tempObj = new THREE.Object3D();
for (let i = 0; i < speedLineCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 20 + 3; 
    const zOff = Math.random() * 200 - 100;
    tempObj.position.set(Math.cos(angle)*radius, Math.sin(angle)*radius, zOff);
    tempObj.scale.set(1, 1, Math.random() * 1.5 + 0.5);
    tempObj.updateMatrix();
    speedLineGroup.setMatrixAt(i, tempObj.matrix);
}
camera.add(speedLineGroup);

// --- Translucent Arrow Texture Generator ---
function createArrowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(255, 255, 255, 0)';
    ctx.fillRect(0,0,128,128);
    ctx.strokeStyle = 'rgba(0, 255, 200, 0.8)';
    ctx.lineWidth = 15;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
        const yOffset = i * 35 + 20;
        ctx.beginPath();
        ctx.moveTo(20, yOffset + 15);
        ctx.lineTo(64, yOffset);
        ctx.lineTo(108, yOffset + 15);
        ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
}
const arrowTexture = createArrowTexture();


// Procedural Equirectangular 360 Environment Texture
function createEnvironmentTexture(themeType, timeKey) {
    const canvas = document.createElement('canvas');
    canvas.width = 2048; 
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    
    let grad = ctx.createLinearGradient(0, 0, 0, 1024);
    if(themeType === 'sky') {
        if(timeKey === 'night') {
            grad.addColorStop(0, '#05051a'); grad.addColorStop(1, '#1a1a33');
        } else if(timeKey === 'sunset') {
            grad.addColorStop(0, '#331122'); grad.addColorStop(0.5, '#aa4433'); grad.addColorStop(1, '#ffaa55');
        } else {
            grad.addColorStop(0, '#115599'); grad.addColorStop(0.5, '#66aaff'); grad.addColorStop(1, '#aabbff');
        }
    } else if (themeType === 'underwater') {
        grad.addColorStop(0, '#001e4a'); grad.addColorStop(1, '#000011');
    } else if (themeType === 'synthwave') {
        grad.addColorStop(0, '#110022'); grad.addColorStop(0.5, '#050510'); grad.addColorStop(1, '#ff00ea');
    } else {
        if(timeKey === 'night') {
            grad.addColorStop(0, '#05051a'); grad.addColorStop(1, '#112233');
        } else if(timeKey === 'sunset') {
            grad.addColorStop(0, '#331122'); grad.addColorStop(0.8, '#aa4433'); grad.addColorStop(1, '#cc6644');
        } else {
            grad.addColorStop(0, '#226688'); grad.addColorStop(1, '#4aacc5');
        }
    }
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2048, 1024);
    
    if(timeKey === 'night' || themeType === 'synthwave' || themeType === 'underwater') {
        ctx.fillStyle = '#ffffff';
        for(let i=0; i<1500; i++) {
            const x = Math.random() * 2048;
            const y = Math.random() * 1024;
            const r = Math.random() * 1.5;
            ctx.globalAlpha = Math.random();
            ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha = 1.0;
        
        for(let i=0; i<15; i++) {
            const x = Math.random() * 2048;
            const y = Math.random() * 600; 
            const r = Math.random() * 150 + 50;
            const gl = ctx.createRadialGradient(x,y,0, x,y,r);
            gl.addColorStop(0, themeType==='synthwave' ? 'rgba(255,0,234,0.15)' : 'rgba(100,200,255,0.05)');
            gl.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gl;
            ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
        }
    }
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// Global references 
let ground;
let animatedObjects = [];
let weatherParticles = null;
const curve = new THREE.CatmullRomCurve3();
let frames;

// Minimap
let minimapTrackPoints = [];
let minimapScale = 1;
let minimapCx = 0;
let minimapCz = 0;

let currentLevelConfig = null;

function buildScene(themeKey, timeKey, weatherKey, forceSeed = null) {
    if (themeKey === 'random') {
        const keys = Object.keys(THEMES);
        themeKey = keys[Math.floor(Math.random() * keys.length)];
    }
    
    const activeSeed = forceSeed !== null ? forceSeed : Math.floor(Math.random() * 9999999);
    currentLevelConfig = { seed: activeSeed, theme: themeKey, time: timeKey, weather: weatherKey };
    
    // Seeded PRNG for deterministic track/environment generation
    let localSeedState = activeSeed;
    function prng() {
        let t = localSeedState += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    const originalMathRandom = Math.random;
    Math.random = prng;

    try {
        currentTheme = THEMES[themeKey];
        currentTime = TIMES[timeKey];
        currentWeather = weatherKey;
    
    const bgmMap = {
        'sky': 'BGM_skytrack_cloud.mp3',
        'land': 'BGM_skytrack_land.mp3',
        'abstract': 'BGM_skytrack_star.mp3',
        'underwater': 'BGM_skytrack_sea.mp3'
    };
    const bgmSrc = bgmMap[currentTheme.type] || 'BGM_skytrack_sea.mp3';
    const bgMusic = document.getElementById('bg-music');
    if (bgMusic && !bgMusic.src.includes(bgmSrc)) {
        bgMusic.src = bgmSrc;
        if (isRiding) bgMusic.play().catch(e=>console.log(e));
    }

    // Clear old
    while(scene.children.length > 0){ 
        scene.remove(scene.children[0]);
    }
    animatedObjects = [];
    
    scene.add(camera); 

    // Mapping the provided 360 Skybox panoramas
    let bgTextureFile = 'PanoGen360_4K_sea.jpg';
    if (themeKey === 'land') bgTextureFile = 'PanoGen360_4K_land.jpg';
    else if (themeKey === 'sky') bgTextureFile = 'PanoGen360_4K_cloud.jpg';
    else if (themeKey === 'synthwave') bgTextureFile = 'PanoGen360_4K_star.jpg';
    else if (themeKey === 'underwater') bgTextureFile = 'PanoGen360_4K_sea.jpg';

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(bgTextureFile + '?v=' + Date.now(), (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        scene.background = texture;
        scene.environment = texture; // Real-time reflection IBL mapping!
    });
    
    const baseBg = new THREE.Color(currentTheme.bg).multiply(currentTime.bgMod);
    scene.fog = new THREE.FogExp2(baseBg.getHex(), currentTheme.fogExp * currentTime.fogMod);

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, currentTime.ambient * 0.8);
    scene.add(ambientLight);
    
    // Use Hemisphere light to naturally outline terrain and models using sky and ground color bounces!
    currentHemiLight = new THREE.HemisphereLight(currentTime.dirCol, currentTheme.ground, currentTime.ambient * 1.2);
    scene.add(currentHemiLight);

    currentDirLight = new THREE.DirectionalLight(currentTime.dirCol, (currentTheme.type === 'sky' ? 2.5 : 1.5) * currentTime.dirLight);
    currentDirLight.position.set(50, 100, 50);
    currentDirLight.castShadow = true;
    currentDirLight.shadow.mapSize.width = 1024;
    currentDirLight.shadow.mapSize.height = 1024;
    
    // Lensflare Effects
    const canvasFlare = document.createElement('canvas');
    canvasFlare.width = 256; canvasFlare.height = 256;
    const ctxF = canvasFlare.getContext('2d');
    const gF = ctxF.createRadialGradient(128, 128, 0, 128, 128, 128);
    gF.addColorStop(0, 'rgba(255,255,255,1.0)'); gF.addColorStop(0.2, 'rgba(255,220,180,0.5)'); gF.addColorStop(1, 'rgba(0,0,0,0)');
    ctxF.fillStyle = gF; ctxF.fillRect(0,0,256,256);
    const flareTex = new THREE.CanvasTexture(canvasFlare);
    const lensflare = new Lensflare();
    lensflare.addElement(new LensflareElement(flareTex, 400, 0, new THREE.Color(0xffffff)));
    lensflare.addElement(new LensflareElement(flareTex, 60, 0.4, new THREE.Color(0x55ff55)));
    lensflare.addElement(new LensflareElement(flareTex, 100, 0.55, new THREE.Color(0x3344ff)));
    lensflare.addElement(new LensflareElement(flareTex, 80, 0.9, new THREE.Color(0xffaa22)));
    currentDirLight.add(lensflare);
    
    scene.add(currentDirLight);

    if (currentTheme.type !== 'sky' && currentTheme.type !== 'land') {
        for (let i=0; i<6; i++) {
            const pColor = new THREE.Color(currentTheme.accent[i%currentTheme.accent.length]);
            const pLight = new THREE.PointLight(pColor, 5, 120);
            pLight.position.set( (Math.random() - 0.5) * 150, Math.random() * 20 + 5, (Math.random() - 0.5) * 150 );
            scene.add(pLight);
        }
    }

    // --- Weather Particles ---
    if (weatherParticles) weatherParticles.geometry.dispose();
    if (currentWeather !== 'clear') {
        const pCount = currentWeather === 'rain' ? 5600 : 800;
        const pGeo = new THREE.BufferGeometry();
        const pPos = new Float32Array(pCount * 3);
        for(let i=0; i<pCount*3; i+=3) {
            pPos[i] = (Math.random() - 0.5) * 400; 
            pPos[i+1] = (Math.random() - 0.5) * 400; 
            pPos[i+2] = (Math.random() - 0.5) * 400; 
        }
        pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
        
        // Procedural particle shapes (circle for snow, thin line for rain)
        function createParticleTex(type) {
            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            if (type === 'snow') {
                const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
                grad.addColorStop(0, 'rgba(255,255,255,1)');
                grad.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.arc(32, 32, 32, 0, Math.PI*2); ctx.fill();
            } else {
                ctx.strokeStyle = 'rgba(200,220,255,0.7)';
                ctx.lineWidth = 2; // thin rain line
                ctx.beginPath(); ctx.moveTo(32, 16); ctx.lineTo(32, 48); ctx.stroke();
            }
            return new THREE.CanvasTexture(canvas);
        }
        
        let pMat;
        if(currentWeather === 'rain') {
            const rCount = 2500;
            const rGeo = new THREE.CylinderGeometry(0.015, 0.015, 12, 3);
            rGeo.rotateX(Math.PI / 2); // Faces Z axis
            const rMat = new THREE.MeshBasicMaterial({ color: 0xaaccff, transparent: true, opacity: 0.5 });
            weatherParticles = new THREE.InstancedMesh(rGeo, rMat, rCount);
            const tObj = new THREE.Object3D();
            for(let i=0; i<rCount; i++) {
                tObj.position.set((Math.random()-0.5)*150, (Math.random()-0.5)*150, (Math.random()-0.5)*300);
                tObj.updateMatrix();
                weatherParticles.setMatrixAt(i, tObj.matrix);
            }
            camera.add(weatherParticles);
            // bokehPass.uniforms.aperture.value = 0.0005; 
        } else {
            pMat = new THREE.PointsMaterial({ 
                color: new THREE.Color(0xffffff).multiplyScalar(1.5), 
                size: 2.25, transparent: true, opacity: 0.9, 
                map: createParticleTex('snow'), blending: THREE.AdditiveBlending 
            });
            // bokehPass.uniforms.aperture.value = 0.0003; 
            weatherParticles = new THREE.Points(pGeo, pMat);
            scene.add(weatherParticles);
        }
    } else {
        weatherParticles = null;
    }

    // --- Generate Ground ---
    const groundGeo = new THREE.PlaneGeometry(1200, 1200, 64, 64);
    const posAttribute = groundGeo.attributes.position;
    for (let i=0; i<posAttribute.count; i++) {
        const x = posAttribute.getX(i);
        const y = posAttribute.getY(i);
        const dist = Math.sqrt(x*x + y*y);
        let z = 0;
        if (dist > 50) {
            z = (dist - 50) * Math.random() * 0.6; 
            if (currentTheme.type === 'land') z = Math.sin(x*0.015) * Math.cos(y*0.015) * 12; 
            if (currentTheme.type === 'underwater') z += Math.random() * 8; 
        }
        posAttribute.setZ(i, z);
    }
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({ 
        color: currentTheme.ground,
        roughness: currentTheme.type === 'underwater' ? 0.7 : 0.9, 
        metalness: 0.1,
        wireframe: currentTheme.groundWire 
    });
    ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = currentTheme.type === 'sky' ? -150 : -60; 
    ground.receiveShadow = true;
    if (currentTheme.type !== 'sky' && currentTheme.type !== 'abstract') {
        scene.add(ground);
    }

    // --- Enhanced Props & Creatures ---
    if (currentTheme.type === 'underwater') {
        const bubbleGeo = new THREE.SphereGeometry(1, 16, 16);
        const bubbleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.5), transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.8 });
        for(let i=0; i<100; i++) {
            const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
            const scale = Math.random() * 0.8 + 0.2;
            bubble.scale.set(scale, scale, scale);
            bubble.position.set((Math.random() - 0.5) * 400, (Math.random() * 200) - 20, (Math.random() - 0.5) * 400);
            scene.add(bubble);
            animatedObjects.push({
                obj: bubble,
                update: (time, delta) => {
                    bubble.position.y += delta * 15 * scale;
                    bubble.position.x += Math.sin(time + i) * 0.1;
                    if (bubble.position.y > 200) bubble.position.y = -20;
                }
            });
        }
        // Removed Kelp per user request
        const fishGeo = new THREE.ConeGeometry(0.8, 4, 8);
        fishGeo.rotateX(Math.PI / 2); 
        const fishMat = new THREE.MeshStandardMaterial({ color: 0xff8800, roughness: 0.4 });
        for(let i=0; i<40; i++) {
            const fish = new THREE.Mesh(fishGeo, fishMat);
            const r = Math.random() * 120 + 20;
            const yOffset = Math.random() * 100 - 10;
            const speed = Math.random() * 0.4 + 0.2;
            scene.add(fish);
            animatedObjects.push({
                obj: fish,
                update: (time) => {
                    const angle = time * speed + i;
                    fish.position.set(Math.cos(angle) * r, yOffset + Math.sin(time*1.5+i)*4, Math.sin(angle) * r);
                    const nextAngle = angle + 0.05;
                    fish.lookAt(Math.cos(nextAngle) * r, fish.position.y, Math.sin(nextAngle) * r);
                }
            });
        }
    } else if (currentTheme.type === 'sky') {
        const cloudGeo = new THREE.DodecahedronGeometry(5, 1);
        const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, flatShading: true });
        for(let i=0; i<60; i++) {
            const cloud = new THREE.Group();
            for(let j=0; j<6; j++){
                const puff = new THREE.Mesh(cloudGeo, cloudMat);
                puff.position.set( (Math.random()-0.5)*12, (Math.random()-0.5)*6, (Math.random()-0.5)*12 );
                const s = Math.random() * 2 + 0.5;
                puff.scale.set(s,s,s);
                cloud.add(puff);
            }
            cloud.position.set((Math.random() - 0.5) * 800, (Math.random() * 300) - 50, (Math.random() - 0.5) * 800);
            scene.add(cloud);
        }
        // Floating Islands
        const islandGeo = new THREE.CylinderGeometry(25, 10, 10, 7);
        const topMat = new THREE.MeshStandardMaterial({ color: 0x88cc55, roughness: 0.9 });
        const bottomMat = new THREE.MeshStandardMaterial({ color: 0x775533, roughness: 1.0 });
        for(let i=0; i<25; i++) {
           const island = new THREE.Mesh(islandGeo, [topMat, bottomMat, bottomMat]); // crude texturing
           island.position.set((Math.random()-0.5)*800, (Math.random()*200)-100, (Math.random()-0.5)*800);
           scene.add(island);
        }
        const birdGeo = new THREE.ConeGeometry(1, 3, 3);
        birdGeo.rotateX(Math.PI / 2);
        const birdMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
        for(let i=0; i<40; i++) {
            const bird = new THREE.Mesh(birdGeo, birdMat);
            bird.position.set((Math.random() - 0.5) * 600, (Math.random() * 100) + 40, (Math.random() - 0.5) * 600);
            scene.add(bird);
            animatedObjects.push({
                obj: bird,
                dir: new THREE.Vector3(Math.random()-0.5, 0, Math.random()-0.5).normalize(),
                speed: Math.random() * 30 + 15,
                update: function(time, delta) {
                    this.obj.position.addScaledVector(this.dir, this.speed * delta);
                    this.obj.position.y += Math.sin(time * 6 + i) * 0.2;
                    if(this.obj.position.length() > 600) {
                        this.obj.position.set((Math.random() - 0.5) * 200, (Math.random() * 100) + 40, (Math.random() - 0.5) * 200);
                        this.dir.set(Math.random()-0.5, 0, Math.random()-0.5).normalize();
                    }
                    const target = this.obj.position.clone().add(this.dir);
                    this.obj.lookAt(target);
                }
            });
        }
    } else if (currentTheme.type === 'land') {
        const trunkGeo = new THREE.CylinderGeometry(1.5, 2, 8, 8);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
        const leavesGeo = new THREE.ConeGeometry(6, 20, 8);
        const leavesMat = new THREE.MeshStandardMaterial({ color: 0x228B22, flatShading: true });
        for(let i=0; i<250; i++) {
            const x = (Math.random() - 0.5) * 800;
            const z = (Math.random() - 0.5) * 800;
            const dist = Math.sqrt(x*x + z*z);
            if(dist > 50) { 
                const tree = new THREE.Group();
                const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                trunk.position.y = 4;
                const leaves = new THREE.Mesh(leavesGeo, leavesMat);
                leaves.position.y = 12;
                tree.add(trunk); tree.add(leaves);
                const cy = Math.sin(x*0.015) * Math.cos(z*0.015) * 12; 
                tree.position.set(x, cy - 60, z); 
                
                const s = Math.random() * 1.5 + 0.5;
                tree.scale.set(s,s,s);
                scene.add(tree);
            }
        }
        // Boulders
        const rockGeo = new THREE.IcosahedronGeometry(12, 1);
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9, flatShading: true });
        for(let i=0; i<40; i++) {
           const rock = new THREE.Mesh(rockGeo, rockMat);
           const x = (Math.random()-0.5)*600;
           const z = (Math.random()-0.5)*600;
           const cy = Math.sin(x*0.015) * Math.cos(z*0.015) * 12; 
           rock.position.set(x, cy - 60, z);
           rock.scale.set(1, Math.random()*1.5+0.5, 1);
           rock.rotation.y = Math.random()*10;
           scene.add(rock);
        }
    } else {
        // Synthwave Huge Pyramids
        const pyraGeo = new THREE.ConeGeometry(120, 150, 4);
        const pyraMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff00ea).multiplyScalar(2), wireframe: true });
        for(let i=0; i<8; i++) {
           const p = new THREE.Mesh(pyraGeo, pyraMat);
           const angle = (i/8) * Math.PI * 2;
           p.position.set(Math.cos(angle)*500, 55, Math.sin(angle)*500);
           scene.add(p);
        }
        const orbGeo = new THREE.TetrahedronGeometry(3);
        for (let i = 0; i < 60; i++) {
            const colorRaw = new THREE.Color(currentTheme.accent[i % currentTheme.accent.length]);
            const orbMat = new THREE.MeshStandardMaterial({ color: colorRaw, emissive: colorRaw.multiplyScalar(3), emissiveIntensity: 1.0, flatShading: true });
            const mesh = new THREE.Mesh(orbGeo, orbMat);
            mesh.position.set( (Math.random() - 0.5) * 300, (Math.random() * 100) - 10, (Math.random() - 0.5) * 300 );
            scene.add(mesh);
            animatedObjects.push({
                obj: mesh,
                baseY: mesh.position.y,
                floatSpeed: Math.random() * 0.02,
                floatOffset: Math.random() * Math.PI * 2,
                update: function(time) {
                    this.obj.position.y = this.baseY + Math.sin(time + this.floatOffset) * 5;
                    this.obj.rotation.x += this.floatSpeed;
                    this.obj.rotation.y += this.floatSpeed;
                }
            });
        }
    }

    // [Track Spline Generation]
    const pts = [];
    const currentPt = new THREE.Vector3(0, 0, 0);
    const loopSeed = Math.random() * 3 + 3;
    const heightSeed = Math.random() * 30 + 20;

    for (let i = 0; i < TRACK_POINTS; i++) {
        const t = i / TRACK_POINTS;
        const angle = t * Math.PI * 2 * loopSeed; 
        
        let radius = 40 + Math.sin(t * Math.PI * 12) * 20;
        if (i > TRACK_POINTS * 0.4 && i < TRACK_POINTS * 0.6) radius -= 15; 
        
        const height = Math.sin(t * Math.PI * 8) * heightSeed + Math.cos(t * Math.PI * 3) * 15;
        const offsetHeight = currentTheme.type === 'sky' ? height + 60 : height; 
        currentPt.set(Math.cos(angle) * radius, offsetHeight, Math.sin(angle) * radius);
        pts.push(currentPt.clone());
    }

    // Ensure track paths don't overlap vertically (minimum 1.5 car heights ~ 4.0 units max clearance constraint)
    const clearance = 4.0; 
    const horizontalDistSq = 36.0; // 6.0 radius collision check to catch edges
    let skipUntil = 0;
    for (let i = 15; i < TRACK_POINTS; i++) { // TRACK_POINTS is 300 (not 4000), 15 pts ~ 5% of track
        if (i < skipUntil) continue;
        for (let j = 0; j < i - 15; j++) {
            const dx = pts[i].x - pts[j].x;
            const dz = pts[i].z - pts[j].z;
            if (dx * dx + dz * dz < horizontalDistSq) {
                const dy = pts[i].y - pts[j].y;
                if (Math.abs(dy) < clearance) {
                    const pushUp = clearance - Math.abs(dy);
                    const direction = dy >= 0 ? 1 : -1;
                    // Spread the vertical ramp over 20 points smoothly
                    for (let k = -10; k <= 10; k++) {
                        const idx = (i + k + TRACK_POINTS) % TRACK_POINTS;
                        const falloff = 1.0 - Math.abs(k) / 10;
                        pts[idx].y += pushUp * direction * falloff * 1.5; 
                    }
                    skipUntil = i + 25; // Disable overlap checks for next 25 points to bypass the intersection zone cleanly
                    break;
                }
            }
        }
    }
    
    curve.points = pts;
    curve.closed = true;
    curve.updateArcLengths();
    frames = curve.computeFrenetFrames(TRACK_SEGMENTS, true);

    // Override Three.js unpredictable Frenet normals to guarantee an upright track
    for (let i = 0; i <= TRACK_SEGMENTS; i++) {
        const t = frames.tangents[i];
        
        let right = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0));
        if (right.lengthSq() < 0.01) right.crossVectors(t, new THREE.Vector3(1, 0, 0));
        right.normalize();
        
        const uprightNormal = new THREE.Vector3().crossVectors(right, t).normalize();
        
        frames.normals[i].copy(uprightNormal);
        frames.binormals[i].copy(right);
    }
    // Track Geometry (Robust BufferGeometry)
    // Three.js ExtrudeGeometry has internal flaws that twist at steep angles.
    // We manually generate a rigid rectangular cross-section here.
    const trackGeo = new THREE.BufferGeometry();
    const vertices = [];
    const uvs = [];
    const indices = [];
    
    const hw = 2.8; // Half-width (reduced so sleepers can stick out)
    const ht = 0.2; // Half-thickness (total 0.4 thickness)
    
    for (let i = 0; i <= TRACK_SEGMENTS; i++) {
        const u = i / TRACK_SEGMENTS;
        const pt = curve.getPointAt(u);
        const normal = frames.normals[i];
        const right = frames.binormals[i];
        
        // Lower track center to expose sleeper cross-ties above it
        const trackCenter = pt.clone().addScaledVector(normal, -0.15);
        
        // 4 corners of the rectangular cross-section
        const tr = trackCenter.clone().addScaledVector(right, hw).addScaledVector(normal, ht);
        const tl = trackCenter.clone().addScaledVector(right, -hw).addScaledVector(normal, ht);
        const bl = trackCenter.clone().addScaledVector(right, -hw).addScaledVector(normal, -ht);
        const br = trackCenter.clone().addScaledVector(right, hw).addScaledVector(normal, -ht);
        
        vertices.push(tr.x, tr.y, tr.z);
        vertices.push(tl.x, tl.y, tl.z);
        vertices.push(bl.x, bl.y, bl.z);
        vertices.push(br.x, br.y, br.z);
        
        const uvY = i * 0.1; // Simple repeating UV
        uvs.push(1, uvY, 0, uvY, 0, uvY, 1, uvY); 
    }
    
    for (let i = 0; i < TRACK_SEGMENTS; i++) {
        const row1 = i * 4;
        const row2 = (i + 1) * 4;
        // Top Face (tr, tl) -> (0, 1) Note: winding order is counter-clockwise.
        // tr is 0, tl is 1. We want normal pointing UP (+normal). 
        // tl(1) -> bl(2) -> br(3) -> tr(0)
        indices.push(row1 + 1, row1 + 0, row2 + 0);
        indices.push(row1 + 1, row2 + 0, row2 + 1);
        // Bottom Face
        indices.push(row1 + 3, row1 + 2, row2 + 2);
        indices.push(row1 + 3, row2 + 2, row2 + 3);
        // Right Side Face
        indices.push(row1 + 0, row1 + 3, row2 + 3);
        indices.push(row1 + 0, row2 + 3, row2 + 0);
        // Left Side Face
        indices.push(row1 + 2, row1 + 1, row2 + 1);
        indices.push(row1 + 2, row2 + 1, row2 + 2);
    }
    
    trackGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    trackGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    trackGeo.setIndex(indices);
    trackGeo.computeVertexNormals();
    
    let overlayColor = 0xffffff;
    if(currentTheme.type === 'underwater') overlayColor = 0xaaccff;
    if(currentTheme.type === 'land') overlayColor = 0xddbb99;
    
    const trackMat = new THREE.MeshStandardMaterial({ map: trackTexture, color: overlayColor, roughness: 0.8, metalness: 0.2 });
    const trackMain = new THREE.Mesh(trackGeo, trackMat);
    trackMain.castShadow = true; trackMain.receiveShadow = true;
    scene.add(trackMain);

    const neonGeoLeft = new THREE.TubeGeometry(curve, TRACK_SEGMENTS, 0.16, 4, true);
    const neonGeoRight = new THREE.TubeGeometry(curve, TRACK_SEGMENTS, 0.16, 4, true);
    
    // Push the left and right neon lines outward to cap the flat geometry sides
    const leftPositions = neonGeoLeft.attributes.position.array;
    const rightPositions = neonGeoRight.attributes.position.array;
    
    for (let i = 0; i < TRACK_SEGMENTS; i++) {
        const binormal = frames.binormals[i];
        for (let j = 0; j <= 4; j++) {
            const idx = (i * 5 + j) * 3;
            if(idx < leftPositions.length) {
                 leftPositions[idx] -= binormal.x * 2.8;   
                 leftPositions[idx+1] -= binormal.y * 2.8; 
                 leftPositions[idx+2] -= binormal.z * 2.8; 
                 
                 rightPositions[idx] += binormal.x * 2.8;   
                 rightPositions[idx+1] += binormal.y * 2.8; 
                 rightPositions[idx+2] += binormal.z * 2.8; 
            }
        }
    }
    neonGeoLeft.attributes.position.needsUpdate = true;
    neonGeoRight.attributes.position.needsUpdate = true;

    let neonCol = new THREE.Color(currentTheme.track).multiplyScalar(5.0);
    const neonMat = new THREE.MeshBasicMaterial({ color: neonCol });
    const neonLeft = new THREE.Mesh(neonGeoLeft, neonMat);
    const neonRight = new THREE.Mesh(neonGeoRight, neonMat);
    scene.add(neonLeft);
    scene.add(neonRight);

    // Turn Indicators Setup
    const turnIndicatorGeo = new THREE.PlaneGeometry(16, 16); 
    const turnIndicatorMat = new THREE.MeshBasicMaterial({ 
        map: arrowTexture, transparent: true, opacity: 0.8, 
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const turnsGroup = new THREE.Group();
    scene.add(turnsGroup);

    // Track Sleepers (Cross-ties)
    let lastArrowSpawn = -1000;
    const sleeperCount = TRACK_POINTS * 4;
    const sleeperGeo = new THREE.BoxGeometry(6.8, 0.3, 0.8); // Wider than smooth track to protrude outside
    const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.3, metalness: 0.6 });
    const sleepersGroup = new THREE.InstancedMesh(sleeperGeo, sleeperMat, sleeperCount);
    let sleeperIndex = 0;
    for (let i = 0; i < sleeperCount; i++) {
        const t = i / sleeperCount;
        const pos = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t).normalize();
        
        const rawI = t * TRACK_SEGMENTS;
        const fi = Math.floor(rawI);
        const nw = Math.max(0, Math.min(1, rawI - fi)); // safe lerp weight
        const nextFi = (fi + 1) % TRACK_SEGMENTS;
        
        const normal = new THREE.Vector3();
        normal.lerpVectors(frames.normals[fi], frames.normals[nextFi], nw).normalize();
        
        const up = normal.clone();
        const axis = new THREE.Vector3().crossVectors(up, tangent).normalize();
        
        const matrix = new THREE.Matrix4();
        matrix.makeBasis(axis, up, tangent);
        const sleeperPos = pos.clone();
        matrix.setPosition(sleeperPos.x, sleeperPos.y, sleeperPos.z);
        sleepersGroup.setMatrixAt(sleeperIndex++, matrix);

        // Turn Indicators Placement (Sample tangents to detect extremely sharp horizontal turns)
        if (i % 8 === 0 && (i - lastArrowSpawn) > 800) { 
            const tPrev = curve.getTangentAt(Math.max(0, t - 0.04));
            const tNext = curve.getTangentAt(Math.min(1, t + 0.04));
            const turnSharpness = tPrev.x * tNext.z - tPrev.z * tNext.x; 

            if (Math.abs(turnSharpness) > 0.030) {
                lastArrowSpawn = i; 
                const arrowMesh = new THREE.Mesh(turnIndicatorGeo, turnIndicatorMat.clone());
                const sideShift = turnSharpness < -0.030 ? -6.0 : 6.0; // Swap sides to place on the outer curve
                arrowMesh.position.copy(pos).addScaledVector(up, 2.5).addScaledVector(axis, sideShift); // Stand vertically on the side
                
                // Align billboard to face the incoming camera
                arrowMesh.lookAt(pos.clone().sub(tangent));
                
                if (turnSharpness < -0.030) {
                    arrowMesh.rotateZ(Math.PI / 2); // Fixed rotation
                    arrowMesh.material.color.setHex(0xffaa00);
                } else {
                    arrowMesh.rotateZ(-Math.PI / 2); // Fixed rotation
                    arrowMesh.material.color.setHex(0x00ffcc);
                }
                turnsGroup.add(arrowMesh);
            }
        }
    }
    sleepersGroup.castShadow = true;
    scene.add(sleepersGroup);

    // Track Pillars (Ground Supports)
    const pCount = Math.floor(TRACK_POINTS / 2);
    const pillarGeo = new THREE.CylinderGeometry(0.3, 0.6, 1, 8);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.4, metalness: 0.8 });
    const pillarsGroup = new THREE.InstancedMesh(pillarGeo, pillarMat, pCount);
    let pIdx = 0;
    const gY = currentTheme.type === 'sky' ? -150 : -60;
    
    for (let i = 0; i < TRACK_POINTS; i += 2) {
        const t = i / TRACK_POINTS;
        const pos = curve.getPointAt(t);
        
        const dist = Math.sqrt(pos.x*pos.x + pos.z*pos.z);
        let zPos = 0;
        if (dist > 50) {
            if (currentTheme.type === 'land') zPos = Math.sin(pos.x*0.015) * Math.cos(pos.z*0.015) * 12; 
            if (currentTheme.type === 'underwater') zPos += 4; 
        }
        let actualGroundY = gY + zPos;
        
        let skipPillar = false;
        
        // Prevent piercing other tracks directly below
        for (let j = 0; j < TRACK_POINTS; j += 2) {
            if (Math.abs(i - j) < 15 || Math.abs(i - j) > TRACK_POINTS - 15) continue; 
            const otherPos = curve.points[j];
            
            // Check if the other track is within our pillar's vertical drop path
            if (otherPos.y < pos.y + 2 && otherPos.y > actualGroundY - 2) {
                const dx = otherPos.x - pos.x;
                const dz = otherPos.z - pos.z;
                if (dx*dx + dz*dz < 100) { // Radius 10 clearance zone
                    skipPillar = true;
                    break;
                }
            }
        }
        
        if (skipPillar) continue;
        
        if (pos.y > actualGroundY + 1) { 
            const height = pos.y - actualGroundY;
            const matrix = new THREE.Matrix4();
            matrix.makeScale(1, height, 1);
            matrix.setPosition(pos.x, actualGroundY + height/2, pos.z);
            pillarsGroup.setMatrixAt(pIdx++, matrix);
        }
    }
    pillarsGroup.count = pIdx;
    pillarsGroup.castShadow = true;
    scene.add(pillarsGroup);

    boostRingsData = [];
    if (currentTheme.type === 'abstract') {
        const ringGeo = new THREE.TorusGeometry(3.5, 0.1, 8, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(currentTheme.accent[0]).multiplyScalar(3.0) });
        for (let i = 0; i < TRACK_POINTS; i += 6) {
            const t = i / TRACK_POINTS;
            const pos = curve.getPointAt(t);
            const tangent = curve.getTangentAt(t).normalize();
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.copy(pos);
            ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), tangent);
            scene.add(ring);
        }
    } else {
        const brGeo = new THREE.TorusGeometry(12, 0.5, 16, 64);
        const brMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00aaff, emissiveIntensity: 2.5, transparent: true, opacity: 0.8 });
        
        const coinGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.08, 32); // 50% smaller
        coinGeo.rotateZ(Math.PI / 2); // Faces left/right (profile parallel to track)
        const coinMat = new THREE.MeshStandardMaterial({ color: 0xffdd00, emissive: 0xffaa00, emissiveIntensity: 1.0, metalness: 0.8, roughness: 0.2 });

        let coinChainLeft = 0;
        let currentCoinLane = 1;
        
        for (let i = 25; i < TRACK_POINTS; i++) { 
            const t = i / TRACK_POINTS;
            const pos = curve.getPointAt(t);
            const tangent = curve.getTangentAt(t).normalize();
            
            if (i % 80 === 0) {
                // Interactive collectable Boost rings
                const ring = new THREE.Mesh(brGeo, brMat);
                ring.position.copy(pos);
                ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), tangent);
                scene.add(ring);
                boostRingsData.push({ t, ring, active: true });
                continue;
            }
            
            // Randomly start a coin chain 
            if (coinChainLeft <= 0 && Math.random() < 0.10) {
                coinChainLeft = Math.floor(Math.random() * 30) + 10; // 10 to 40 coins
                currentCoinLane = Math.floor(Math.random() * 3) - 1; // Will generate -1 (Left), 0 (Center), 1 (Right)
            }
            
            if (coinChainLeft > 0) {
                coinChainLeft--;
                
                // Collectable Coins
                const coin = new THREE.Mesh(coinGeo, coinMat);
                
                const rawI = t * TRACK_SEGMENTS;
                const fi = Math.floor(rawI);
                const nw = Math.max(0, Math.min(1, rawI - fi));
                const nextFi = (fi + 1) % TRACK_SEGMENTS;
                const normal = new THREE.Vector3().lerpVectors(frames.normals[fi], frames.normals[nextFi], nw).normalize();
                const rightVec = new THREE.Vector3().crossVectors(normal, tangent).normalize();

                // Stand perfectly upright facing the track direction
                const m4 = new THREE.Matrix4();
                m4.makeBasis(rightVec, normal, tangent);
                coin.quaternion.setFromRotationMatrix(m4);
                
                const coinPos = pos.clone().addScaledVector(rightVec, currentCoinLane * 2.2).addScaledVector(normal, 1.5); // float higher (+1.5)
                coin.position.copy(coinPos);
                scene.add(coin);
                coinsData.push({ t, lane: currentCoinLane, coin, active: true });
            }
        }
    }

    // --- Minimap Bounds Calculation ---
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    curve.points.forEach(p => {
        if(p.x < minX) minX = p.x;
        if(p.x > maxX) maxX = p.x;
        if(p.z < minZ) minZ = p.z;
        if(p.z > maxZ) maxZ = p.z;
    });
    const minimapCanvas = document.getElementById('minimap');
    if (minimapCanvas) {
        const padding = 20;
        const w = minimapCanvas.width - padding * 2;
        const h = minimapCanvas.height - padding * 2;
        minimapCx = (maxX + minX) / 2;
        minimapCz = (maxZ + minZ) / 2;
        minimapScale = Math.min(w / (maxX - minX), h / (maxZ - minZ));
        
        minimapTrackPoints = curve.points.map(p => ({
            x: (minimapCanvas.width / 2) + (p.x - minimapCx) * minimapScale,
            y: (minimapCanvas.height / 2) + (p.z - minimapCz) * minimapScale
        }));
    }

    // --- Weather & Time HUD Update ---
    const weatherIcons = { 'clear': '☀️', 'rain': '🌧️', 'snow': '❄️' };
    const timeStrings = { 'day': '10:00 ', 'sunset': '17:30 ', 'night': '23:00 ' };
    const envEle = document.getElementById('env-val');
    if (envEle) {
        envEle.innerHTML = `${weatherIcons[currentTheme.weather] || '☁️'} ${timeStrings[currentTheme.timeOfDay] || '12:00 '}`;
    }
    } finally {
        Math.random = originalMathRandom;
    }
}

// Initial Build
buildScene('underwater', 'day', 'clear');

// --- Input & Boost ---
window.addEventListener('keydown', (e) => { 
    if (e.code === 'KeyS' && isRiding && currentLevelConfig) saveCurrentTrack();
    if (e.code === 'Space') isBoosting = true; 
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') playerLane = -1;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') playerLane = 1;
});
window.addEventListener('keyup', (e) => { 
    if (e.code === 'Space') isBoosting = false; 
});
window.addEventListener('mousedown', (e) => { 
    if (e.target.id === 'save-btn') return;
    if (e.clientX < window.innerWidth / 2) playerLane = -1;
    else playerLane = 1;
});
window.addEventListener('touchstart', (e) => { 
    if (e.target.id === 'save-btn') return;
    if (e.touches.length > 1) {
        isBoosting = true; 
    } else {
        if (e.touches[0].clientX < window.innerWidth / 2) playerLane = -1;
        else playerLane = 1;
    }
});
window.addEventListener('touchend', (e) => { 
    if (e.touches.length < 2) isBoosting = false; 
});

let isDebug = false;
document.getElementById('debug-btn').addEventListener('click', () => {
    isDebug = !isDebug;
    const panel = document.getElementById('debug-panel');
    const btn = document.getElementById('debug-btn');
    if (isDebug) {
        panel.classList.remove('hidden');
        btn.style.color = '#0f0'; btn.style.borderColor = '#0f0';
    } else {
        panel.classList.add('hidden');
        btn.style.color = '#aaa'; btn.style.borderColor = '#555';
    }
});

document.getElementById('close-inst-btn').addEventListener('click', () => {
    const inst = document.getElementById('instructions-overlay');
    inst.style.display = 'none';
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

document.getElementById('menu-btn').addEventListener('click', () => {
    if(!isRiding) return;
    isRiding = false;
    rideProgress = 0;
    document.getElementById('advanced-hud').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    document.getElementById('start-screen').style.opacity = '1';
    document.getElementById('menu-btn').style.display = 'none';
    const bUI = document.getElementById('boost-alert');
    if(bUI) bUI.classList.add('hidden');
    const bgMusic = document.getElementById('bg-music');
    if (bgMusic) {
        bgMusic.pause();
        bgMusic.currentTime = 0;
    }
});

let audioEnabled = true;
document.getElementById('audio-toggle-btn').addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    const btn = document.getElementById('audio-toggle-btn');
    btn.innerText = audioEnabled ? '🔊 AUDIO: ON' : '🔇 AUDIO: OFF';
    
    const bgMusic = document.getElementById('bg-music');
    if (audioEnabled) {
        if (isRiding) bgMusic.play().catch(e=>console.log(e));
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } else {
        bgMusic.pause();
    }
});

// --- Seed Slot System (Save/Load) ---
function getSavedTracks() {
    try {
        const data = localStorage.getItem('neon_coaster_saves');
        if (data) return JSON.parse(data);
    } catch(e) {}
    
    // Provide 5 flawless default curated seeds if no saves exist
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
    if (!currentLevelConfig) return;
    const slotStr = prompt("Save this track? \nEnter Slot Number (1 to 5):", "1");
    if(!slotStr) return;
    const slotNum = parseInt(slotStr);
    if(isNaN(slotNum) || slotNum < 1 || slotNum > 5) { alert("Invalid slot number! Use 1 to 5."); return; }
    
    const name = prompt("Enter a name for this track:", `Epic Track ${slotNum}`);
    if(!name) return;
    
    const saves = getSavedTracks();
    const saveObj = { slot: slotNum, name: name, config: currentLevelConfig };
    
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
window.addEventListener('load', populateSavedTracksUI);
const saveBtn = document.getElementById('save-btn');
if (saveBtn) saveBtn.addEventListener('click', saveCurrentTrack);

function handleSettingChange() {
    const sSelect = document.getElementById('saved-tracks-select');
    if(sSelect) sSelect.value = ""; // Clear save selection if user manual tweaks
    buildScene(document.getElementById('theme-select').value, document.getElementById('time-select').value, document.getElementById('weather-select').value);
}
document.getElementById('theme-select').addEventListener('change', handleSettingChange);
document.getElementById('time-select').addEventListener('change', handleSettingChange);
document.getElementById('weather-select').addEventListener('change', handleSettingChange);

const savedTracksSelect = document.getElementById('saved-tracks-select');
if (savedTracksSelect) {
    savedTracksSelect.addEventListener('change', (e) => {
        if(e.target.value !== "") {
            const conf = JSON.parse(e.target.value);
            document.getElementById('theme-select').value = conf.theme;
            document.getElementById('time-select').value = conf.time;
            document.getElementById('weather-select').value = conf.weather;
            buildScene(conf.theme, conf.time, conf.weather, conf.seed);
        } else {
            handleSettingChange();
        }
    });
}


// --- Animation & Movement ---
const clock = new THREE.Clock();

function updateMinimap() {
    const canvas = document.getElementById('minimap');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw track path
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.4)';
    ctx.lineWidth = 1.5;
    minimapTrackPoints.forEach((pt, i) => {
        if(i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();
    ctx.stroke();
    
    // Draw player position blip
    const bp = curve.getPointAt(rideProgress);
    const px = (canvas.width / 2) + (bp.x - minimapCx) * minimapScale;
    const py = (canvas.height / 2) + (bp.z - minimapCz) * minimapScale;
    
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI*2);
    ctx.fillStyle = '#ff00ea';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ff00ea';
    ctx.fill();
    ctx.shadowBlur = 0;
}

function animate() {
    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    for(const anim of animatedObjects) { anim.update(time, delta); }

    if(weatherParticles) {
        if(currentWeather === 'rain') {
            weatherParticles.position.z = (time * (currentSpeed * 10000 + 50)) % 150; 
        } else {
            weatherParticles.position.copy(camera.position); 
            const pos = weatherParticles.geometry.attributes.position.array;
            for(let i=0; i<pos.length; i+=3) {
                if(currentWeather === 'snow') {
                    pos[i+1] -= delta * 15; 
                    pos[i] += Math.sin(time + i)*0.05; 
                    if(pos[i+1] < -200) pos[i+1] = 200;
                }
            }
            weatherParticles.geometry.attributes.position.needsUpdate = true;
        }
    }

    // Update Coin Particles
    for(let i = coinParticlesData.length - 1; i >= 0; i--) {
        const p = coinParticlesData[i];
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
            coinParticlesData.splice(i, 1);
        }
    }

    if (isRiding) {
        lastProgress = rideProgress;
            const bUI = document.getElementById('boost-alert');
            if (isBoosting) {
                targetSpeed = baseSpeed * 3.5;
                bUI.classList.remove('hidden');
                headLight.intensity = 60; 
                headLight.color.setHex(currentTheme.accent[1] || 0xffffff);
            } else {
                targetSpeed = baseSpeed;
                bUI.classList.add('hidden');
                headLight.intensity = currentTheme.type === 'sky' ? 0 : 25; 
                headLight.color.setHex(0xffffff);
            }

            currentSpeed = THREE.MathUtils.lerp(currentSpeed, targetSpeed, delta * 3);
            const tangent = curve.getTangentAt(rideProgress).normalize();
            
            const slopeImpact = -tangent.y; 
            currentSpeed += slopeImpact * baseSpeed * 1.66 * delta; // Frame-rate independent gravity scaled to speed
            currentSpeed = Math.max(0.0001, Math.min(currentSpeed, baseSpeed * 6.5));
            
            // Critical Physics Update: Advance progress before checking collisions!
            rideProgress += currentSpeed * delta * 60; 

            // Boost Rings Collision check
            const mapP = rideProgress % 1.0;
            const lastP = lastProgress % 1.0;
            const crossedInterval = (rT) => (lastP <= rT && mapP >= rT) || (lastP > mapP && (rT >= lastP || rT <= mapP));

            for (let r of boostRingsData) {
                if (r.active && crossedInterval(r.t)) {
                    r.active = false;
                    r.ring.visible = false;
                    currentSpeed += baseSpeed * 15.0; // Hyper boost burst!
                    if (audioCtx) {
                        const osc = audioCtx.createOscillator();
                        osc.type = 'square';
                        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
                        osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.3);
                        const gain = audioCtx.createGain();
                        gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
                        osc.connect(gain); gain.connect(audioCtx.destination);
                        osc.start(); osc.stop(audioCtx.currentTime + 0.3);
                    }
                }
            }
            
            // Coins Collision check
            for (let c of coinsData) {
                if (c.active && crossedInterval(c.t)) {
                    // Give a very generous hitbox (magnet effect) to prevent missing
                    const laneDist = Math.abs(currentLaneOffset - (c.lane * 2.2));
                    if (laneDist < 1.5) { // Magnetic hitbox but still requires steering towards the lane
                        c.active = false;
                        c.coin.visible = false;
                        
                        // 1. Screen projection for flying coin UI
                        // Collecting happens right when the coin passes the camera, 
                        // so project() might break. Spawning from the car hood is completely fail-safe.
                        const sx = window.innerWidth * 0.5;
                        const sy = window.innerHeight * 0.6;
                        
                        const floatingCoin = document.createElement('div');
                        floatingCoin.className = 'floating-coin';
                        floatingCoin.style.left = sx + 'px';
                        floatingCoin.style.top = sy + 'px';
                        document.body.appendChild(floatingCoin);
                        
                        // Force reflow
                        void floatingCoin.offsetWidth;
                        
                        // Target score HUD position
                        const scoreUI = document.getElementById('score-ui');
                        const scoreRect = scoreUI.getBoundingClientRect();
                        const tx = scoreRect.left + scoreRect.width/2;
                        const ty = scoreRect.top + scoreRect.height/2;
                        
                        floatingCoin.style.transform = `translate(${tx - sx}px, ${ty - sy}px) scale(0.5)`;
                        
                        setTimeout(() => {
                            if (document.body.contains(floatingCoin)) floatingCoin.remove();
                            // Delay score increment until coin reaches HUD
                            score += 100;
                            document.getElementById('score-val').innerText = score;
                            scoreUI.classList.remove('score-bounce');
                            void scoreUI.offsetWidth; 
                            scoreUI.classList.add('score-bounce');
                        }, 500);
                        
                        // 2. Play satisfying coin sound (Classic B5 -> E6 arpeggio)
                        if (audioCtx && audioEnabled) {
                            const osc = audioCtx.createOscillator();
                            const gain = audioCtx.createGain();
                            osc.connect(gain); gain.connect(audioCtx.destination);
                            osc.type = 'sine';
                            osc.frequency.setValueAtTime(987.77, audioCtx.currentTime); // B5
                            osc.frequency.exponentialRampToValueAtTime(1318.51, audioCtx.currentTime + 0.08); // E6 slide
                            gain.gain.setValueAtTime(0, audioCtx.currentTime);
                            gain.gain.linearRampToValueAtTime(1.0, audioCtx.currentTime + 0.02); // Maximum volume before distortion
                            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
                            osc.start(audioCtx.currentTime);
                            osc.stop(audioCtx.currentTime + 0.35);
                        }
                        
                        // Particle Explosion
                        const pGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
                        const pMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
                        for(let pk=0; pk<15; pk++) {
                            const p = new THREE.Mesh(pGeo, pMat);
                            p.position.copy(c.coin.position);
                            const vel = new THREE.Vector3(
                                (Math.random() - 0.5) * 30,
                                Math.random() * 25 + 5,
                                (Math.random() - 0.5) * 30
                            );
                            scene.add(p);
                            coinParticlesData.push({ mesh: p, vel: vel, life: 1.0 });
                        }
                    }
                }
                if (c.active) {
                    c.coin.rotation.z += delta * 6.0; // Dynamic spinning
                }
            }

            // Time Lapse Progression
            if (currentDirLight && scene.background) {
                const dayNight = Math.PI * (rideProgress / 2.0); // 2 full laps required to finish day cycle
                const sunH = Math.sin(dayNight);
                currentDirLight.position.set(Math.cos(dayNight) * 300, sunH * 200 - 20, 100);
                if (sunH > 0.3) {
                    currentDirLight.color.setHex(0xffffff);
                    scene.backgroundIntensity = 1.0;
                } else if (sunH > 0) {
                    currentDirLight.color.setHex(0xff8844); // Sunset
                    scene.backgroundIntensity = Math.max(0.2, sunH / 0.3);
                } else {
                    currentDirLight.color.setHex(0x111133); // Night
                    scene.backgroundIntensity = 0.2;
                }
            }
            
            // Loop completion logic - 2 Laps to Finish!
            if (rideProgress >= 2) {
                isRiding = false;
                rideProgress = 0;
                document.getElementById('advanced-hud').classList.add('hidden');
                document.getElementById('start-screen').classList.remove('hidden');
                setTimeout(() => { document.getElementById('start-screen').style.opacity = '1'; }, 50);
                
                const menuB = document.getElementById('menu-btn');
                if (menuB) menuB.style.display = 'none';
                
                const bgMusic = document.getElementById('bg-music');
                if (bgMusic) {
                    bgMusic.pause();
                    bgMusic.currentTime = 0;
                }
            }

        const mappedProgress = rideProgress % 1.0;
        const rawIndex = mappedProgress * TRACK_SEGMENTS;
        const i = Math.floor(rawIndex);
        const nextIndex = (i + 1) % TRACK_SEGMENTS;
        const weight = rawIndex - i;
        
        const binormal = new THREE.Vector3();
        binormal.lerpVectors(frames.binormals[i], frames.binormals[nextIndex], weight).normalize();
        
        const camPos = new THREE.Vector3();
        camPos.lerpVectors(curve.getPointAt(i / TRACK_SEGMENTS), curve.getPointAt(nextIndex / TRACK_SEGMENTS), weight);
        const lookPos = curve.getPointAt((mappedProgress + 0.005) % 1.0);
        
        const normal = new THREE.Vector3();
        normal.lerpVectors(frames.normals[i], frames.normals[nextIndex], weight).normalize();
        
        camPos.addScaledVector(normal, 1.2);
        
        // --- Lane Offset Physics ---
        const targetOffset = playerLane * 2.2; 
        currentLaneOffset = THREE.MathUtils.lerp(currentLaneOffset, targetOffset, delta * 12);
        camPos.addScaledVector(binormal, currentLaneOffset); 
        
        // Cart Lean relative to steering difference
        const laneDelta = targetOffset - currentLaneOffset;
        cartGroup.rotation.z = -laneDelta * 0.08; 
        cartGroup.rotation.y = -laneDelta * 0.05;

        for (const w of wheelsData) {
            w.rotation.x -= currentSpeed * delta * 1500;
        }
        
        if (renderer.xr.isPresenting) {
            playerRig.position.copy(camPos);
            lookPos.addScaledVector(normal, 1.2);
            lookPos.addScaledVector(binormal, currentLaneOffset * 0.82);
            playerRig.up.copy(normal);
            playerRig.lookAt(lookPos);
            
            // Smart VR Height Constraint
            // Some platforms provide 'local' (Y=0), others provide 'local-floor' (Y=1.6).
            // This detects if the player is "standing" and gracefully lowers the anchor so they sit exactly inside the cart!
            if (camera.position.y > 0.8 && window.vrHeightOffset === 0) {
                 window.vrHeightOffset = -1.5; 
            }
            xrRig.position.y = THREE.MathUtils.lerp(xrRig.position.y, window.vrHeightOffset, delta * 2);
            
        } else {
            camera.position.copy(camPos);
            lookPos.addScaledVector(normal, 1.2);
            lookPos.addScaledVector(binormal, currentLaneOffset * 0.82);
            camera.up.copy(normal);
            camera.lookAt(lookPos);
        }
        
        const targetFov = 80 + (currentSpeed * 60000);
        camera.fov = THREE.MathUtils.lerp(camera.fov, Math.min(130, targetFov), delta * 4);
        camera.updateProjectionMatrix();

        // Update Audio Synthesis
        if(engineAudio) {
            engineAudio.filter.frequency.value = 50 + (currentSpeed * 200000);
            engineAudio.gainNode.gain.value = Math.min(1.0, currentSpeed * 2000);
        }

        // Update HUD
        const displaySpeed = Math.floor(currentSpeed * 100000);
        document.getElementById('speed-val').innerHTML = `${displaySpeed}<span> km/h</span>`;
        
        const accelRatio = Math.min(100, (currentSpeed / (baseSpeed * 4)) * 100);
        document.getElementById('accel-bar').style.width = `${accelRatio}%`;

        const displayAlt = Math.floor(camPos.y + 100); 
        document.getElementById('alt-val').innerHTML = `${displayAlt}<span> m</span>`;

        const tz = tangent.z; const tx = tangent.x;
        let heading = Math.atan2(tx, tz);
        let deg = Math.floor((heading * 180 / Math.PI + 180));
        document.getElementById('head-val').innerHTML = `${deg}<span> &deg;</span>`;
        document.getElementById('compass').style.transform = `translateX(${-deg * 2}px)`;

        const gForceRaw = 1.0 + (slopeImpact * 2.0) + ((targetSpeed - currentSpeed) * 500);
        const gForce = Math.max(0, gForceRaw);
        document.getElementById('gforce-val').innerHTML = `${gForce.toFixed(1)}<span> G</span>`;

        const pitch = Math.asin(Math.max(-1, Math.min(1, tangent.y))); 
        const pitchDeg = pitch * 180 / Math.PI;
        document.getElementById('pitch-ladder').style.transform = `translateY(${pitchDeg * 3}px)`;

        // Indicators
        const localLook = camera.worldToLocal(lookPos.clone());
        const leftIdr = document.getElementById('turn-indicator-left');
        const rightIdr = document.getElementById('turn-indicator-right');
        
        if(localLook.x < -0.15) {
            leftIdr.classList.remove('hidden'); rightIdr.classList.add('hidden');
        } else if(localLook.x > 0.15) {
            rightIdr.classList.remove('hidden'); leftIdr.classList.add('hidden');
        } else {
            leftIdr.classList.add('hidden'); rightIdr.classList.add('hidden');
        }

        const warningAlert = document.getElementById('warning-alert');
        if (gForce > 2.5 || gForce < 0.2) {
            warningAlert.classList.remove('hidden');
        } else {
            warningAlert.classList.add('hidden');
        }

        updateMinimap();

        if (isDebug) {
            const nextCoin = coinsData.find(c => c.active && c.t > (rideProgress % 1.0));
            const activeCoins = coinsData.filter(c => c.active).length;
            document.getElementById('debug-panel').innerHTML = `
=== TELEMETRY ===<br>
RIDE_T: ${(rideProgress % 1.0).toFixed(5)}<br>
LANE_IDX: ${playerLane}<br>
LANE_OFFSET: ${currentLaneOffset.toFixed(2)}<br>
SPD: ${(currentSpeed * 60).toFixed(3)}<br>
COINS_ALIVE: ${activeCoins}<br>
=================<br>
-- NEXT COIN --<br>
C_TIME: ${nextCoin ? nextCoin.t.toFixed(4) : 'N/A'}<br>
C_LANE: ${nextCoin ? nextCoin.lane : 'N/A'} (Offset: ${nextCoin ? (nextCoin.lane * 2.2).toFixed(2) : 'N/A'})<br>
HITBOX_DIST: <span style="color:${(nextCoin && Math.abs(currentLaneOffset - (nextCoin.lane * 2.2)) < 1.5) ? '#0f0' : '#f00'}">${nextCoin ? Math.abs(currentLaneOffset - (nextCoin.lane * 2.2)).toFixed(3) : 'N/A'}</span> (Must be < 1.5 to collect!)
            `;
        }

    } else {
        if (renderer.xr.isPresenting) {
            playerRig.position.set(Math.sin(time * 0.2)*120, 50, Math.cos(time * 0.2)*120);
            playerRig.lookAt(0, 0, 0);
        } else {
            camera.position.set(Math.sin(time * 0.2)*120, 50, Math.cos(time * 0.2)*120);
            camera.lookAt(0, 0, 0);
        }
    }
    
    // Animate Speed Lines and Depth of Field
    if (speedLineGroup) {
        let speedLineOpacity = 0;
        if (isRiding && (isBoosting || currentSpeed > baseSpeed * 2.5)) {
            speedLineOpacity = 0.8;
            speedLineGroup.position.z = (time * 800) % 150; // Warp backward past camera natively!
        }
        speedLineGroup.material.opacity = THREE.MathUtils.lerp(speedLineGroup.material.opacity, speedLineOpacity, delta * 8);
    }
    
    // VR vs PC Rendering Pipeline Split
    if (renderer.xr.isPresenting) {
        // WebXR stereo-rendering doesn't support basic EffectComposer. Use raw WebGL.
        renderer.render(scene, camera);
    } else {
        // Desktop / Mobile Screen gets full Neon Bloom Pass
        composer.render();
    }
}

// --- Start ---
window.startGame = function() {
    if (isRiding) return;
    isRiding = true;
    
    baseSpeed = parseFloat(document.getElementById('speed-select').value) || 0.0007;

    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
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
    
        // Explicitly resume Web Audio context
        if (audioCtx && audioCtx.state === 'suspended' && typeof audioEnabled !== 'undefined' && audioEnabled) {
            audioCtx.resume();
        }
        
        targetSpeed = 0;
        currentSpeed = baseSpeed * 1.5; // Provide mechanical launch
        rideProgress = 0.0;
        lastProgress = 0.0;
        score = 0; // Reset Score
        document.getElementById('score-val').innerText = score;
        
        // Reactivate all coins & rings
        if(typeof coinsData !== 'undefined') coinsData.forEach(c => { c.active = true; c.coin.visible = true; });
        if(typeof boostRingsData !== 'undefined') boostRingsData.forEach(r => { r.active = true; r.ring.visible = true; });
        
        const btn = document.getElementById('start-btn');
        if(btn) btn.disabled = false;
        
        const menuBtn = document.getElementById('menu-btn');
        if(menuBtn) menuBtn.style.display = 'block';
    }, 500);
};

document.getElementById('start-btn').addEventListener('click', window.startGame);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(animate);
