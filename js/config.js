export const TRACK_POINTS = 300;
export const TRACK_SEGMENTS = 2500;
export const TRACK_RADIUS = 1.0; 

export const THEMES = {
    underwater: { type: 'underwater', bg: 0x001e4a, track: 0x00ffff, ground: 0x001133, accent: [0x0077ff, 0x00ffff, 0x00ff88], fogExp: 0.02, groundWire: false },
    sky: { type: 'sky', bg: 0x55aaff, track: 0xffffff, ground: 0x3388cc, accent: [0xffffff, 0xeeeeee, 0xffddaa], fogExp: 0.005, groundWire: false },
    land: { type: 'land', bg: 0x4aacc5, track: 0x8B4513, ground: 0x228B22, accent: [0x228B22, 0x32CD32, 0x00ff00], fogExp: 0.008, groundWire: false },
    synthwave: { type: 'abstract', bg: 0x050510, track: 0x00f3ff, ground: 0x111122, accent: [0xff00ea, 0x00f3ff, 0x00ffaa], fogExp: 0.015, groundWire: true },
    kyoto: { type: 'land', bg: 0xffe6f2, track: 0xdc143c, ground: 0x8F9779, accent: [0xff69b4, 0xffb6c1, 0xff1493], fogExp: 0.005, groundWire: false }
};

export const TIMES = {
    day: { ambient: 1.0, dirLight: 1.5, dirCol: 0xffffff, fogMod: 1.0, bgMod: { r: 1, g: 1, b: 1 } },
    sunset: { ambient: 0.7, dirLight: 1.2, dirCol: 0xff8833, fogMod: 0.8, bgMod: { r: 1, g: 0.66, b: 0.33 } },
    night: { ambient: 0.4, dirLight: 0.5, dirCol: 0x4444ff, fogMod: 0.5, bgMod: { r: 0.13, g: 0.13, b: 0.26 } }
};
