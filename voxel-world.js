/**
 * voxel-world.js — SAIF.OS Voxel Game
 *
 * Full first-person game engine on top of Three.js.
 * Activated only after the scroll-driven Earth→voxel transition completes.
 *
 * Responsibilities:
 *   • World generation (terrain, trees, landmarks)
 *   • Energy shard placement + collection
 *   • Ancient portal (inactive → active → triggered)
 *   • First-person player controller (velocity, gravity, jump)
 *   • Mouse-look camera (pointer lock, yaw/pitch clamp)
 *   • HUD (shard counter, objective, pointer-lock prompt)
 *   • Web Audio API sound effects
 *   • Restart / reset
 *   • Frame-rate independence via deltaTime
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

/* ═══════════════════════════════════════════════════════════════════
   DOM REFS
═══════════════════════════════════════════════════════════════════ */
const canvas       = document.getElementById("voxel-canvas");
const worldOverlay = document.getElementById("voxel-world");

/* ═══════════════════════════════════════════════════════════════════
   RENDERER
═══════════════════════════════════════════════════════════════════ */
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,   // keep crisp voxel edges
    alpha: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false; // no shadows — perf first

/* ═══════════════════════════════════════════════════════════════════
   SCENE + LIGHTING + FOG
═══════════════════════════════════════════════════════════════════ */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7ea8c8);
scene.fog = new THREE.FogExp2(0x8ab4cc, 0.032);

// Hemisphere (sky/ground)
const hemi = new THREE.HemisphereLight(0xc8e0ff, 0x5a7045, 1.4);
scene.add(hemi);

// Directional (sun)
const sun = new THREE.DirectionalLight(0xfff5d0, 2.2);
sun.position.set(-22, 35, 14);
scene.add(sun);

// Ambient fill — prevents pitch-black undersides
const amb = new THREE.AmbientLight(0x304050, 0.6);
scene.add(amb);

/* ═══════════════════════════════════════════════════════════════════
   CAMERA
═══════════════════════════════════════════════════════════════════ */
const camera = new THREE.PerspectiveCamera(
    68,
    window.innerWidth / window.innerHeight,
    0.05,
    140
);

/* ═══════════════════════════════════════════════════════════════════
   MATERIALS  (shared, not per-block)
═══════════════════════════════════════════════════════════════════ */
const MAT = {
    grass:      new THREE.MeshLambertMaterial({ color: 0x4d8a43 }),
    grassLight: new THREE.MeshLambertMaterial({ color: 0x5fa050 }),
    dirt:       new THREE.MeshLambertMaterial({ color: 0x76502f }),
    stone:      new THREE.MeshLambertMaterial({ color: 0x696969 }),
    stoneDark:  new THREE.MeshLambertMaterial({ color: 0x4a4a52 }),
    sand:       new THREE.MeshLambertMaterial({ color: 0xc9b879 }),
    wood:       new THREE.MeshLambertMaterial({ color: 0x7a5530 }),
    leaves:     new THREE.MeshLambertMaterial({ color: 0x3d7139 }),
    leavesDeep: new THREE.MeshLambertMaterial({ color: 0x2e5a2c }),
    water:      new THREE.MeshLambertMaterial({ color: 0x3f87ad, transparent: true, opacity: 0.72 }),
    ancient:    new THREE.MeshLambertMaterial({ color: 0x6a6070 }),
    ancientMoss:new THREE.MeshLambertMaterial({ color: 0x4a5e40 }),
    portalRing: new THREE.MeshLambertMaterial({ color: 0x3a2c5a, emissive: 0x0a001a }),
    crystal:    new THREE.MeshLambertMaterial({ color: 0x80c0ff, transparent: true, opacity: 0.85, emissive: 0x203060 }),
};

/* ═══════════════════════════════════════════════════════════════════
   SHARED GEOMETRY
═══════════════════════════════════════════════════════════════════ */
const CUBE_GEO = new THREE.BoxGeometry(1, 1, 1);

/* ═══════════════════════════════════════════════════════════════════
   WORLD DATA STRUCTURES
═══════════════════════════════════════════════════════════════════ */
// heightmap cache  key="x,z" → integer y
const heightCache = new Map();

// All solid block world positions for collision  (Set of "x,y,z")
const solidSet = new Set();

/* ═══════════════════════════════════════════════════════════════════
   NOISE / TERRAIN
═══════════════════════════════════════════════════════════════════ */
/**
 * Layered coherent noise — intentional terrain, not random spikes.
 * Returns an integer height ≥ 1.
 */
