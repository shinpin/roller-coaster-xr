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
    
    // Player Stats & Position
    score: 0,
    playerLane: 1, // 1 = right, -1 = left
    currentLaneOffset: 0,

    // Track Data (Populated by trackGenerator)
    curve: null,
    frames: null,
    animatedObjects: [],
    weatherParticles: null,
    boostRingsData: [],
    coinsData: [],
    coinParticlesData: [],
    wheelsData: [],
    
    // Minimap Data
    minimapTrackPoints: [],
    minimapScale: 1,
    minimapCx: 0,
    minimapCz: 0,
    
    // Global flags
    isDebug: false,
    audioEnabled: true
};
