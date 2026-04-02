import * as THREE from 'three';
import { TRACK_SEGMENTS } from './config.js';

export function createTrackTexture() {
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

export function createArrowTexture() {
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

export function createEnvironmentTexture(themeType, timeKey) {
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

// Prefetch instances to reuse
export const trackTexture = createTrackTexture();
export const arrowTexture = createArrowTexture();