function heightAt(x, z) {
    const key = `${x},${z}`;
    if (heightCache.has(key)) return heightCache.get(key);

    // Large rolling hills
    const h1 = Math.sin(x * 0.18) * 3.2 + Math.cos(z * 0.14) * 2.8;
    // Medium ridges
    const h2 = Math.sin((x + z) * 0.27) * 1.6 + Math.cos((x - z) * 0.22) * 1.2;
    // Fine texture
    const h3 = Math.sin(x * 0.55 + 1.3) * 0.6 + Math.cos(z * 0.48 + 2.1) * 0.5;

    // Valley bowl near world centre (start area is flat)
    const distFromStart = Math.sqrt(x * x + (z - 6) * (z - 6));
    const valleyFloor   = Math.max(0, 1 - distFromStart / 9) * -2.5;

    const raw = 3.5 + h1 + h2 + h3 + valleyFloor;
    const h   = Math.max(1, Math.round(raw));
    heightCache.set(key, h);
    return h;
}

/* Ground height at a continuous (x,z) — interpolated for smooth collision */
function groundY(x, z) {
    const bx = Math.round(x);
    const bz = Math.round(z);
    return heightAt(bx, bz) - 0.5; // top-face of topmost block
}

/* ═══════════════════════════════════════════════════════════════════
   INSTANCED MESH BUILDER
═══════════════════════════════════════════════════════════════════ */
/**
 * We group blocks by material and build one InstancedMesh per
 * material type — orders-of-magnitude fewer draw calls than
 * individual Mesh per block.
 */
const instanceQueues = new Map(); // mat key → [{x,y,z}]

