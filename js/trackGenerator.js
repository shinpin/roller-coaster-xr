import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { TRACK_POINTS, TRACK_SEGMENTS, THEMES, TIMES } from './config.js';
import { State } from './state.js';
import { trackTexture, arrowTexture, createEnvironmentTexture } from './textures.js';
import { updateEnvironmentUI } from './ui.js';

export let currentDirLight = null;
export let currentHemiLight = null;

export function buildScene(scene, camera, themeKey, timeKey, weatherKey, forceSeed = null) {
    if (themeKey === 'random') {
        const keys = Object.keys(THEMES);
        themeKey = keys[Math.floor(Math.random() * keys.length)];
    }
    
    const activeSeed = forceSeed !== null ? forceSeed : Math.floor(Math.random() * 9999999);
    State.currentLevelConfig = { seed: activeSeed, theme: themeKey, time: timeKey, weather: weatherKey };
    
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
        State.currentTheme = THEMES[themeKey];
        State.currentTime = TIMES[timeKey];
        State.currentWeather = weatherKey;
        
        updateEnvironmentUI();

        const bgmMap = {
            'sky': 'BGM_skytrack_cloud.mp3',
            'land': 'BGM_skytrack_land.mp3',
            'abstract': 'BGM_skytrack_star.mp3',
            'underwater': 'BGM_skytrack_sea.mp3'
        };
        const bgmSrc = bgmMap[State.currentTheme.type] || 'BGM_skytrack_sea.mp3';
        const bgMusic = document.getElementById('bg-music');
        if (bgMusic && !bgMusic.src.includes(bgmSrc)) {
            bgMusic.src = bgmSrc;
            if (State.isRiding && State.audioEnabled) bgMusic.play().catch(e=>console.log(e));
        }

        // Clean slate
        while(scene.children.length > 0){ 
            if(scene.children[0].geometry) scene.children[0].geometry.dispose();
            if(scene.children[0].material) scene.children[0].material.dispose();
            scene.remove(scene.children[0]);
        }
        State.animatedObjects = [];
        State.coinsData = [];
        State.boostRingsData = [];
        State.wheelsData = [];

        // Lighting & Background Generation
        const textureLoader = new THREE.TextureLoader();
        let bgTextureFile = 'PanoGen360_4K_sea.jpg';
        if (themeKey === 'land') bgTextureFile = 'PanoGen360_4K_land.jpg';
        else if (themeKey === 'sky') bgTextureFile = 'PanoGen360_4K_cloud.jpg';
        else if (themeKey === 'synthwave') bgTextureFile = 'PanoGen360_4K_star.jpg';

        textureLoader.load(bgTextureFile + '?v=' + Date.now(), (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.colorSpace = THREE.SRGBColorSpace;
            scene.background = texture;
            scene.environment = texture; 
        });

        const baseBgColor = new THREE.Color(State.currentTheme.bg);
        const modColors = State.currentTime.bgMod;
        baseBgColor.r *= modColors.r;
        baseBgColor.g *= modColors.g;
        baseBgColor.b *= modColors.b;
        
        scene.fog = new THREE.FogExp2(baseBgColor.getHex(), State.currentTheme.fogExp * State.currentTime.fogMod);

        // Dye the environment by using dirCol for ambient light (Sunset orange / Night blue)
        const ambientLight = new THREE.AmbientLight(State.currentTime.dirCol, State.currentTime.ambient * 0.8);
        scene.add(ambientLight);
        
        currentHemiLight = new THREE.HemisphereLight(State.currentTime.dirCol, State.currentTheme.ground, State.currentTime.ambient * 1.2);
        scene.add(currentHemiLight);

        currentDirLight = new THREE.DirectionalLight(State.currentTime.dirCol, (State.currentTheme.type === 'sky' ? 2.5 : 1.5) * State.currentTime.dirLight);
        currentDirLight.position.set(50, 100, 50);
        currentDirLight.castShadow = true;
        currentDirLight.shadow.mapSize.width = 1024;
        currentDirLight.shadow.mapSize.height = 1024;
        
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

        if (State.currentTheme.type !== 'sky' && State.currentTheme.type !== 'land') {
            for (let i=0; i<6; i++) {
                const pColor = new THREE.Color(State.currentTheme.accent[i % State.currentTheme.accent.length]);
                const pLight = new THREE.PointLight(pColor, 5, 120);
                pLight.position.set( (Math.random() - 0.5) * 150, Math.random() * 20 + 5, (Math.random() - 0.5) * 150 );
                scene.add(pLight);
            }
        }

        // Environment Props Generation
        generateEnvironmentProps(scene);
        
        // Track Generation
        generateTrack(scene);

        // Clear existing NPCs
        if (State.npcs) {
            for (let npc of State.npcs) {
                scene.remove(npc.cartGroup);
            }
        }
        State.npcs = [];

        // Generate NPCs
        // Vibrant neon colors
        const npcColors = [0x00FFFF, 0xFF00FF, 0xFFFF00, 0x00FF00, 0xFF6600];
        for (let i = 0; i < 3; i++) {
            const driverNum = "0" + (i + 2); // 02, 03, 04...
            const { cartGroup, wheelsData } = createCartModel(npcColors[i % npcColors.length], true, driverNum);
            // Convert cartGroup materials to transparent / hologram-like? User requested collisions + random lane. 
            // We'll leave them fully opaque for realism since they collide!
            scene.add(cartGroup);
            
            State.npcs.push({
                cartGroup,
                wheelsData,
                rideProgress: Math.random() * 0.15 + 0.05, // start slightly ahead
                baseSpeed: State.baseSpeed * (0.65 + Math.random() * 0.25), // Slower! 65% ~ 90% of base speed
                currentSpeed: State.baseSpeed,
                lane: Math.random() > 0.5 ? 1 : -1,
                laneOffset: 0,
                nextLaneDecisionTime: 0
            });
        }

    } finally {
        Math.random = originalMathRandom;
    }
}

