import * as THREE from 'three';
import { State } from './state.js';

// --- Canvas dimensions ---
const HUD_W = 640;
const HUD_H = 300;

let vrGroup = null;
let hudMesh = null;
let hudCanvas = null;
let hudCtx = null;
let hudTexture = null;

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Call once after the Three.js camera is created.
 * Attaches the VR HUD to the camera so it always floats in front of the user.
 */
export function initVrHud(camera) {
    vrGroup = new THREE.Group();
    vrGroup.visible = false; // hidden until VR session starts

    hudCanvas = document.createElement('canvas');
    hudCanvas.width  = HUD_W;
    hudCanvas.height = HUD_H;
    hudCtx = hudCanvas.getContext('2d');

    hudTexture = new THREE.CanvasTexture(hudCanvas);

    const mat = new THREE.MeshBasicMaterial({
        map: hudTexture,
        transparent: true,
        depthTest: false,
        side: THREE.DoubleSide,
    });

    hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.34), mat);
    vrGroup.add(hudMesh);

    // Position: slightly below eye level, ~1 m in front
    vrGroup.position.set(0, -0.22, -1.05);

    camera.add(vrGroup);
    return vrGroup;
}

/** Show the VR HUD (call on XR sessionstart) */
export function showVrHud() {
    if (vrGroup) vrGroup.visible = true;
}

/** Hide the VR HUD (call on XR sessionend) */
export function hideVrHud() {
    if (vrGroup) vrGroup.visible = false;
}

/**
 * Call every frame while XR is presenting.
 * @param {{ speed: number, score: number, gForce: number, isBoosting: boolean }} data
 */
export function updateVrHud(data) {
    if (!hudCtx || !hudTexture || !vrGroup?.visible) return;

    const ctx = hudCtx;
    ctx.clearRect(0, 0, HUD_W, HUD_H);

    // ── Glass background ────────────────────────────────────
    ctx.fillStyle = 'rgba(0, 5, 20, 0.72)';
    _roundRect(ctx, 8, 8, HUD_W - 16, HUD_H - 16, 22);
    ctx.fill();

    // Cyan glow border
    ctx.strokeStyle = State.isBoosting ? 'rgba(255, 120, 0, 0.9)' : 'rgba(0, 220, 255, 0.75)';
    ctx.lineWidth = 3;
    _roundRect(ctx, 8, 8, HUD_W - 16, HUD_H - 16, 22);
    ctx.stroke();

    // Inner accent line
    ctx.strokeStyle = State.isBoosting ? 'rgba(255,80,0,0.3)' : 'rgba(0,180,255,0.2)';
    ctx.lineWidth = 1;
    _roundRect(ctx, 14, 14, HUD_W - 28, HUD_H - 28, 18);
    ctx.stroke();

    // ── Content ─────────────────────────────────────────────
    if (!State.isRiding) {
        _drawStartPanel(ctx);
    } else {
        _drawRidePanel(ctx, data);
    }

    hudTexture.needsUpdate = true;
}

// ─────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────

function _drawStartPanel(ctx) {
    // Title
    ctx.textAlign = 'center';
    ctx.font = 'bold 46px sans-serif';
    _glow(ctx, '#00eeff', 12);
    ctx.fillStyle = '#00eeff';
    ctx.fillText('🎢  雲霄飛車 XR', HUD_W / 2, 82);
    _glow(ctx, null, 0);

    // Divider
    const grd = ctx.createLinearGradient(60, 0, HUD_W - 60, 0);
    grd.addColorStop(0, 'transparent');
    grd.addColorStop(0.5, 'rgba(0,220,255,0.6)');
    grd.addColorStop(1, 'transparent');
    ctx.strokeStyle = grd;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(60, 102); ctx.lineTo(HUD_W - 60, 102); ctx.stroke();

    // Instructions
    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('扣下扳機鍵  ▶  開始旅程', HUD_W / 2, 148);

    ctx.font = '21px sans-serif';
    ctx.fillStyle = '#88ccff';
    ctx.fillText('左控制器 ◀ 切換左道　　右控制器 ▶ 切換右道', HUD_W / 2, 196);

    ctx.fillStyle = '#ff9944';
    ctx.fillText('握把鍵 🚀 BOOST 加速', HUD_W / 2, 240);

    // Version
    ctx.font = '16px monospace';
    ctx.fillStyle = 'rgba(100,160,200,0.6)';
    ctx.fillText('FLYCHAIR LAB  |  v1.0  |  Quest 3 & Vive XR Elite', HUD_W / 2, 278);
}

function _drawRidePanel(ctx, { speed, score, gForce, isBoosting }) {
    ctx.textAlign = 'left';

    // ── Row 1: Speed (left) & Score (right) ──
    ctx.font = 'bold 34px monospace';
    _glow(ctx, '#00eeff', 8);
    ctx.fillStyle = '#00eeff';
    ctx.fillText(`⚡ ${speed}`, 36, 72);
    _glow(ctx, null, 0);

    ctx.font = '18px monospace';
    ctx.fillStyle = 'rgba(0,180,220,0.7)';
    ctx.fillText('km/h', 36, 96);

    ctx.textAlign = 'right';
    ctx.font = 'bold 34px monospace';
    _glow(ctx, '#ffdd00', 8);
    ctx.fillStyle = '#ffdd00';
    ctx.fillText(`💰 ${score}`, HUD_W - 36, 72);
    _glow(ctx, null, 0);

    ctx.font = '18px monospace';
    ctx.fillStyle = 'rgba(200,180,0,0.7)';
    ctx.fillText('SCORE', HUD_W - 36, 96);

    // Divider
    ctx.strokeStyle = 'rgba(0,180,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(36, 110); ctx.lineTo(HUD_W - 36, 110); ctx.stroke();

    // ── Row 2: G-Force ──
    ctx.textAlign = 'center';
    const gColor = gForce > 2.5 ? '#ff4444' : gForce < 0.5 ? '#ffaa00' : '#88ff88';
    ctx.font = 'bold 26px monospace';
    ctx.fillStyle = gColor;
    ctx.fillText(`G-FORCE: ${(gForce ?? 1).toFixed(1)} G`, HUD_W / 2, 152);

    // ── Row 3: Lane indicator ──
    const lane = State.playerLane;
    const laneStr = lane < 0 ? '◀◀  左 道' : lane > 0 ? '右 道  ▶▶' : '—— 中 道 ——';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = '#ccddff';
    ctx.fillText(laneStr, HUD_W / 2, 205);

    // ── Row 4: Boost status ──
    if (isBoosting) {
        ctx.font = 'bold 24px sans-serif';
        _glow(ctx, '#ff6600', 10);
        ctx.fillStyle = '#ff8800';
        ctx.fillText('▶▶  BOOST 加速中  ◀◀', HUD_W / 2, 260);
        _glow(ctx, null, 0);
    } else {
        ctx.font = '19px sans-serif';
        ctx.fillStyle = 'rgba(100,140,200,0.55)';
        ctx.fillText('握把鍵  BOOST', HUD_W / 2, 260);
    }
}

function _glow(ctx, color, blur) {
    ctx.shadowColor = color || 'transparent';
    ctx.shadowBlur  = blur;
}

function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x,     y + r);
    ctx.arcTo(x,     y,     x + r, y,         r);
    ctx.closePath();
}