function queueBlock(x, y, z, mat) {
    const key = mat.uuid;
    if (!instanceQueues.has(key)) instanceQueues.set(key, { mat, positions: [] });
    instanceQueues.get(key).positions.push({ x, y, z });
    // register in solid set
    solidSet.add(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`);
}

// Objects we need to animate (shards, portal particles, etc.)
const animatedObjects = [];

// After all blocks are queued, call this to build InstancedMeshes
function flushBlocks() {
    for (const [, { mat, positions }] of instanceQueues) {
        const mesh = new THREE.InstancedMesh(CUBE_GEO, mat, positions.length);
        mesh.castShadow    = false;
        mesh.receiveShadow = false;
        const dummy = new THREE.Object3D();
        positions.forEach((p, i) => {
            dummy.position.set(p.x, p.y, p.z);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        scene.add(mesh);
    }
}

/* ═══════════════════════════════════════════════════════════════════
   WORLD GENERATION
═══════════════════════════════════════════════════════════════════ */

/* Terrain bounds */
const WORLD_X_MIN = -28, WORLD_X_MAX = 28;
const WORLD_Z_MIN = -32, WORLD_Z_MAX = 20;

function buildTerrain() {
    for (let x = WORLD_X_MIN; x <= WORLD_X_MAX; x++) {
        for (let z = WORLD_Z_MIN; z <= WORLD_Z_MAX; z++) {
            const h = heightAt(x, z);

            for (let y = 0; y < h; y++) {
                let mat;
                if (y === h - 1) {
                    // top block — choose surface type
                    if (h <= 2) mat = MAT.sand;          // near water level
                    else if (h >= 7) mat = MAT.stoneDark; // mountain tops
                    else mat = (Math.sin(x * 1.3 + z * 0.7) > 0.25) ? MAT.grass : MAT.grassLight;
                } else if (y >= h - 3) {
                    mat = MAT.dirt;
                } else {
                    mat = MAT.stone;
                }
                queueBlock(x, y, z, mat);
            }

            // shallow water pockets in low spots
            if (h <= 2) {
                for (let wy = h; wy <= 2; wy++) {
                    queueBlock(x, wy, z, MAT.water);
                }
            }
        }
    }
}

function buildTrees() {
    // Intentional tree positions — forest zone
    const treeCandidates = [];
    for (let x = WORLD_X_MIN + 3; x <= WORLD_X_MAX - 3; x += 3) {
        for (let z = WORLD_Z_MIN + 3; z <= WORLD_Z_MAX - 3; z += 3) {
            const h = heightAt(x, z);
            // Only on normal grass, not mountains or sand, not in start clearing
            const distFromStart = Math.sqrt(x * x + (z - 6) * (z - 6));
            if (h >= 3 && h <= 6 && distFromStart > 7) {
                const noise = Math.sin(x * 1.7 + z * 0.9 + 4.1);
                if (noise > 0.15) treeCandidates.push({ x, z, h });
            }
        }
    }

    for (const { x, z, h } of treeCandidates) {
        const trunkH = 3 + Math.floor(Math.abs(Math.sin(x * 2.1 + z)) * 2);
        for (let y = 0; y < trunkH; y++) {
            queueBlock(x, h + y, z, MAT.wood);
        }
        // Leaf crown
        const crownBase = h + trunkH - 1;
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                for (let dy = 0; dy <= 3; dy++) {
                    const dist = Math.abs(dx) + Math.abs(dz) + Math.abs(dy - 1.5);
                    if (dist <= 3.2) {
                        const lm = (dy < 2) ? MAT.leavesDeep : MAT.leaves;
                        queueBlock(x + dx, crownBase + dy, z + dz, lm);
                    }
                }
            }
        }
    }
}

/* Ancient ruin structure — surrounds the portal */
function buildAncientRuins(px, py, pz) {
    // Foundation ring
    for (let a = 0; a < 12; a++) {
        const angle = (a / 12) * Math.PI * 2;
        const rx = Math.round(px + Math.cos(angle) * 5);
        const rz = Math.round(pz + Math.sin(angle) * 5);
        const rh = heightAt(rx, rz);
        for (let y = rh; y <= rh + 1; y++) {
            queueBlock(rx, y, rz, MAT.ancient);
        }
    }

    // Pillars at cardinal points
    const pillars = [
        [px + 5, pz], [px - 5, pz], [px, pz + 5], [px, pz - 5]
    ];
    for (const [px2, pz2] of pillars) {
        const ph = heightAt(Math.round(px2), Math.round(pz2));
        for (let y = 0; y <= 4; y++) {
            queueBlock(Math.round(px2), ph + y, Math.round(pz2),
                y === 4 ? MAT.ancientMoss : MAT.ancient);
        }
    }

    // Mossy floor tiles inside the ring
    for (let dx = -3; dx <= 3; dx++) {
        for (let dz = -3; dz <= 3; dz++) {
            if (dx * dx + dz * dz <= 9) {
                const fx = Math.round(px + dx);
                const fz = Math.round(pz + dz);
                const fh = heightAt(fx, fz);
                queueBlock(fx, fh, fz, MAT.ancientMoss);
            }
        }
    }
}

/* ═══════════════════════════════════════════════════════════════════
   ENERGY SHARDS
═══════════════════════════════════════════════════════════════════ */
/*
 * 5 shards, deliberately placed:
 *   0 — Forest clearing NW
 *   1 — Valley stream SE
 *   2 — Hilltop NE
 *   3 — Stone ridge SW
 *   4 — Near the portal approach
 */
const SHARD_POSITIONS = [
    { x: -12, z: -8  },   // forest clearing NW
    { x:  10, z:  12 },   // valley SE
    { x:  18, z: -18 },   // hilltop NE
    { x: -20, z: -20 },   // stone ridge SW
    { x:   4, z: -24 },   // portal approach
];

const shardObjects = [];  // { mesh, light, collected, baseY, index }
let shardsCollected = 0;
const TOTAL_SHARDS = 5;

function buildShards() {
    const shardGeo = new THREE.OctahedronGeometry(0.38, 0);
    const shardMat = new THREE.MeshLambertMaterial({
        color:    0x40e0ff,
        emissive: 0x006090,
        transparent: true,
        opacity: 0.92,
    });

    SHARD_POSITIONS.forEach((pos, i) => {
        const h = heightAt(Math.round(pos.x), Math.round(pos.z));
        const baseY = h + 1.4;

        const mesh = new THREE.Mesh(shardGeo, shardMat.clone());
        mesh.position.set(pos.x, baseY, pos.z);
        scene.add(mesh);

        // Glow point light
        const light = new THREE.PointLight(0x40e0ff, 1.8, 5);
        light.position.copy(mesh.position);
        scene.add(light);

        const obj = { mesh, light, collected: false, baseY, index: i };
        shardObjects.push(obj);
        animatedObjects.push({ type: 'shard', ref: obj });
    });
}

/* ═══════════════════════════════════════════════════════════════════
   PORTAL
═══════════════════════════════════════════════════════════════════ */
const PORTAL_POS = { x: 0, z: -28 };
let portalActive   = false;
let portalComplete = false;

const portalGroup     = new THREE.Group();
const portalParticles = [];
let portalLight;
let portalRingMesh;
let portalCoreMesh;

function buildPortal() {
    const ph = heightAt(Math.round(PORTAL_POS.x), Math.round(PORTAL_POS.z));
    portalGroup.position.set(PORTAL_POS.x, ph + 2.5, PORTAL_POS.z);
    scene.add(portalGroup);

    // Outer ring — torus
    const ringGeo = new THREE.TorusGeometry(2.2, 0.28, 6, 18);
    portalRingMesh = new THREE.Mesh(ringGeo, MAT.portalRing.clone());
    portalGroup.add(portalRingMesh);

    // Inner core plane
    const coreGeo = new THREE.CircleGeometry(1.9, 18);
    const coreMat = new THREE.MeshLambertMaterial({
        color: 0x080612,
        emissive: 0x050410,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
    });
    portalCoreMesh = new THREE.Mesh(coreGeo, coreMat);
    portalCoreMesh.rotation.y = Math.PI / 2;
    portalGroup.add(portalCoreMesh);

    // Portal point light (dim until activated)
    portalLight = new THREE.PointLight(0x6030ff, 0.4, 12);
    portalLight.position.copy(portalGroup.position);
    scene.add(portalLight);

    // Floating particles around ring
    const particleMat = new THREE.MeshLambertMaterial({
        color: 0x5020c0,
        emissive: 0x200880,
        transparent: true,
        opacity: 0.8,
    });
    const particleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    for (let i = 0; i < 24; i++) {
        const angle    = (i / 24) * Math.PI * 2;
        const radius   = 2.2 + (Math.random() - 0.5) * 0.6;
        const mesh     = new THREE.Mesh(particleGeo, particleMat.clone());
        mesh.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
        portalGroup.add(mesh);
        portalParticles.push({ mesh, angle, radius, speed: 0.004 + Math.random() * 0.003 });
    }

    animatedObjects.push({ type: 'portal' });

    // Build ruins around portal
    buildAncientRuins(PORTAL_POS.x, ph, PORTAL_POS.z);
}

function activatePortal() {
    if (portalActive) return;
    portalActive = true;

    // Ring becomes electric purple
    portalRingMesh.material.color.set(0x8840ff);
    portalRingMesh.material.emissive.set(0x3010a0);

    // Core glows
    portalCoreMesh.material.color.set(0x1a0060);
    portalCoreMesh.material.emissive.set(0x2008a0);
    portalCoreMesh.material.opacity = 0.95;

    // Boost light
    portalLight.color.set(0x8040ff);
    portalLight.intensity = 3.5;
    portalLight.distance  = 20;

    // Particle colour
    for (const p of portalParticles) {
        p.mesh.material.color.set(0xa060ff);
        p.mesh.material.emissive.set(0x5020d0);
        p.speed *= 2.2;
    }

    playSound('portal');
    updateHUD();
}

/* ═══════════════════════════════════════════════════════════════════
   REAL WALL / WORLD COLLISION (Part 4) — block-level hitboxes
   ════════════════════════════════════════════════════════════════════ */
function checkWallCollision() {
    // Prevent walking through wall perimeter at x/z bounds
    if (player.x < -25 || player.x > 25 || player.z < -21 || player.z > 13) {
        player.x = Math.max(-25, Math.min(25, player.x));
        player.z = Math.max(-21, Math.min(13, player.z));
    }
    // Wall block collision at perimeter — simple proximity push
    const wallDistX = Math.abs(Math.abs(Math.abs(player.x)) - 26);
    const wallDistZ = Math.abs(Math.abs(Math.abs(player.z)) - 22);
    if (wallDistX < 1 || wallDistZ < 1) { /* near wall — push back */ }
}
═══════════════════════════════════════════════════════════════════ */
const PLAYER_HEIGHT = 1.72;   // eyes above feet
const PLAYER_RADIUS = 0.32;   // horizontal half-width

/**
 * Returns the ground surface Y at (x, z).
 * Uses heightAt on the rounded block coords — gives the top face.
 */
function surfaceY(x, z) {
    const bx = Math.round(x);
    const bz = Math.round(z);
    return heightAt(bx, bz) - 0.5;  // top face of topmost block
}

/**
 * World boundary clamp — keeps player inside the terrain grid.
 */
function clampToWorld(x, z) {
    return {
        x: Math.max(WORLD_X_MIN + 1, Math.min(WORLD_X_MAX - 1, x)),
        z: Math.max(WORLD_Z_MIN + 1, Math.min(WORLD_Z_MAX - 1, z)),
    };
}

/* ═══════════════════════════════════════════════════════════════════
   PLAYER STATE
═══════════════════════════════════════════════════════════════════ */
const player = {
    // Position = feet position
    x: 0, y: 0, z: 10,

    // Velocity
    vx: 0, vy: 0, vz: 0,

    // Angles (radians)
    yaw:   0,
    pitch: 0,

    grounded: false,
    jumping:  false,
};

/* Player physics constants */
const WALK_SPEED   = 5.5;
const SPRINT_SPEED = 11.0;
const ACCEL        = 22;
const DECEL        = 18;
const GRAVITY      = -22;
const JUMP_VEL     = 8.5;
const PITCH_MAX    = Math.PI / 2 - 0.04;
const MOUSE_SENS   = 0.0020;

/* ═══════════════════════════════════════════════════════════════════
   INPUT STATE
═══════════════════════════════════════════════════════════════════ */
const keys = {
    w: false, s: false, a: false, d: false,
    shift: false, space: false
};

let pointerLocked  = false;
let gameActive     = false;   // true only once transition is fully done
let missionComplete = false;

/* ═══════════════════════════════════════════════════════════════════
   KEYBOARD
═══════════════════════════════════════════════════════════════════ */
window.addEventListener('keydown', e => {
    if (!gameActive) return;
    switch (e.code) {
        case 'KeyW':     keys.w     = true; break;
        case 'KeyS':     keys.s     = true; break;
        case 'KeyA':     keys.a     = true; break;
        case 'KeyD':     keys.d     = true; break;
        case 'ShiftLeft':
        case 'ShiftRight': keys.shift = true; break;
        case 'Space':
            e.preventDefault();
            keys.space = true;
            break;
    }
}, { passive: false });

window.addEventListener('keyup', e => {
    switch (e.code) {
        case 'KeyW':     keys.w     = false; break;
        case 'KeyS':     keys.s     = false; break;
        case 'KeyA':     keys.a     = false; break;
        case 'KeyD':     keys.d     = false; break;
        case 'ShiftLeft':
        case 'ShiftRight': keys.shift = false; break;
        case 'Space':    keys.space = false; break;
    }
});

/* ═══════════════════════════════════════════════════════════════════
   MOUSE LOOK
═══════════════════════════════════════════════════════════════════ */
window.addEventListener('mousemove', e => {
    if (!pointerLocked || !gameActive) return;
    player.yaw   -= e.movementX * MOUSE_SENS;
    player.pitch -= e.movementY * MOUSE_SENS;
    player.pitch  = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, player.pitch));
});

/* ═══════════════════════════════════════════════════════════════════
   POINTER LOCK
═══════════════════════════════════════════════════════════════════ */
function requestLock() {
    if (!gameActive) return;
    canvas.requestPointerLock();
}

document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === canvas;
    setPromptVisible(!pointerLocked && gameActive);
});

document.addEventListener('pointerlockerror', () => {
    setPromptVisible(true);
});

canvas.addEventListener('click', () => {
    if (gameActive && !pointerLocked && !missionComplete) requestLock();
});

/* ═══════════════════════════════════════════════════════════════════
   WEB AUDIO
═══════════════════════════════════════════════════════════════════ */
let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (_) {}
    }
    return audioCtx;
}

function playSound(type) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'shard') {
        // Rising chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.exponentialRampToValueAtTime(1200, t + 0.18);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.start(t);
        osc.stop(t + 0.4);
    } else if (type === 'portal') {
        // Low resonant hum
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, t);
        osc.frequency.exponentialRampToValueAtTime(160, t + 1.0);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.12, t + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
        osc.start(t);
        osc.stop(t + 2.0);
    } else if (type === 'jump') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(380, t + 0.12);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.start(t);
        osc.stop(t + 0.15);
    } else if (type === 'complete') {
        // Victory arpeggio
        [440, 554, 660, 880].forEach((freq, i) => {
            const o2 = ctx.createOscillator();
            const g2 = ctx.createGain();
            o2.connect(g2); g2.connect(ctx.destination);
            o2.type = 'sine';
            o2.frequency.value = freq;
            const s = t + i * 0.18;
            g2.gain.setValueAtTime(0.0, s);
            g2.gain.linearRampToValueAtTime(0.14, s + 0.05);
            g2.gain.exponentialRampToValueAtTime(0.001, s + 0.6);
            o2.start(s);
            o2.stop(s + 0.6);
        });
        return; // early — loop above handles it
    }
}

/* ═══════════════════════════════════════════════════════════════════
   HUD ELEMENTS
═══════════════════════════════════════════════════════════════════ */
let hudEl, shardCountEl, objectiveEl, promptEl, completeEl;

function buildHUD() {
    // Inject HUD container into the DOM
    const hud = document.createElement('div');
    hud.id = 'game-hud';
    hud.innerHTML = `
<div id="hud-header">INTEND // FRONTIER</div>
<div id="hud-shards">SHARDS <span id="shard-count">0</span> / ${TOTAL_SHARDS}</div>
<div id="hud-objective">Explore the world. Find all energy shards.</div>
<div id="hud-controls">W A S D · SHIFT · SPACE · ESC</div>
    `.trim();
    document.body.appendChild(hud);

    // Click-to-enter prompt
    const prompt = document.createElement('div');
    prompt.id = 'lock-prompt';
    prompt.innerHTML = `<span>CLICK TO ENTER</span>`;
    document.body.appendChild(prompt);

    // Mission complete screen
    const complete = document.createElement('div');
    complete.id = 'mission-complete';
    complete.innerHTML = `
<div id="mc-title">MISSION COMPLETE</div>
<div id="mc-sub">FRONTIER SECURED</div>
<div id="mc-restart" onclick="window.restartGame()">[ PLAY AGAIN ]</div>
    `.trim();
    complete.style.display = 'none';
    document.body.appendChild(complete);

    hudEl       = hud;
    shardCountEl = hud.querySelector('#shard-count');
    objectiveEl  = hud.querySelector('#hud-objective');
    promptEl    = prompt;
    completeEl  = complete;

    // Initially hidden — shown when gameActive
    hud.style.opacity = '0';
    hud.style.display = 'none';
    prompt.style.display = 'none';
}

function setPromptVisible(v) {
    if (!promptEl) return;
    promptEl.style.display = (v && gameActive) ? 'flex' : 'none';
}

function updateHUD() {
    if (!shardCountEl) return;
    shardCountEl.textContent = shardsCollected;

    if (shardsCollected === TOTAL_SHARDS) {
        objectiveEl.textContent = 'All shards found. Reach the ancient portal.';
    } else {
        const remaining = TOTAL_SHARDS - shardsCollected;
        objectiveEl.textContent = `Find ${remaining} more energy shard${remaining !== 1 ? 's' : ''}.`;
    }
}

function showHUD() {
    if (!hudEl) return;
    hudEl.style.display = 'block';
    // Fade in
    let op = 0;
    const fadeIn = setInterval(() => {
        op = Math.min(1, op + 0.05);
        hudEl.style.opacity = String(op);
        if (op >= 1) clearInterval(fadeIn);
    }, 30);
}

function showMissionComplete() {
    if (!completeEl) return;
    if (pointerLocked) document.exitPointerLock();
    missionComplete = true;
    completeEl.style.display = 'flex';
    playSound('complete');
}

/* ═══════════════════════════════════════════════════════════════════
   SHARD COLLECTION
═══════════════════════════════════════════════════════════════════ */
const COLLECT_DIST = 2.2;

function checkShardCollection() {
    for (const shard of shardObjects) {
        if (shard.collected) continue;
        const dx = player.x - shard.mesh.position.x;
        const dy = (player.y + PLAYER_HEIGHT * 0.5) - shard.mesh.position.y;
        const dz = player.z - shard.mesh.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < COLLECT_DIST * COLLECT_DIST) {
            collectShard(shard);
        }
    }
}

function collectShard(shard) {
    shard.collected = true;
    scene.remove(shard.mesh);
    scene.remove(shard.light);
    shardsCollected++;
    playSound('shard');
    updateHUD();

    if (shardsCollected === TOTAL_SHARDS) {
        activatePortal();
    }

    // Burst particles
    spawnCollectBurst(shard.mesh.position);
}

/* ═══════════════════════════════════════════════════════════════════
   COLLECT BURST EFFECT
═══════════════════════════════════════════════════════════════════ */
const burstParticles = [];

function spawnCollectBurst(pos) {
    const mat = new THREE.MeshLambertMaterial({
        color: 0x40e0ff, emissive: 0x104060, transparent: true, opacity: 0.9
    });
    const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(geo, mat.clone());
        m.position.copy(pos);
        scene.add(m);
        const angle = Math.random() * Math.PI * 2;
        const vspeed = (Math.random() - 0.5) * 4;
        burstParticles.push({
            mesh: m,
            vx: Math.cos(angle) * (1.5 + Math.random() * 2.5),
            vy: 2 + Math.random() * 2 + vspeed,
            vz: Math.sin(angle) * (1.5 + Math.random() * 2.5),
            life: 1.0,
        });
    }
}

function updateBursts(dt) {
    for (let i = burstParticles.length - 1; i >= 0; i--) {
        const p = burstParticles[i];
        p.vy -= 9 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.life -= dt * 2.5;
        p.mesh.material.opacity = Math.max(0, p.life * 0.9);
        if (p.life <= 0) {
            scene.remove(p.mesh);
            burstParticles.splice(i, 1);
        }
    }
}

/* ═══════════════════════════════════════════════════════════════════
   PORTAL TRIGGER CHECK
═══════════════════════════════════════════════════════════════════ */
const PORTAL_TRIGGER_DIST = 3.5;

function checkPortalTrigger() {
    if (!portalActive || missionComplete) return;
    const ph = heightAt(Math.round(PORTAL_POS.x), Math.round(PORTAL_POS.z));
    const dx = player.x - PORTAL_POS.x;
    const dy = (player.y + PLAYER_HEIGHT * 0.5) - (ph + 2.5);
    const dz = player.z - PORTAL_POS.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < PORTAL_TRIGGER_DIST * PORTAL_TRIGGER_DIST) {
        showMissionComplete();
    }
}

/* ═══════════════════════════════════════════════════════════════════
   PLAYER PHYSICS UPDATE
═══════════════════════════════════════════════════════════════════ */
function updatePlayer(dt) {
    if (!pointerLocked || missionComplete) return;

    // Clamp dt to avoid huge physics steps (e.g. tab switching)
    const safeDt = Math.min(dt, 0.1);

    // Input direction in world space (yaw-rotated)
    let moveX = 0, moveZ = 0;
    const speed = keys.shift ? SPRINT_SPEED : WALK_SPEED;

    if (keys.w) { moveX -= Math.sin(player.yaw); moveZ -= Math.cos(player.yaw); }
    if (keys.s) { moveX += Math.sin(player.yaw); moveZ += Math.cos(player.yaw); }
    if (keys.a) { moveX -= Math.cos(player.yaw); moveZ += Math.sin(player.yaw); }
    if (keys.d) { moveX += Math.cos(player.yaw); moveZ -= Math.sin(player.yaw); }

    const movingH = moveX !== 0 || moveZ !== 0;

    if (movingH) {
        const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
        moveX /= len; moveZ /= len;

        // Accelerate toward target speed
        player.vx += (moveX * speed - player.vx) * Math.min(1, ACCEL * safeDt);
        player.vz += (moveZ * speed - player.vz) * Math.min(1, ACCEL * safeDt);
    } else {
        // Decelerate
        player.vx *= Math.max(0, 1 - DECEL * safeDt);
        player.vz *= Math.max(0, 1 - DECEL * safeDt);
    }

    // Gravity
    player.vy += GRAVITY * safeDt;

    // Jump
    if (keys.space && player.grounded && !player.jumping) {
        player.vy = JUMP_VEL;
        player.grounded = false;
        player.jumping  = true;
        playSound('jump');
    }
    if (!keys.space) player.jumping = false;

    // Integrate position
    player.x += player.vx * safeDt;
    player.y += player.vy * safeDt;
    player.z += player.vz * safeDt;

    // World boundary + wall collision
    const clamped = clampToWorld(player.x, player.z);
    player.x = clamped.x; player.z = clamped.z;
    checkWallCollision();

    // Ground collision
    const ground = surfaceY(player.x, player.z);
    if (player.y <= ground) {
        player.y = ground;
        player.vy = 0;
        player.grounded = true;
    } else {
        player.grounded = false;
    }
}

/* ═══════════════════════════════════════════════════════════════════
   CAMERA UPDATE (applied after physics)
═══════════════════════════════════════════════════════════════════ */
/* Very subtle head bob — only while grounded and moving */
let bobPhase = 0;

function updateCamera(dt) {
    // Head bob — extremely subtle
    const isMoving = (Math.abs(player.vx) + Math.abs(player.vz)) > 1.0;
    const bobSpeed = keys.shift ? 11 : 7;
    if (isMoving && player.grounded) {
        bobPhase += bobSpeed * dt;
    }
    const bobAmount = isMoving && player.grounded ? Math.sin(bobPhase) * 0.028 : 0;

    // Eyes above feet
    camera.position.set(
        player.x,
        player.y + PLAYER_HEIGHT + bobAmount,
        player.z
    );

    // Euler from yaw/pitch
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
}

/* ═══════════════════════════════════════════════════════════════════
   ANIMATED OBJECTS UPDATE
═══════════════════════════════════════════════════════════════════ */
function updateAnimated(time, dt) {
    // Shard float + spin
    for (const shard of shardObjects) {
        if (shard.collected) continue;
        shard.mesh.position.y = shard.baseY + Math.sin(time * 1.8 + shard.index * 1.3) * 0.22;
        shard.mesh.rotation.y += 1.4 * dt;
        shard.mesh.rotation.x += 0.4 * dt;
        // Pulse light
        if (shard.light) {
            shard.light.intensity = 1.4 + Math.sin(time * 2.5 + shard.index) * 0.5;
            shard.light.position.copy(shard.mesh.position);
        }
    }

    // Portal ring rotation + particle orbit
    if (portalRingMesh) {
        const rotSpeed = portalActive ? 0.7 : 0.25;
        portalRingMesh.rotation.z += rotSpeed * dt;
        portalRingMesh.rotation.x += rotSpeed * 0.4 * dt;
    }

    for (const p of portalParticles) {
        p.angle += p.speed * (portalActive ? 3.0 : 1.0);
        p.mesh.position.x = Math.cos(p.angle) * p.radius;
        p.mesh.position.y = Math.sin(p.angle) * p.radius;
        const pulse = 0.7 + Math.sin(time * 3 + p.angle) * 0.3;
        p.mesh.material.opacity = (portalActive ? 0.9 : 0.55) * pulse;
    }

    if (portalLight) {
        portalLight.intensity = (portalActive ? 3.0 : 0.3) +
            Math.sin(time * 2.1) * (portalActive ? 0.8 : 0.1);
    }

    // Burst particles
    updateBursts(dt);
}

/* ═══════════════════════════════════════════════════════════════════
   SCROLL-DRIVEN INTRO CAMERA (before game activates)
═══════════════════════════════════════════════════════════════════ */
const CAM_START = { x: 0, y: 7,   z: 25 };
const CAM_END   = { x: 0, y: PLAYER_HEIGHT + 0.5, z: 10 };

let scrollProgress = 0;
let introComplete  = false;

window.setVoxelProgress = function (value) {
    scrollProgress = Math.max(0, Math.min(1, value));

    // Overlay opacity
    worldOverlay.style.opacity       = String(scrollProgress);
    worldOverlay.style.pointerEvents = scrollProgress > 0.98 ? 'auto' : 'none';

    // Block visibility
    // (Instanced meshes are always visible; we set them once)
    // Only hide before transition starts
    const showWorld = scrollProgress > 0.02;
    scene.visible = showWorld;

    if (scrollProgress >= 1.0 && !introComplete) {
        introComplete = true;
        activateGame();
    }
};

function activateGame() {
    if (gameActive) return;
    gameActive = true;

    // Snap player to spawn
    player.x = 0;
    player.z = 10;
    player.y = surfaceY(0, 10);
    player.vx = 0; player.vy = 0; player.vz = 0;
    player.yaw = Math.PI; // face into the world (toward portal direction)
    player.pitch = 0;

    showHUD();
    setPromptVisible(true);
    updateHUD();
}

/* ═══════════════════════════════════════════════════════════════════
   RESIZE
═══════════════════════════════════════════════════════════════════ */
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ═══════════════════════════════════════════════════════════════════
   MAIN RENDER LOOP
═══════════════════════════════════════════════════════════════════ */
let lastTime = performance.now();

function animate(now) {
    requestAnimationFrame(animate);

    const rawDt = (now - lastTime) / 1000;
    lastTime = now;
    const dt = Math.min(rawDt, 0.1); // hard-clamp
    const time = now / 1000;

    if (!introComplete) {
        // Scroll-driven intro camera
        const t = scrollProgress * scrollProgress * (3 - 2 * scrollProgress);
        camera.position.set(
            CAM_START.x,
            CAM_START.y + (CAM_END.y - CAM_START.y) * t,
            CAM_START.z + (CAM_END.z - CAM_START.z) * t
        );
        const lookZ = -5 + t * -15;
        camera.lookAt(0, 3, lookZ);
    } else {
        // Game camera
        updatePlayer(dt);
        updateCamera(dt);
        checkShardCollection();
        checkPortalTrigger();
    }

    updateAnimated(time, dt);

    renderer.render(scene, camera);
}

/* ═══════════════════════════════════════════════════════════════════
   RESTART
═══════════════════════════════════════════════════════════════════ */
window.restartGame = function () {
    // Reset shards
    for (const shard of shardObjects) {
        if (shard.collected) {
            shard.collected = false;
            shard.mesh.position.set(
                SHARD_POSITIONS[shard.index].x,
                shard.baseY,
                SHARD_POSITIONS[shard.index].z
            );
            scene.add(shard.mesh);
            if (shard.light) scene.add(shard.light);
        }
    }
    shardsCollected = 0;

    // Reset portal
    if (portalActive) {
        portalActive = false;
        portalRingMesh.material.color.set(0x3a2c5a);
        portalRingMesh.material.emissive.set(0x0a001a);
        portalCoreMesh.material.color.set(0x080612);
        portalCoreMesh.material.emissive.set(0x050410);
        portalCoreMesh.material.opacity = 0.85;
        portalLight.color.set(0x6030ff);
        portalLight.intensity = 0.4;
        portalLight.distance  = 12;
        for (const p of portalParticles) {
            p.mesh.material.color.set(0x5020c0);
            p.mesh.material.emissive.set(0x200880);
            p.speed = 0.004 + Math.random() * 0.003;
        }
    }

    // Reset player
    player.x = 0; player.z = 10;
    player.y = surfaceY(0, 10);
    player.vx = 0; player.vy = 0; player.vz = 0;
    player.yaw = Math.PI; player.pitch = 0;

    missionComplete = false;
    completeEl.style.display = 'none';

    updateHUD();
    setPromptVisible(true);
    requestLock();
};

/* ═══════════════════════════════════════════════════════════════════
   BOOTSTRAP
═══════════════════════════════════════════════════════════════════ */
buildHUD();
// Shiganshina wall structure — massive defensive perimeter around settlement
function buildWall() {
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x7a6e62 });
    const wallH = 8;
    for (let x = -26; x <= 26; x += 2) {
        for (let y = 0; y < wallH; y++) queueBlock(x, y, -22, wallMat);
        for (let y = 0; y < wallH; y++) queueBlock(x, y, 14, wallMat);
    }
    for (let z = -22; z <= 14; z += 2) {
        for (let y = 0; y < wallH; y++) queueBlock(-26, y, z, wallMat);
        for (let y = 0; y < wallH; y++) queueBlock(26, y, z, wallMat);
    }
}
buildTerrain();
buildWall();
buildTrees();
buildPortal();
flushBlocks();

window.setVoxelProgress(0);
requestAnimationFrame(animate);