function generateEnvironmentProps(scene) {
    if (State.weatherParticles) State.weatherParticles.geometry.dispose();
    if (State.currentWeather !== 'clear') {
        const pCount = State.currentWeather === 'rain' ? 5600 : 800;
        const pGeo = new THREE.BufferGeometry();
        const pPos = new Float32Array(pCount * 3);
        for(let i=0; i<pCount*3; i+=3) {
            pPos[i] = (Math.random() - 0.5) * 400; 
            pPos[i+1] = (Math.random() - 0.5) * 400; 
            pPos[i+2] = (Math.random() - 0.5) * 400; 
        }
        pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
        
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
                ctx.lineWidth = 2; 
                ctx.beginPath(); ctx.moveTo(32, 16); ctx.lineTo(32, 48); ctx.stroke();
            }
            return new THREE.CanvasTexture(canvas);
        }
        
        if(State.currentWeather === 'rain') {
            const rCount = 2500;
            const rGeo = new THREE.CylinderGeometry(0.015, 0.015, 12, 3);
            // Removed rotateX so rain points vertically down (Y-axis)
            const rMat = new THREE.MeshBasicMaterial({ color: 0xaaccff, transparent: true, opacity: 0.5 });
            State.weatherParticles = new THREE.InstancedMesh(rGeo, rMat, rCount);
            const tObj = new THREE.Object3D();
            for(let i=0; i<rCount; i++) {
                // Spawn rain in a box above the player's head (Y: 0 to 150)
                tObj.position.set((Math.random()-0.5)*150, Math.random()*150, (Math.random()-0.5)*150);
                tObj.updateMatrix();
                State.weatherParticles.setMatrixAt(i, tObj.matrix);
            }
        } else {
            const pMat = new THREE.PointsMaterial({ 
                color: new THREE.Color(0xffffff).multiplyScalar(1.5), 
                size: 2.25, transparent: true, opacity: 0.9, 
                map: createParticleTex('snow'), blending: THREE.AdditiveBlending 
            });
            State.weatherParticles = new THREE.Points(pGeo, pMat);
        }
        scene.add(State.weatherParticles);
    } else {
        State.weatherParticles = null;
    }

    const groundGeo = new THREE.PlaneGeometry(1200, 1200, 64, 64);
    const posAttribute = groundGeo.attributes.position;
    for (let i=0; i<posAttribute.count; i++) {
        const x = posAttribute.getX(i);
        const y = posAttribute.getY(i);
        const dist = Math.sqrt(x*x + y*y);
        let z = 0;
        if (dist > 50) {
            z = (dist - 50) * Math.random() * 0.6; 
            if (State.currentTheme.type === 'land') z = Math.sin(x*0.015) * Math.cos(y*0.015) * 12; 
            if (State.currentTheme.type === 'underwater') z += Math.random() * 8; 
        }
        posAttribute.setZ(i, z);
    }
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({ 
        color: State.currentTheme.ground,
        roughness: State.currentTheme.type === 'underwater' ? 0.7 : 0.9, 
        metalness: 0.1,
        wireframe: State.currentTheme.groundWire 
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = State.currentTheme.type === 'sky' ? -150 : -60; 
    ground.receiveShadow = true;
    if (State.currentTheme.type !== 'sky' && State.currentTheme.type !== 'abstract') {
        scene.add(ground);
    }

    // Biome Props
    if (State.currentTheme.type === 'underwater') {
        const bubbleGeo = new THREE.SphereGeometry(1, 16, 16);
        const bubbleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.5), transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.8 });
        for(let i=0; i<100; i++) {
            const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
            const scale = Math.random() * 0.8 + 0.2;
            bubble.scale.set(scale, scale, scale);
            bubble.position.set((Math.random() - 0.5) * 400, (Math.random() * 200) - 20, (Math.random() - 0.5) * 400);
            scene.add(bubble);
            State.animatedObjects.push({
                obj: bubble,
                update: (time, delta) => {
                    bubble.position.y += delta * 15 * scale;
                    bubble.position.x += Math.sin(time + i) * 0.1;
                    if (bubble.position.y > 200) bubble.position.y = -20;
                }
            });
        }
        const fishGeo = new THREE.ConeGeometry(0.8, 4, 8);
        fishGeo.rotateX(Math.PI / 2); 
        const fishMat = new THREE.MeshStandardMaterial({ color: 0xff8800, roughness: 0.4 });
        for(let i=0; i<40; i++) {
            const fish = new THREE.Mesh(fishGeo, fishMat);
            const r = Math.random() * 120 + 20;
            const yOffset = Math.random() * 100 - 10;
            const speed = Math.random() * 0.4 + 0.2;
            scene.add(fish);
            State.animatedObjects.push({
                obj: fish,
                update: (time) => {
                    const angle = time * speed + i;
                    fish.position.set(Math.cos(angle) * r, yOffset + Math.sin(time*1.5+i)*4, Math.sin(angle) * r);
                    const nextAngle = angle + 0.05;
                    fish.lookAt(Math.cos(nextAngle) * r, fish.position.y, Math.sin(nextAngle) * r);
                }
            });
        }
    } else if (State.currentTheme.type === 'sky') {
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
        const islandGeo = new THREE.CylinderGeometry(25, 10, 10, 7);
        const topMat = new THREE.MeshStandardMaterial({ color: 0x88cc55, roughness: 0.9 });
        const bottomMat = new THREE.MeshStandardMaterial({ color: 0x775533, roughness: 1.0 });
        for(let i=0; i<25; i++) {
           const island = new THREE.Mesh(islandGeo, [topMat, bottomMat, bottomMat]); 
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
            State.animatedObjects.push({
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
    } else if (State.currentTheme.type === 'land') {
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
        const pyraGeo = new THREE.ConeGeometry(120, 150, 4);
        const pyraMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff00ea).multiplyScalar(2), wireframe: true });
        for(let i=0; i<8; i++) {
           const p = new THREE.Mesh(pyraGeo, pyraMat);
           const angle = (i/8) * Math.PI * 2;
           p.position.set(Math.cos(angle)*500, 55, Math.sin(angle)*500);
           scene.add(p);
        }
        const orbGeo = new THREE.TetrahedronGeometry(3);
        const accentColors = ['#ff00ea', '#00f3ff', '#00ffaa'];
        for (let i = 0; i < 60; i++) {
            const colorRaw = new THREE.Color(accentColors[i % accentColors.length]);
            const orbMat = new THREE.MeshStandardMaterial({ color: colorRaw, emissive: colorRaw.multiplyScalar(3), emissiveIntensity: 1.0, flatShading: true });
            const mesh = new THREE.Mesh(orbGeo, orbMat);
            mesh.position.set( (Math.random() - 0.5) * 300, (Math.random() * 100) - 10, (Math.random() - 0.5) * 300 );
            scene.add(mesh);
            State.animatedObjects.push({
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
}

function generateTrack(scene) {
    State.curve = new THREE.CatmullRomCurve3();
    const pts = [];

    // ── Expanding polar-spiral track generation ───────────────
    // numLoops full rotations around the centre.
    const numLoops    = Math.floor(Math.random() * 4) + 3; // 3 – 6 loops
    const baseRadius  = 30;
    const expandPerLp = 15;  // world-units added per full rotation (> track half-width)
    const localWiggle =  3;  // small per-point deviation  (must be < expandPerLp/2)

    // Height: 3 visible "layers" (storeys).
    // Toned down randomly generated variation per user request.
    // layerSpacing goes from old 20 to 20~35.
    const layerSpacing  = 20 + (Math.random() * 15); 
    const localWaveAmp  = 6 + (Math.random() * 6); 
    const layerCycles   = 1.0 + Math.random() * 1.0;   // 1.0 to 2.0 cycles
    
    const flatFraction  = 0.15; // 0–15 %: flat launch section
    const rampZoneEnd   = 0.30; // 15–30 %: dramatic high-variation entry zone

    for (let i = 0; i < TRACK_POINTS; i++) {
        const t     = i / TRACK_POINTS;
        const angle = t * Math.PI * 2 * numLoops;

        // Radius grows steadily → each loop pass is expandPerLp further out.
        const radius = baseRadius
                     + t * numLoops * expandPerLp
                     + Math.sin(angle * 2) * localWiggle;

        // ── Height ──────────────────────────────────────────────────────────
        let height;
        if (t < flatFraction) {
            // 0–15 %: truly flat launch
            height = 0;

        } else {
            const ta = (t - flatFraction) / (1 - flatFraction); // 0 → 1 after flat
            
            // Randomize the main storey hills 
            const layerWave = Math.sin(ta * Math.PI * 2 * layerCycles) * layerSpacing;
            
            // Fast local oscillation for bumps & dips 
            const localWave = Math.sin(ta * Math.PI * 2 * numLoops * 0.55) * localWaveAmp
                            + Math.cos(ta * Math.PI * 2 * numLoops * 0.28) * localWaveAmp * 0.35;

            if (t < rampZoneEnd) {
                // 15–30 %: dramatic entry — amplitude grows fast from zero.
                const zoneT  = (t - flatFraction) / (rampZoneEnd - flatFraction); // 0 → 1
                const growIn = zoneT * zoneT;  // quadratic ramp-in 0→1
                // Dynamic shake that scales with our new larger layerSpacing
                const shake  = Math.sin(zoneT * Math.PI * 3) * layerSpacing * 0.7 * zoneT;
                height = (layerWave + localWave) * growIn + shake;
            } else {
                // 30–100 %: normal wave.
                height = layerWave + localWave;
            }
        }

        const baseY = State.currentTheme.type === 'sky' ? height + 60 : height;
        pts.push(new THREE.Vector3(
            Math.cos(angle) * radius,
            baseY,
            Math.sin(angle) * radius
        ));
    }


    // ── Close the loop (smoothly blend last 20 % back to pt[0]) ─────────────
    // The spiral ends at a larger radius than it started; smoothstep pulls
    // the tail back so CatmullRom closes without a visible seam.
    const blendStart = Math.floor(TRACK_POINTS * 0.80);
    for (let i = blendStart; i < TRACK_POINTS; i++) {
        const alpha  = (i - blendStart) / (TRACK_POINTS - blendStart);
        const smooth = alpha * alpha * (3 - 2 * alpha); // smoothstep
        pts[i].x = THREE.MathUtils.lerp(pts[i].x, pts[0].x, smooth);
        pts[i].z = THREE.MathUtils.lerp(pts[i].z, pts[0].z, smooth);
        pts[i].y = THREE.MathUtils.lerp(pts[i].y, pts[0].y, smooth);
    }

    // ── Safety self-intersection pass ────────────────────────────────────────
    // The spiral is naturally non-self-intersecting in XZ; this corrects
    // any residual proximity introduced by the blend-back zone or local wiggle.
    const hClearance = 8.0;
    const vClearance = 5.0;
    const hClearSq   = hClearance * hClearance;
    const SKIP_NEAR  = 18;
    let   skipUntil  = 0;

    for (let i = SKIP_NEAR; i < TRACK_POINTS; i++) {
        if (i < skipUntil) continue;
        for (let j = 0; j < i - SKIP_NEAR; j++) {
            const dx = pts[i].x - pts[j].x;
            const dz = pts[i].z - pts[j].z;
            const hDistSq = dx * dx + dz * dz;
            if (hDistSq < hClearSq) {
                const dy = pts[i].y - pts[j].y;
                if (Math.abs(dy) < vClearance) {
                    const pushUp  = (vClearance - Math.abs(dy)) * (dy >= 0 ? 1 : -1);
                    const hDist   = Math.sqrt(hDistSq) + 0.001;
                    const pushOut = (hClearance - hDist) * 0.5;
                    const nx = dx / hDist, nz = dz / hDist;
                    for (let k = -12; k <= 12; k++) {
                        const idx     = (i + k + TRACK_POINTS) % TRACK_POINTS;
                        const falloff = 1.0 - Math.abs(k) / 12;
                        pts[idx].y += pushUp  * falloff * 1.2;
                        pts[idx].x += nx * pushOut * falloff;
                        pts[idx].z += nz * pushOut * falloff;
                    }
                    skipUntil = i + 30;
                    break;
                }
            }
        }
    }


    State.curve.points = pts;
    State.curve.closed = true;
    State.curve.updateArcLengths();
    State.frames = State.curve.computeFrenetFrames(TRACK_SEGMENTS, true);

    for (let i = 0; i <= TRACK_SEGMENTS; i++) {
        const t = State.frames.tangents[i];
        let right = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0));
        if (right.lengthSq() < 0.01) right.crossVectors(t, new THREE.Vector3(1, 0, 0));
        right.normalize();
        const uprightNormal = new THREE.Vector3().crossVectors(right, t).normalize();
        State.frames.normals[i].copy(uprightNormal);
        State.frames.binormals[i].copy(right);
    }

    const trackGeo = new THREE.BufferGeometry();
    const vertices = [];
    const uvs = [];
    const indices = [];
    const hw = 2.8; 
    const ht = 0.2; 
    
    for (let i = 0; i <= TRACK_SEGMENTS; i++) {
        const u = i / TRACK_SEGMENTS;
        const pt = State.curve.getPointAt(u);
        const normal = State.frames.normals[i];
        const right = State.frames.binormals[i];
        const trackCenter = pt.clone().addScaledVector(normal, -0.15);
        
        const tr = trackCenter.clone().addScaledVector(right, hw).addScaledVector(normal, ht);
        const tl = trackCenter.clone().addScaledVector(right, -hw).addScaledVector(normal, ht);
        const bl = trackCenter.clone().addScaledVector(right, -hw).addScaledVector(normal, -ht);
        const br = trackCenter.clone().addScaledVector(right, hw).addScaledVector(normal, -ht);
        
        vertices.push(tr.x, tr.y, tr.z, tl.x, tl.y, tl.z, bl.x, bl.y, bl.z, br.x, br.y, br.z);
        const uvY = i * 0.1; 
        uvs.push(1, uvY, 0, uvY, 0, uvY, 1, uvY); 
    }
    
    for (let i = 0; i < TRACK_SEGMENTS; i++) {
        const row1 = i * 4;
        const row2 = (i + 1) * 4;
        indices.push(row1 + 1, row1 + 0, row2 + 0, row1 + 1, row2 + 0, row2 + 1);
        indices.push(row1 + 3, row1 + 2, row2 + 2, row1 + 3, row2 + 2, row2 + 3);
        indices.push(row1 + 0, row1 + 3, row2 + 3, row1 + 0, row2 + 3, row2 + 0);
        indices.push(row1 + 2, row1 + 1, row2 + 1, row1 + 2, row2 + 1, row2 + 2);
    }
    
    trackGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    trackGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    trackGeo.setIndex(indices);
    trackGeo.computeVertexNormals();
    
    let overlayColor = 0xffffff;
    if(State.currentTheme.type === 'underwater') overlayColor = 0xaaccff;
    if(State.currentTheme.type === 'land') overlayColor = 0xddbb99;
    
    const trackMat = new THREE.MeshStandardMaterial({ map: trackTexture, color: overlayColor, roughness: 0.8, metalness: 0.2 });
    const trackMain = new THREE.Mesh(trackGeo, trackMat);
    trackMain.castShadow = true; trackMain.receiveShadow = true;
    scene.add(trackMain);

    const neonGeoLeft = new THREE.TubeGeometry(State.curve, TRACK_SEGMENTS, 0.16, 4, true);
    const neonGeoRight = new THREE.TubeGeometry(State.curve, TRACK_SEGMENTS, 0.16, 4, true);
    const leftPositions = neonGeoLeft.attributes.position.array;
    const rightPositions = neonGeoRight.attributes.position.array;
    
    for (let i = 0; i < TRACK_SEGMENTS; i++) {
        const binormal = State.frames.binormals[i];
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

    let neonCol = new THREE.Color(State.currentTheme.track).multiplyScalar(5.0);
    const neonMat = new THREE.MeshBasicMaterial({ color: neonCol });
    scene.add(new THREE.Mesh(neonGeoLeft, neonMat));
    scene.add(new THREE.Mesh(neonGeoRight, neonMat));

    const turnIndicatorGeo = new THREE.PlaneGeometry(16, 16); 
    const turnIndicatorMat = new THREE.MeshBasicMaterial({ 
        map: arrowTexture, transparent: true, opacity: 0.8, 
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const turnsGroup = new THREE.Group();
    scene.add(turnsGroup);

    let lastArrowSpawn = -1000;
    const sleeperCount = TRACK_POINTS * 4;
    const sleeperGeo = new THREE.BoxGeometry(6.8, 0.3, 0.8); 
    const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.3, metalness: 0.6 });
    const sleepersGroup = new THREE.InstancedMesh(sleeperGeo, sleeperMat, sleeperCount);
    let sleeperIndex = 0;
    for (let i = 0; i < sleeperCount; i++) {
        const t = i / sleeperCount;
        const pos = State.curve.getPointAt(t);
        const tangent = State.curve.getTangentAt(t).normalize();
        
        const rawI = t * TRACK_SEGMENTS;
        const fi = Math.floor(rawI);
        const nw = Math.max(0, Math.min(1, rawI - fi)); 
        const nextFi = (fi + 1) % TRACK_SEGMENTS;
        
        const normal = new THREE.Vector3();
        normal.lerpVectors(State.frames.normals[fi], State.frames.normals[nextFi], nw).normalize();
        const axis = new THREE.Vector3().crossVectors(normal, tangent).normalize();
        
        const matrix = new THREE.Matrix4();
        matrix.makeBasis(axis, normal, tangent);
        matrix.setPosition(pos.x, pos.y, pos.z);
        sleepersGroup.setMatrixAt(sleeperIndex++, matrix);

        if (i % 8 === 0 && (i - lastArrowSpawn) > 800) { 
            const tPrev = State.curve.getTangentAt(Math.max(0, t - 0.04));
            const tNext = State.curve.getTangentAt(Math.min(1, t + 0.04));
            const turnSharpness = tPrev.x * tNext.z - tPrev.z * tNext.x; 

            if (Math.abs(turnSharpness) > 0.030) {
                lastArrowSpawn = i; 
                const arrowMesh = new THREE.Mesh(turnIndicatorGeo, turnIndicatorMat.clone());
                const sideShift = turnSharpness < -0.030 ? -6.0 : 6.0; 
                arrowMesh.position.copy(pos).addScaledVector(normal, 2.5).addScaledVector(axis, sideShift);
                arrowMesh.lookAt(pos.clone().sub(tangent));
                
                if (turnSharpness < -0.030) {
                    arrowMesh.rotateZ(Math.PI / 2); 
                    arrowMesh.material.color.setHex(0xffaa00);
                } else {
                    arrowMesh.rotateZ(-Math.PI / 2); 
                    arrowMesh.material.color.setHex(0x00ffcc);
                }
                turnsGroup.add(arrowMesh);
            }
        }
    }
    sleepersGroup.castShadow = true;
    scene.add(sleepersGroup);

    const pCount = Math.floor(TRACK_POINTS / 2);
    const pillarGeo = new THREE.CylinderGeometry(0.3, 0.6, 1, 8);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.4, metalness: 0.8 });
    const pillarsGroup = new THREE.InstancedMesh(pillarGeo, pillarMat, pCount);
    let pIdx = 0;
    const gY = State.currentTheme.type === 'sky' ? -150 : -60;
    
    for (let i = 0; i < TRACK_POINTS; i += 2) {
        const t = i / TRACK_POINTS;
        const pos = State.curve.getPointAt(t);
        
        const dist = Math.sqrt(pos.x*pos.x + pos.z*pos.z);
        let zPos = 0;
        if (dist > 50) {
            if (State.currentTheme.type === 'land') zPos = Math.sin(pos.x*0.015) * Math.cos(pos.z*0.015) * 12; 
            if (State.currentTheme.type === 'underwater') zPos += 4; 
        }
        let actualGroundY = gY + zPos;
        let skipPillar = false;
        
        for (let j = 0; j < TRACK_POINTS; j += 2) {
            if (Math.abs(i - j) < 15 || Math.abs(i - j) > TRACK_POINTS - 15) continue; 
            const otherPos = State.curve.points[j];
            if (otherPos.y < pos.y + 2 && otherPos.y > actualGroundY - 2) {
                const dx = otherPos.x - pos.x;
                const dz = otherPos.z - pos.z;
                if (dx*dx + dz*dz < 100) { skipPillar = true; break; }
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

    generateCollectibles(scene);
    updateMinimapBounds();
}

function generateCollectibles(scene) {
    if (State.currentTheme.type === 'abstract') {
        const ringGeo = new THREE.TorusGeometry(3.5, 0.1, 8, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(State.currentTheme.accent[0]).multiplyScalar(3.0) });
        for (let i = 0; i < TRACK_POINTS; i += 6) {
            const t = i / TRACK_POINTS;
            const pos = State.curve.getPointAt(t);
            const tangent = State.curve.getTangentAt(t).normalize();
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.copy(pos);
            ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), tangent);
            scene.add(ring);
        }
    } else {
        const brGeo = new THREE.TorusGeometry(12, 0.5, 16, 64);
        const brMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00aaff, emissiveIntensity: 2.5, transparent: true, opacity: 0.8 });
        
        const coinGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.08, 32); 
        coinGeo.rotateZ(Math.PI / 2); 
        const coinMat = new THREE.MeshStandardMaterial({ color: 0xffdd00, emissive: 0xffaa00, emissiveIntensity: 1.0, metalness: 0.8, roughness: 0.2 });

        let coinChainLeft = 0;
        let currentCoinLane = 1;
        
        for (let i = 25; i < TRACK_POINTS; i++) { 
            const t = i / TRACK_POINTS;
            const pos = State.curve.getPointAt(t);
            const tangent = State.curve.getTangentAt(t).normalize();
            
            if (i % 80 === 0) {
                const ring = new THREE.Mesh(brGeo, brMat);
                ring.position.copy(pos);
                ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), tangent);
                scene.add(ring);
                State.boostRingsData.push({ t, ring, active: true });
                continue;
            }
            
            if (coinChainLeft <= 0 && Math.random() < 0.10) {
                coinChainLeft = Math.floor(Math.random() * 30) + 10; 
                currentCoinLane = Math.floor(Math.random() * 3) - 1; 
            }
            
            if (coinChainLeft > 0) {
                coinChainLeft--;
                const coin = new THREE.Mesh(coinGeo, coinMat);
                
                const rawI = t * TRACK_SEGMENTS;
                const fi = Math.floor(rawI);
                const nw = Math.max(0, Math.min(1, rawI - fi));
                const nextFi = (fi + 1) % TRACK_SEGMENTS;
                const normal = new THREE.Vector3().lerpVectors(State.frames.normals[fi], State.frames.normals[nextFi], nw).normalize();
                const rightVec = new THREE.Vector3().crossVectors(normal, tangent).normalize();

                const m4 = new THREE.Matrix4();
                m4.makeBasis(rightVec, normal, tangent);
                coin.quaternion.setFromRotationMatrix(m4);
                
                const coinPos = pos.clone().addScaledVector(rightVec, currentCoinLane * 2.2).addScaledVector(normal, 1.5); 
                coin.position.copy(coinPos);
                scene.add(coin);
                State.coinsData.push({ t, lane: currentCoinLane, coin, active: true });
            }
        }
    }
}

