import { State } from './state.js';

export const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
export let engineAudio = null;

export function setupAudio() {
    if (engineAudio) return; 
    
    const bufferSize = audioCtx.sampleRate * 2; 
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    
    const createEngine = (panValue) => {
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;
        
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 50; 
        
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0; 
        
        const panner = audioCtx.createStereoPanner();
        panner.pan.value = panValue;
        
        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(audioCtx.destination);
        
        noise.start();
        return { filter, gainNode, panner };
    };
    
    engineAudio = {
        p1: createEngine(State.multiplayerMode ? -0.7 : 0),
        p2: createEngine(State.multiplayerMode ? 0.7 : 0)
    };
}

export function playCoinSound(playerIndex = 0) {
    if (!audioCtx || !State.audioEnabled || !State.sfxEnabled) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = State.multiplayerMode ? (playerIndex === 0 ? -0.7 : 0.7) : 0;
    
    osc.connect(gain); 
    gain.connect(panner);
    panner.connect(audioCtx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, audioCtx.currentTime); // B5
    osc.frequency.exponentialRampToValueAtTime(1318.51, audioCtx.currentTime + 0.08); // E6 slide
    
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(1.0, audioCtx.currentTime + 0.02); 
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.35);
}

export function playBoostSound(playerIndex = 0) {
    if (!audioCtx || !State.audioEnabled || !State.sfxEnabled) return;
    
    // Jet/Whoosh noise
    const bufferSize = audioCtx.sampleRate * 1; 
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(500, audioCtx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(3000, audioCtx.currentTime + 0.3);
    filter.Q.value = 0.5;

    // Underneath bass rumble
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(250, audioCtx.currentTime + 0.5);

    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.8, audioCtx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.9);
    
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = State.multiplayerMode ? (playerIndex === 0 ? -0.7 : 0.7) : 0;
    
    noise.connect(filter);
    filter.connect(gainNode);
    osc.connect(gainNode);

    gainNode.connect(panner);
    panner.connect(audioCtx.destination);
    
    noise.start(audioCtx.currentTime);
    osc.start(audioCtx.currentTime);
    noise.stop(audioCtx.currentTime + 0.9);
    osc.stop(audioCtx.currentTime + 0.9);
}

let lastTickTimeP1 = 0;
let lastTickTimeP2 = 0;

export function updateUphillAudio(playerIndex, speed, slope, time) {
    if (!audioCtx || !State.audioEnabled || !State.sfxEnabled) return;
    
    // slope > 0.1 means ascending steeply (tangent.y is positive)
    if (slope > 0.1 && speed > 0.00001) { 
        const minVal = 0.05;
        const tickInterval = Math.max(minVal, 0.0001 / speed);
        
        const lastTickTime = playerIndex === 0 ? lastTickTimeP1 : lastTickTimeP2;
        if (time - lastTickTime > tickInterval) {
            playTickSound(playerIndex);
            if (playerIndex === 0) lastTickTimeP1 = time; else lastTickTimeP2 = time;
        }
    }
}

function playTickSound(playerIndex) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = State.multiplayerMode ? (playerIndex === 0 ? -0.7 : 0.7) : 0;
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(650 + Math.random() * 50, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.04);
    
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(panner);
    panner.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.06);
}

export function updateEngineAudio(speedP1, speedP2 = 0) {
    if (engineAudio) {
        const sfxVol = (State.audioEnabled && State.sfxEnabled) ? 1.0 : 0.0;
        engineAudio.p1.filter.frequency.value = 50 + (speedP1 * 200000);
        engineAudio.p1.gainNode.gain.value = Math.min(1.0, speedP1 * 2000) * sfxVol;
        
        engineAudio.p2.filter.frequency.value = 50 + (speedP2 * 200000);
        engineAudio.p2.gainNode.gain.value = Math.min(1.0, speedP2 * 2000) * sfxVol;
    }
}
