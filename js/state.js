import { THEMES, TIMES } from './config.js';

export const State = {
    // Current Environment
    currentTheme: THEMES.underwater,
    currentTime: TIMES.day,
    currentWeather: 'clear',
    currentLevelConfig: null,

    // Ride Progress & Physics
    isRiding: false,
    rideProgress: 0,
    lastProgress: 0,
    baseSpeed: 0.0007,
    currentSpeed: 0,
    targetSpeed: 0,
    isBoosting: false,
    
    // Player Stats & Position (Now an array for split-screen)
    players: [],
    curve: null,
    frames: null,
    animatedObjects: [],
    weatherParticles: null,
    boostRingsData: [],
    coinsData: [],
    npcs: [],
    coinParticlesData: [],
    wheelsData: [],
    
    // Minimap Data
    minimapTrackPoints: [],
    minimapScale: 1,
    minimapCx: 0,
    minimapCz: 0,
    
    // Global flags
    isDebug: false,
    audioEnabled: true, // Legacy master switch (optional if we replace it completely, but better keep it for backward compatibility)
    bgmEnabled: true,
    sfxEnabled: true,
    
    // Performance Toggles
    perf: {
        bloom: true,
        shadows: true,
        particles: true,
        highRes: true
    }
};
