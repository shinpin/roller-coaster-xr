import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ── Car Roster Configuration ──────────────────────────────────────────────────
// Temporarily using 'proc' (procedural blocks) to maximize stability and memory!
export const CAR_ROSTER_DEFS = [
    { label: 'Rabbit',   type: 'proc', url: 'assets/models/CAR01_rabbit.glb',  color: 0xffaaaa, num: '01', modelScale: 0.1, modelRotateY: -Math.PI / 2, showcaseScale: 0.7, showcaseY: -0.6 },
    { label: 'Fox',      type: 'proc', url: 'assets/models/CAR02_FOX.glb',     color: 0xff8822, num: '02', modelScale: 0.1, modelRotateY: -Math.PI / 2, showcaseScale: 0.7, showcaseY: -0.6 },
    { label: 'Seadog',   type: 'proc', url: 'assets/models/CAR03_seadog.glb',  color: 0x44aaff, num: '03', modelScale: 0.2, modelRotateY: -Math.PI / 2, showcaseScale: 0.7, showcaseY: -0.6 },
    { label: 'Monkey',   type: 'proc', url: 'assets/models/CAR04_,mokey.glb',  color: 0xaa8844, num: '04', modelScale: 0.1, modelRotateY: -Math.PI / 2, showcaseScale: 0.7, showcaseY: -0.6 },
    { label: 'Tiger',    type: 'proc', url: 'assets/models/CAR05_tiger.glb',   color: 0xff6600, num: '05', modelScale: 0.1, modelRotateY: -Math.PI / 2, showcaseScale: 0.7, showcaseY: -0.6 },
    { label: 'Giraffe',  type: 'proc', url: 'assets/models/CAR06_giraffe.glb', color: 0xddcc44, num: '06', modelScale: 5.0,  modelRotateY: -Math.PI / 2, showcaseScale: 0.7, showcaseY: -0.6 },
    { label: 'Panda',    type: 'proc', url: 'assets/models/CAR07_panda.glb',   color: 0xffffff, num: '07', modelScale: 5.0,  modelRotateY: -Math.PI / 2, showcaseScale: 0.7, showcaseY: -0.6 }
];

export const carRosterGroups = new Array(CAR_ROSTER_DEFS.length).fill(null);

export function createProceduralCart(color, isPlayer = false, badgeText = '') {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.3, metalness: 0.8 });
    const bodyGeo = new THREE.BoxGeometry(0.8, 0.4, 1.4);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const noseGeo = new THREE.BoxGeometry(0.6, 0.3, 0.6);
    const nose = new THREE.Mesh(noseGeo, bodyMat);
    nose.position.set(0, 0.15, -1.0);
    nose.castShadow = true;
    nose.receiveShadow = true;
    group.add(nose);

    // Front glowing light for cyberpunk aesthetics
    const lightGeo = new THREE.BoxGeometry(0.5, 0.1, 0.05);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const frontLight = new THREE.Mesh(lightGeo, lightMat);
    frontLight.position.set(0, 0.2, -1.32);
    group.add(frontLight);

    if (badgeText) {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000000'; ctx.fillRect(0,0,128,128);
        ctx.fillStyle = '#11ff11'; ctx.font = 'bold 70px Impact';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, 64, 64);
        const tex = new THREE.CanvasTexture(canvas);
        const badgeMat = new THREE.MeshBasicMaterial({ map: tex });
        const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), badgeMat);
        badge.position.set(0, 0.41, 0);
        badge.rotation.x = -Math.PI / 2;
        group.add(badge);
    }
    
    // Wheels logic kept intact, just isolated inside group (we don't sync 'wheelsData' globally anymore, rely on group.userData.wheels)
    const wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.1 });
    const positions = [ [-0.45, 0.2, -0.6], [0.45, 0.2, -0.6], [-0.45, 0.2, 0.6], [0.45, 0.2, 0.6] ];
    positions.forEach(p => {
        const w = new THREE.Mesh(wheelGeo, wMat);
        w.position.set(...p);
        w.castShadow = true; w.receiveShadow = true;
        
        const rimGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.11, 8);
        rimGeo.rotateZ(Math.PI / 2);
        const rimMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1.0 });
        const rim = new THREE.Mesh(rimGeo, rimMat);
        w.add(rim);
        
        group.add(w);
        wheels.push(w);
    });
    group.userData.wheels = wheels;
    return group;
}

export function loadAllCars(onUpdate) {
    let pending = 0;
    const gltfLoader = new GLTFLoader();

    CAR_ROSTER_DEFS.forEach((def, i) => {
        if (def.type === 'proc') {
            const group = createProceduralCart(def.color, false, def.num);
            carRosterGroups[i] = { cartGroup: group };
        } else {
            pending++;
            gltfLoader.load(def.url, (gltf) => {
                const model = gltf.scene;
                model.traverse(c => {
                    if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
                });
                model.scale.setScalar(def.modelScale || 0.1);
                if (def.modelRotateY) model.rotation.y = def.modelRotateY;

                const root = new THREE.Group();
                // Add floating physics hover properties later if needed
                model.position.y = -0.5;
                root.add(model);
                
                carRosterGroups[i] = { cartGroup: root };
                pending--;
                if (pending === 0 && onUpdate) onUpdate();
            }, undefined, (err) => {
                console.warn('GLB load failed, fallback to proc:', def.url);
                carRosterGroups[i] = { cartGroup: createProceduralCart(def.color, false, def.num) };
                pending--;
                if (pending === 0 && onUpdate) onUpdate();
            });
        }
    });

    if (pending === 0 && onUpdate) onUpdate(); // if all proc
}