function updateMinimapBounds() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    State.curve.points.forEach(p => {
        if(p.x < minX) minX = p.x;
        if(p.x > maxX) maxX = p.x;
        if(p.z < minZ) minZ = p.z;
        if(p.z > maxZ) maxZ = p.z;
    });
    const minimapCanvas = document.getElementById('minimap-1');
    if (minimapCanvas) {
        const padding = 20;
        const w = minimapCanvas.width - padding * 2;
        const h = minimapCanvas.height - padding * 2;
        State.minimapCx = (maxX + minX) / 2;
        State.minimapCz = (maxZ + minZ) / 2;
        State.minimapScale = Math.min(w / (maxX - minX), h / (maxZ - minZ));
        
        State.minimapTrackPoints = State.curve.points.map(p => ({
            x: (minimapCanvas.width / 2) + (p.x - State.minimapCx) * State.minimapScale,
            y: (minimapCanvas.height / 2) + (p.z - State.minimapCz) * State.minimapScale
        }));
    }
}

export function createCartModel(bodyColorHex, isNPC = false, driverNum = "01") {
    const cartGroup = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(1.4, 0.42, 2.0); // Thickened by 20% (was 0.35)
    const bodyPos = bodyGeo.attributes.position.array;
    for(let i=0; i<bodyPos.length; i+=3) {
        if(bodyPos[i+2] < 0) { 
            bodyPos[i] *= 0.6; 
            if(bodyPos[i+1] > 0) bodyPos[i+1] -= 0.30; // Adjusted slope for taller height
        } else {
            bodyPos[i] *= 1.1; 
        }
    }
    bodyGeo.computeVertexNormals();

    const bodyMat = new THREE.MeshPhysicalMaterial({ 
        color: bodyColorHex, 
        emissive: isNPC ? bodyColorHex : 0x000000,
        emissiveIntensity: isNPC ? 0.4 : 0, 
        roughness: 0.15, metalness: 0.6, clearcoat: 1.0, clearcoatRoughness: 0.1 
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.35;
    cartGroup.add(bodyMesh);

    if (isNPC) {
        cartGroup.scale.setScalar(2.0);
    }

    const wheelsData = [];
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.3, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 });
    const treadGeo = new THREE.BoxGeometry(0.32, 0.05, 0.05);
    const treadMat = new THREE.MeshBasicMaterial({ color: 0x888888 }); 
    const wheelPositions = [ [-0.8, 0.3, -0.6], [0.8, 0.3, -0.6], [-0.8, 0.3, 0.9], [0.8, 0.3, 0.9] ];

    wheelPositions.forEach(wp => {
        const wGroup = new THREE.Group();
        wGroup.position.set(wp[0], wp[1], wp[2]);
        wGroup.add(new THREE.Mesh(wheelGeo, wheelMat));
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

    const glassGeo = new THREE.BoxGeometry(1, 1, 1);
    const posAttribute = glassGeo.attributes.position;
    const H = 0.45; const Wf = 0.25, Wb = 0.45, Wr = 0.25; 
    const Fz = -0.5, Bz = 1.0, Fzr = -0.3, Bzr = 0.8;
    for (let i = 0; i < posAttribute.count; i++) {
        let x = posAttribute.getX(i); let y = posAttribute.getY(i) + 0.5; let z = posAttribute.getZ(i);
        const zBase = z > 0 ? Bz : Fz; const zRoof = z > 0 ? Bzr : Fzr;
        z = THREE.MathUtils.lerp(zBase, zRoof, y);
        const wBase = z > 0 ? Wb : Wf; const wRoof = Wr;
        const w = THREE.MathUtils.lerp(wBase, wRoof, y);
        x = x > 0 ? w : -w;  y = y * H;
        posAttribute.setXYZ(i, x, y, z);
    }
    glassGeo.computeVertexNormals();

    const envCanvas = document.createElement('canvas'); envCanvas.width = envCanvas.height = 256;
    const ctxEnv = envCanvas.getContext('2d'); const grad = ctxEnv.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.45, '#88aaff'); grad.addColorStop(0.5, '#445566'); grad.addColorStop(1, '#111122');
    ctxEnv.fillStyle = grad; ctxEnv.fillRect(0, 0, 256, 256);
    const fakeEnvTex = new THREE.CanvasTexture(envCanvas); fakeEnvTex.mapping = THREE.EquirectangularReflectionMapping;

    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x111115, roughness: 0.05, metalness: 0.9, envMap: fakeEnvTex, envMapIntensity: 2.0, clearcoat: 1.0, clearcoatRoughness: 0.05, transparent: true, opacity: 0.65 });
    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.position.set(0, 0.52 + 0.07, -0.2); // Shift glass up slightly to match thicker body
    cartGroup.add(glassMesh);

    // Driver Model
    const driverMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });
    const capMat = new THREE.MeshStandardMaterial({ color: bodyColorHex, roughness: 0.5 });
    const headGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const headMesh = new THREE.Mesh(headGeo, capMat);
    headMesh.position.set(0, 0.72 + 0.07, -0.3); // Sitting in the glass cabin
    cartGroup.add(headMesh);
    const bodyDriverGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 16);
    const bodyDriverMesh = new THREE.Mesh(bodyDriverGeo, driverMat);
    bodyDriverMesh.position.set(0, 0.5 + 0.07, -0.3);
    cartGroup.add(bodyDriverMesh);

    // Number Tag Sprite
    const canvasTag = document.createElement('canvas');
    canvasTag.width = 128; canvasTag.height = 64;
    const bCtx = canvasTag.getContext('2d');
    bCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    bCtx.fillRect(0, 0, 128, 64);
    bCtx.font = "Bold 36px Arial";
    bCtx.fillStyle = isNPC ? '#ffaaaa' : '#aaffaa';
    bCtx.textAlign = "center";
    bCtx.fillText("No." + driverNum, 64, 45);
    const tagTex = new THREE.CanvasTexture(canvasTag);
    const spriteMat = new THREE.SpriteMaterial({ map: tagTex, depthTest: false, transparent: true });
    const numberSprite = new THREE.Sprite(spriteMat);
    numberSprite.position.set(0, 1.4, -0.2); 
    numberSprite.scale.set(1.2, 0.6, 1);
    cartGroup.add(numberSprite);

    return { cartGroup, wheelsData };
}
