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
    if (!audioCtx || !State.audioEnabled) return;
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
    if (!audioCtx || !State.audioEnabled) return;
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.3);
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = State.multiplayerMode ? (playerIndex === 0 ? -0.7 : 0.7) : 0;
    
    osc.connect(gain); 
    gain.connect(panner);
    panner.connect(audioCtx.destination);
    
    osc.start(); 
    osc.stop(audioCtx.currentTime + 0.3);
}

export function updateEngineAudio(speedP1, speedP2 = 0) {
    if (engineAudio) {
        engineAudio.p1.filter.frequency.value = 50 + (speedP1 * 200000);
        engineAudio.p1.gainNode.gain.value = Math.min(1.0, speedP1 * 2000);
        
        engineAudio.p2.filter.frequency.value = 50 + (speedP2 * 200000);
        engineAudio.p2.gainNode.gain.value = Math.min(1.0, speedP2 * 2000);
    }
}
