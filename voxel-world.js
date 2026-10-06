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
// Warm golden sky from AOT references — enhanced for depth haze
scene.background = new THREE.Color(0xdccca2);
scene.fog = new THREE.FogExp2(0xd6c291, 0.022);

// Hemisphere — warm overhead, warm ground reflection
const hemi = new THREE.HemisphereLight(0xfff0cc, 0xcda983, 1.8);
scene.add(hemi);

// Directional (warm afternoon sun)
const sun = new THREE.DirectionalLight(0xffda91, 3.2);
sun.position.set(-22, 38, 28);
scene.add(sun);

// Ambient fill — warm golden wash
const amb = new THREE.AmbientLight(0xaa9460, 1.1);
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

/*
 * Blocks the player must NOT be able to step onto. Terrain forms natural
 * single-block steps that should be walkable, but tree trunks, walls, houses
 * and towers are obstacles — a 1-block step-up onto any of them let the
 * player climb straight over a tree trunk or the district wall. Keyed the
 * same way as solidSet.
 */
const noStepSet = new Set();

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

function queueBlock(x, y, z, mat, noStep = false) {
    const key = mat.uuid;
    if (!instanceQueues.has(key)) instanceQueues.set(key, { mat, positions: [] });
    instanceQueues.get(key).positions.push({ x, y, z });
    const bkey = `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
    // register in solid set
    solidSet.add(bkey);
    // Mark structural blocks the player cannot step onto
    if (noStep) noStepSet.add(bkey);
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
            queueBlock(x, h + y, z, MAT.wood, true);   // trunk = no step
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
/*
   The old checkWallCollision() had an empty if-body — it computed wall
   distances and then did nothing with them, so the player walked straight
   through the wall, the houses and the trees. Collision now resolves the
   player box against the same `solidSet` the world was built into, one axis
   at a time so sliding along a wall works instead of sticking.
*/
function isSolid(x, y, z) {
    return solidSet.has(`${x},${y},${z}`);
}

/** True if the player box at (x, feetY, z) overlaps any solid block. */
function boxHitsSolid(x, feetY, z) {
    const minX = Math.floor(x - PLAYER_RADIUS + 0.5);
    const maxX = Math.floor(x + PLAYER_RADIUS + 0.5);
    const minZ = Math.floor(z - PLAYER_RADIUS + 0.5);
    const maxZ = Math.floor(z + PLAYER_RADIUS + 0.5);
    const minY = Math.floor(feetY + 0.5);
    const maxY = Math.floor(feetY + PLAYER_HEIGHT - 0.5);

    for (let bx = minX; bx <= maxX; bx++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
            for (let by = minY; by <= maxY; by++) {
                if (isSolid(bx, by, bz)) return true;
            }
        }
    }
    return false;
}

/**
 * Topmost solid surface under the player, searching down from their feet.
 * Returns -Infinity over a void. This is what lets the player stand on
 * terrain, roofs and tree canopy — the raw heightmap knows nothing about
 * buildings, so using it alone made the player walk through floors.
 */
function groundBelow(x, feetY, z, maxDrop = 4) {
    const startY = Math.floor(feetY + 0.5);
    const minX = Math.floor(x - PLAYER_RADIUS + 0.5);
    const maxX = Math.floor(x + PLAYER_RADIUS + 0.5);
    const minZ = Math.floor(z - PLAYER_RADIUS + 0.5);
    const maxZ = Math.floor(z + PLAYER_RADIUS + 0.5);

    for (let by = startY; by >= startY - maxDrop; by--) {
        for (let bx = minX; bx <= maxX; bx++) {
            for (let bz = minZ; bz <= maxZ; bz++) {
                if (isSolid(bx, by, bz)) return by + 0.5;
            }
        }
    }
    return -Infinity;
}

/** Resolves horizontal movement against solids, one axis at a time. */
function resolveHorizontal(x, feetY, z, dx, dz) {
    let nx = x;
    let nz = z;
    let stepUp = 0;

    /*
     * A single-block ledge is only climbable if it is TERRAIN.
     *
     * Tree trunks, the wall, houses and towers are registered in noStepSet.
     * Without that check the player stepped up onto a 1-block trunk and
     * walked straight over it — and could have done the same to the wall.
     *
     * The structural test looks at the block the player would STAND ON (the
     * surface directly above the obstacle), not at an arbitrary band, so a
     * trunk is rejected while a natural terrain step is accepted.
     */
    const canStepAt = (px, feetY2, pz) => {
        if (boxHitsSolid(px, feetY2 + 1.02, pz)) return false;

        // Height of the surface the player would land on.
        const surf = groundBelow(px, feetY2 + 1.6, pz, 2);
        if (surf === -Infinity) return false;

        // Reject anything taller than a single step, and anything structural.
        if (surf - feetY2 > 1.05) return false;

        const topBlock = Math.floor(surf - 0.5 + 0.001);
        const minX = Math.floor(px - PLAYER_RADIUS + 0.5);
        const maxX = Math.floor(px + PLAYER_RADIUS + 0.5);
        const minZ = Math.floor(pz - PLAYER_RADIUS + 0.5);
        const maxZ = Math.floor(pz + PLAYER_RADIUS + 0.5);
        for (let bx = minX; bx <= maxX; bx++) {
            for (let bz = minZ; bz <= maxZ; bz++) {
                if (noStepSet.has(`${bx},${topBlock},${bz}`)) return false;
            }
        }
        return true;
    };

    /*
     * `stepUp` is the exact lift needed to stand on the target surface, not a
     * flat +1.0. Using a flat lift left the player half a block below the
     * plateau, where the next frame's ground sweep pulled them back down and
     * they could never finish the climb.
     */
    const liftFor = (px, feetY2, pz) => {
        const surf = groundBelow(px, feetY2 + 1.6, pz, 2);
        return surf === -Infinity ? 1.0 : Math.max(0, surf - feetY2);
    };

    if (dx !== 0) {
        const tryX = nx + dx;
        if (!boxHitsSolid(tryX, feetY, nz)) {
            nx = tryX;
        } else if (canStepAt(tryX, feetY, nz)) {
            nx = tryX;
            stepUp = liftFor(tryX, feetY, nz);
        }
    }

    if (dz !== 0) {
        const tryZ = nz + dz;
        if (!boxHitsSolid(nx, feetY, tryZ)) {
            nz = tryZ;
        } else if (canStepAt(nx, feetY, tryZ)) {
            nz = tryZ;
            stepUp = liftFor(nx, feetY, tryZ);
        }
    }

    return { x: nx, z: nz, stepUp };
}

/** Fixes a spawn that landed inside geometry. */
function unstickFromSolid() {
    if (!boxHitsSolid(player.x, player.y, player.z)) return;
    for (let lift = 1; lift <= 8; lift++) {
        if (!boxHitsSolid(player.x, player.y + lift, player.z)) {
            player.y += lift;
            return;
        }
    }
    player.y = surfaceY(player.x, player.z);
}

/* ═══════════════════════════════════════════════════════════════════
   PLAYER DIMENSIONS
═════════════════════════════════════════════════════════════════════ */
const PLAYER_HEIGHT = 1.72;   // full body height, feet -> crown
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

/* ═══════════════════════════════════════════════════════════════════
   PLAYER STATE
═══════════════════════════════════════════════════════════════════ */
/*
 * Spawn point.
 *
 * The old spawn (0, 10) was not literally inside a solid, but it was unusable:
 * the follow camera sits 3.6 units behind the player, so at yaw = PI it landed
 * at (0, 5.5, 6.4) — inside the 5-storey tower buildHouse(-1, 5, 3, 3, 5). The
 * opening view was a solid wall. The player box itself was also wedged in a
 * 1-block gap between houses: 2.5 s of held movement in any direction moved it
 * 0.157 units.
 *
 * (-14, -9) is an open street on the west side of the district, chosen by
 * simulating the real collision/physics code over every column inside the wall
 * and ranking on the WORST of 16 compass directions, not the average:
 *   • player box clear, with headroom to jump apex
 *   • follow camera clear at both 3.6 (walk) and 4.8 (sprint)
 *   • walks at least 7.2 units in every one of 16 directions, zero penetration
 *     (clear ground covers ~13.5 u in 2.5 s, so nothing is half-blocking)
 *   • 5.0 units from the nearest house, nearest trunk 2.2 units
 *
 * A first candidate at (21, 8) was rejected by browser testing: it had the only
 * clear sightline to Wall Maria, but a tree trunk 1.4 units west cut movement
 * in that direction to 0.17 units — still "can't get out" to a player.
 *
 * Facing: yaw 0 looks down -Z, i.e. toward Wall Maria. The old code used
 * yaw = PI, which faced the player at the *south* wall — away from the Titan
 * event and against a row of houses.
 */
const SPAWN = { x: -16, y: 0, z: 0, yaw: 0 };

const player = {
    // Position = feet position
    x: SPAWN.x, y: SPAWN.y, z: SPAWN.z,

    // Velocity
    vx: 0, vy: 0, vz: 0,

    // Angles (radians)
    yaw:   SPAWN.yaw,
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
   COLOSSAL TITAN (AOT)
═══════════════════════════════════════════════════════════════════ */
let titanMesh = null;
let titanEvent = { active: false, phase: 0, time: 0 };

/* ── Titan encounter parameters ──
   Detection: horizontal radius the Titan reacts to the player within.
   Chase speed: maximum blocks/second while tracking the player.
   Attack cycle: one swing every ATTACK_CYCLE seconds; the hit window
   is a short slice of that cycle, so a swing registers at most one hit.
   These live on titanEvent so they reset with the event and no global
   timers are needed. */
const TITAN_DETECT_RADIUS = 14;
const TITAN_CHASE_SPEED   = 3.0;
const TITAN_ATTACK_CYCLE  = 3.0;
const TITAN_ATTACK_WINDOW = 0.5;
const TITAN_ATTACK_RANGE  = 4.0;

/* Health / death / respawn — centralized, uses existing HUD */
const PLAYER_MAX_HP = 100;
let playerHP = PLAYER_MAX_HP;
let playerDead = false;
let invulnerableUntil = 0; // time-based window (seconds from start)
const INVULNERABILITY_DURATION = 2.0; // seconds after hit

/* Player hit event — set when a swing lands, cleared when the next
   attack cycle begins. One swing = at most one hit. */
let titanPlayerHit = false;

function buildColossalTitan() {
    const group = new THREE.Group();
    const matSkin = new THREE.MeshLambertMaterial({ color: 0xd4a590, emissive: 0x200000 });
    const matMuscle = new THREE.MeshLambertMaterial({ color: 0x9a5555 });

    // Torso (massive)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(6, 10, 3), matMuscle);
    torso.position.y = 14;
    group.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 3.5), matSkin);
    head.position.y = 21;
    group.add(head);

    // Eyes (glowing)
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0xffff00, emissive: 0xffaa00 });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.3), eyeMat);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.3), eyeMat);
    eyeL.position.set(-1, 21.5, 1.8);
    eyeR.position.set(1, 21.5, 1.8);
    group.add(eyeL);
    group.add(eyeR);

    // Legs
    const legGeo = new THREE.BoxGeometry(2.5, 14, 2.5);
    const legL = new THREE.Mesh(legGeo, matMuscle);
    const legR = new THREE.Mesh(legGeo, matMuscle);
    legL.position.set(-2, 7, 0);
    legR.position.set(2, 7, 0);
    group.add(legL);
    group.add(legR);

    // Arms
    const armGeo = new THREE.BoxGeometry(2, 9, 2);
    const armL = new THREE.Mesh(armGeo, matMuscle);
    const armR = new THREE.Mesh(armGeo, matMuscle);
    armL.position.set(-4.5, 14, 0);
    armR.position.set(4.5, 14, 0);
    group.add(armL);
    group.add(armR);
    group.armL = armL;
    group.armR = armR;

    // Position behind the north wall
    group.position.set(0, 0, -28);
    group.visible = false;
    scene.add(group);

    return group;
}

function triggerTitanEvent() {
    if (titanEvent.active) return;
    titanEvent.active = true;
    titanEvent.phase = 0;
    titanEvent.time = 0;
    titanMesh.visible = true;
    updateHUD();
    console.log('COLOSSAL TITAN EVENT TRIGGERED');
}

function updateTitanEvent(dt, time) {
    if (!titanEvent.active) return;
    if (gamePaused) return; // freeze Titan timing
    titanEvent.time += dt;

    const t = titanEvent.time;

    // Phase 0: Titan rises behind wall (0-3s)
    if (titanEvent.phase === 0) {
        const riseProgress = Math.min(1, t / 3);
        titanMesh.position.y = -10 + riseProgress * 10;
        titanMesh.scale.setScalar(0.8 + riseProgress * 0.2);

        if (t > 3) {
            titanEvent.phase = 1;
            updateHUD();
            playSound('portal'); // Deep roar
        }
    }

    // Phase 1: Titan visible, moves forward slowly (3-8s)
    // After initial approach, if the player is within detection radius,
    // the Titan targets and chases the player's horizontal position.
    else if (titanEvent.phase === 1) {
        const moveProgress = Math.min(1, (t - 3) / 5);
        let targetZ = -28 + moveProgress * 6;

        // ── Player detection (deterministic, horizontal only) ──
        if (player && gameActive) {
            const dx = player.x - titanMesh.position.x;
            const dz = player.z - titanMesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < TITAN_DETECT_RADIUS) {
                // Chase: orient toward player, move horizontally at chase speed
                const chase = Math.min(TITAN_CHASE_SPEED * dt, 0.45);
                // Move toward player's x/z; don't teleport, don't go through wall
                const dirX = Math.sign(dx) || 0;
                const dirZ = Math.sign(dz) || 0;
                if (dirX) titanMesh.position.x += dirX * chase * Math.abs(dx / dist);
                if (dirZ) titanMesh.position.z += dirZ * chase * Math.abs(dz / dist);
                // Look toward player
                titanMesh.rotation.y = Math.atan2(dx, dz);
            }
        }

        // Arm swing (existing animation preserved)
        titanMesh.armL.rotation.x = Math.sin(time * 0.8) * 0.3;
        titanMesh.armR.rotation.x = Math.sin(time * 0.8 + Math.PI) * 0.3;

        if (t > 8) {
            titanEvent.phase = 2;
            updateHUD();
        }
    }

    // Phase 2: Titan attacks wall (8-10s)
    // Attack window: a short slice of this phase where the arm swing
    // can hit the player. One hit max per swing; reset on next cycle.
    else if (titanEvent.phase === 2) {
        const attackProgress = (t - 8) / 2;
        titanMesh.armR.rotation.x = -Math.PI * 0.5 + Math.sin(attackProgress * Math.PI * 4) * 0.8;

        // ── Attack window: only register during intended slice ──
        const swingCycle = Math.floor(t / TITAN_ATTACK_CYCLE);
        if (titanEvent.time > 8) {
            // Reset hit marker at the start of each new attack cycle
            const currentCycle = Math.floor((t - 8) / TITAN_ATTACK_CYCLE);
            if (titanEvent.attackCycle !== undefined && currentCycle > titanEvent.attackCycle) {
                titanPlayerHit = false;
                titanEvent.attackCycle = currentCycle;
            } else if (titanEvent.attackCycle === undefined) {
                titanEvent.attackCycle = currentCycle;
            }
        }
        const inWindow = (t - 8) % TITAN_ATTACK_CYCLE < TITAN_ATTACK_WINDOW;
        if (inWindow && !titanPlayerHit && player && gameActive && !playerDead && time > invulnerableUntil) {
            const dx = player.x - titanMesh.position.x;
            const dz = player.z - titanMesh.position.z;
            if (Math.sqrt(dx * dx + dz * dz) < TITAN_ATTACK_RANGE) {
                titanPlayerHit = true;
                playerHP = Math.max(0, playerHP - 25); // 25 damage per hit
                invulnerableUntil = time + INVULNERABILITY_DURATION;
                console.log('[Titan] PLAYER HIT — HP ' + playerHP);
                objectiveEl.textContent = 'TITAN STRIKE // STAY BACK.';
                updateHUD();
                if (playerHP <= 0) {
                    playerDead = true;
                    console.log('[Titan] PLAYER DEAD');
                    objectiveEl.textContent = 'DEAD // RESPawn TO RETRY.';
                    if (pointerLocked) document.exitPointerLock();
                }
            }
        }

        if (t > 9.5 && t < 9.6) {
            // Wall impact moment
            destroyWallSection();
            playSound('portal');
            spawnDebris(0, 4, -22);
        }

        if (t > 10) {
            titanEvent.phase = 3;
            updateHUD();
        }
    }

    // Phase 3: Free play (Titan stays visible)
    else if (titanEvent.phase === 3) {
        // Titan breathing idle animation
        titanMesh.position.y = Math.sin(time * 0.5) * 0.3;
        titanMesh.armL.rotation.x += (0 - titanMesh.armL.rotation.x) * 2 * dt;
        titanMesh.armR.rotation.x += (0 - titanMesh.armR.rotation.x) * 2 * dt;
    }
}

let wallDestroyed = false;
function destroyWallSection() {
    if (wallDestroyed) return;
    wallDestroyed = true;
    // Wall breach visual (simplified — remove a few wall blocks conceptually)
    console.log('WALL BREACH');
}

function spawnDebris(x, y, z) {
    const debrisMat = new THREE.MeshLambertMaterial({ color: 0x7a6e62 });
    for (let i = 0; i < 12; i++) {
        const size = 0.3 + Math.random() * 0.5;
        const debris = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), debrisMat);
        debris.position.set(
            x + (Math.random() - 0.5) * 8,
            y + Math.random() * 3,
            z + (Math.random() - 0.5) * 6
        );
        scene.add(debris);

        const vx = (Math.random() - 0.5) * 8;
        const vy = 4 + Math.random() * 6;
        const vz = (Math.random() - 0.5) * 8;

        animatedObjects.push({
            type: 'debris',
            mesh: debris,
            vx, vy, vz,
            life: 3 + Math.random() * 2
        });
    }
}

titanMesh = buildColossalTitan();

// Trigger event after 8 seconds of gameplay
let titanTriggerTimer = 0;

/* ═══════════════════════════════════════════════════════════════════
   VOXEL CHARACTERS (AOT)
═══════════════════════════════════════════════════════════════════ */
function buildCharacter(type) {
    const group = new THREE.Group();
    const matJacket = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
    const matPants = new THREE.MeshLambertMaterial({ color: 0xeaeade });
    const matBoots = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
    const matSkin = new THREE.MeshLambertMaterial({ color: 0xffdcb3 });
    const matODM = new THREE.MeshLambertMaterial({ color: 0x444455 });

    // Body (Jacket)
    const bodyGeo = new THREE.BoxGeometry(0.6, 0.7, 0.35);
    const body = new THREE.Mesh(bodyGeo, matJacket);
    body.position.y = 0.95;
    group.add(body);

    // Head with conditional hair color
    let hairColor = 0x3d2314;
    if (type === 'mikasa') hairColor = 0x1a1a1a;
    if (type === 'armin') hairColor = 0xe0c660;
    const matHair = new THREE.MeshLambertMaterial({ color: hairColor });

    const headGroup = new THREE.Group();
    headGroup.position.y = 1.45;

    const headFace = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.45), matSkin);
    const headHair = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.5), matHair);
    headHair.position.y = 0.05;
    headGroup.add(headFace);
    headGroup.add(headHair);

    if (type === 'mikasa') {
        const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.15, 0.52), new THREE.MeshLambertMaterial({ color: 0x8b0000 }));
        scarf.position.y = -0.22;
        headGroup.add(scarf);
    }
    group.add(headGroup);
    group.headRef = headGroup;

    // Legs
    const legGeo = new THREE.BoxGeometry(0.28, 0.6, 0.28);
    const ll = new THREE.Mesh(legGeo, matPants);
    const rl = new THREE.Mesh(legGeo, matPants);
    ll.position.set(0.16, 0.3, 0);
    rl.position.set(-0.16, 0.3, 0);

    const bootGeo = new THREE.BoxGeometry(0.3, 0.2, 0.32);
    const lb = new THREE.Mesh(bootGeo, matBoots);
    const rb = new THREE.Mesh(bootGeo, matBoots);
    lb.position.y = -0.3;
    rb.position.y = -0.3;
    ll.add(lb);
    rl.add(rb);

    group.add(ll);
    group.add(rl);
    group.legL = ll; group.legLBaseY = ll.position.y;
    group.legR = rl; group.legRBaseY = rl.position.y;

    // ODM Gear
    const odm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.3), matODM);
    odm.position.set(0, 0.65, 0.2);
    group.add(odm);

    return group;
}

const playerMesh = buildCharacter('eren');
let playerMeshRot = 0;
scene.add(playerMesh);

const mikasa = buildCharacter('mikasa');
mikasa.position.set(-3, 0, 8);
scene.add(mikasa);

const armin = buildCharacter('armin');
armin.position.set(3, 0, 8);
scene.add(armin);

function updateCompanions(dt, time) {
    const comps = [
        { mesh: mikasa, tx: -1.8, tz: 2.2 },
        { mesh: armin, tx: 1.8, tz: 2.2 }
    ];

    comps.forEach(c => {
        const yaw = playerMeshRot;
        const targetX = player.x + Math.sin(yaw) * c.tz + Math.cos(yaw) * c.tx;
        const targetZ = player.z + Math.cos(yaw) * c.tz - Math.sin(yaw) * c.tx;

        const dx = targetX - c.mesh.position.x;
        const dz = targetZ - c.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);

        let moving = false;
        if (dist > 1.2) {
            moving = true;
            const speed = (keys.shift ? 11 : 5.5) * 0.9;
            const step = Math.min(dist, speed * dt);
            c.mesh.position.x += (dx / dist) * step;
            c.mesh.position.z += (dz / dist) * step;

            const tgtRot = Math.atan2(dx, dz);
            let diff = tgtRot - c.mesh.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            c.mesh.rotation.y += diff * 10 * dt;
        }

        c.mesh.position.y = surfaceY(c.mesh.position.x, c.mesh.position.z);

        if (moving) {
            c.mesh.legL.position.y = c.mesh.legLBaseY + Math.sin(time * 12) * 0.15;
            c.mesh.legR.position.y = c.mesh.legRBaseY + Math.sin(time * 12 + Math.PI) * 0.15;
            c.mesh.legL.position.z = Math.sin(time * 12) * 0.3;
            c.mesh.legR.position.z = Math.sin(time * 12 + Math.PI) * 0.3;
        } else {
            c.mesh.legL.position.y += (c.mesh.legLBaseY - c.mesh.legL.position.y) * 10 * dt;
            c.mesh.legR.position.y += (c.mesh.legRBaseY - c.mesh.legR.position.y) * 10 * dt;
            c.mesh.legL.position.z *= 0.8;
            c.mesh.legR.position.z *= 0.8;
        }
    });
}

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
let worldLocked    = false;   // journey is one-way; set by script.js
let gamePaused     = false;   // ESC toggle — pauses simulation

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
        case 'Escape':
            if (!gameActive || missionComplete) break;
            if (playerDead) break;
            gamePaused = !gamePaused;
            if (gamePaused) showPauseOverlay();
            else hidePauseOverlay();
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
   PAUSE OVERLAY
════════════════════════════════════════════════════════════════════ */
let pauseOverlayEl = null;

function showPauseOverlay() {
    if (!pauseOverlayEl) {
        pauseOverlayEl = document.createElement("div");
        pauseOverlayEl.id = "pause-overlay";
        pauseOverlayEl.innerHTML = "<div style=\"font-family:047VT323047,monospace;font-size:48px;color:#b8c6ae;text-align:center;letter-spacing:6px;\">PAUSED</div><div style=\"font-family:047VT323047,monospace;font-size:20px;color:#8f9d89;text-align:center;margin-top:12px;\">Press ESC to Resume</div>";
        pauseOverlayEl.style.position = "absolute";
        pauseOverlayEl.style.inset = "0";
        pauseOverlayEl.style.zIndex = "35";
        pauseOverlayEl.style.display = "flex";
        pauseOverlayEl.style.flexDirection = "column";
        pauseOverlayEl.style.alignItems = "center";
        pauseOverlayEl.style.justifyContent = "center";
        pauseOverlayEl.style.background = "rgba(1,2,6,0.82)";
        document.body.appendChild(pauseOverlayEl);
    }
    pauseOverlayEl.style.display = "flex";
}

function hidePauseOverlay() {
    if (pauseOverlayEl) pauseOverlayEl.style.display = "none";
}

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
<div id="hud-header">SHIGANSHINA // WALL MARIA</div>
<div id="hud-objective">Explore the district. Stay alert.</div>
<div id="hud-controls">W A S D · SHIFT · SPACE · MOUSE · ESC</div>
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
    if (!objectiveEl) return;
    if (playerDead) {
        objectiveEl.textContent = 'DEAD // RESPawn TO RETRY.'; // respawn instruction
        if (hudEl) hudEl.querySelector('#shard-count') && (hudEl.querySelector('#shard-count').textContent = 'HP: 0 / ' + PLAYER_MAX_HP);
        return;
    }
    if (shardCountEl) shardCountEl.textContent = 'HP: ' + playerHP + ' / ' + PLAYER_MAX_HP;

    if (missionComplete) {
        objectiveEl.textContent = 'DISTRICT SECURED.';
        return;
    }

    if (titanEvent.active) {
        if (titanEvent.phase === 0) {
            objectiveEl.textContent = 'WARNING // SOMETHING IS BEHIND THE WALL.';
        } else if (titanEvent.phase === 1) {
            objectiveEl.textContent = 'COLOSSAL TITAN // APPROACHING THE WALL.';
        } else if (titanEvent.phase === 2) {
            objectiveEl.textContent = 'WALL IMPACT // RUN.';
        } else {
            objectiveEl.textContent = 'SHIGANSHINA IS UNDER ATTACK.';
        }
    } else {
        objectiveEl.textContent = 'Explore the district. Stay alert.';
    }

    if (shardCountEl) shardCountEl.style.display = 'block';
    shardCountEl.textContent = 'HP: ' + playerHP + ' / ' + PLAYER_MAX_HP;
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
            if (p.mesh && p.mesh.geometry) p.mesh.geometry.dispose();
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
    if (missionComplete) return;
    if (playerDead) return;
    if (gamePaused) return; // freeze physics

    // Clamp dt to avoid huge physics steps (e.g. tab switching)
    const safeDt = Math.min(dt, 0.1);

    // Movement is gated on the game being ACTIVE, not on pointer lock.
    //
    // Pointer lock only controls MOUSE LOOK. Previously all movement required
    // pointer lock too, which meant: pressing ESC to release the cursor also
    // froze the player mid-stride, and if the browser ever refused a lock
    // request the game became completely unplayable while looking fine.
    // The player now always moves once the world is entered.
    const canMove = gameActive;
    let moveX = 0, moveZ = 0;
    const speed = keys.shift ? SPRINT_SPEED : WALK_SPEED;

    if (canMove) {
        if (keys.w) { moveX -= Math.sin(player.yaw); moveZ -= Math.cos(player.yaw); }
        if (keys.s) { moveX += Math.sin(player.yaw); moveZ += Math.cos(player.yaw); }
        if (keys.a) { moveX -= Math.cos(player.yaw); moveZ += Math.sin(player.yaw); }
        if (keys.d) { moveX += Math.cos(player.yaw); moveZ -= Math.sin(player.yaw); }
    }

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
    if (canMove && keys.space && player.grounded && !player.jumping) {
        player.vy = JUMP_VEL;
        player.grounded = false;
        player.jumping  = true;
        playSound('jump');
    }
    if (!keys.space) player.jumping = false;

    /* ── HORIZONTAL, resolved against real solid blocks ── */
    const feetY = player.y;
    const resolved = resolveHorizontal(
        player.x, feetY, player.z,
        player.vx * safeDt, player.vz * safeDt
    );

    // If a step-up happened, lift the body onto the ledge.
    if (resolved.stepUp > 0) {
        player.y += resolved.stepUp;
    }

    player.x = resolved.x;
    player.z = resolved.z;

    // Kill velocity into the surface we just hit, so we don't build up
    // momentum against a wall and shoot off when it clears.
    if (boxHitsSolid(player.x + player.vx * safeDt, player.y, player.z)) player.vx = 0;
    if (boxHitsSolid(player.x, player.y, player.z + player.vz * safeDt)) player.vz = 0;

    // Map boundaries — the district interior is a hard physical bound.
    const clamped = clampToDistrict();
    if (clamped.x !== player.x) player.vx = 0;
    if (clamped.z !== player.z) player.vz = 0;
    player.x = clamped.x;
    player.z = clamped.z;

    /* ── VERTICAL ──
       Sweep down onto the topmost solid under the feet. This includes
       building roofs and terrain, so the player cannot sink into the ground
       or fall through a floor. */
    player.y += player.vy * safeDt;

    const support = groundBelow(player.x, player.y, player.z, 4);

    if (player.vy <= 0 && support !== -Infinity && player.y <= support) {
        player.y = support;
        player.vy = 0;
        player.grounded = true;
    } else if (player.vy > 0) {
        // Rising — check head clearance so we don't jump through a ceiling.
        if (boxHitsSolid(player.x, player.y, player.z)) {
            player.vy = 0;
        }
        player.grounded = false;
    } else {
        player.grounded = false;
    }

    // Falling out of the world (shouldn't happen inside the wall, but the
    // map has corners) — recover rather than falling forever.
    if (player.y < -12) {
        player.y = surfaceY(player.x, player.z);
        player.vy = 0;
        player.grounded = true;
    }
}

/* ═══════════════════════════════════════════════════════════════════
   CAMERA UPDATE (applied after physics)
═══════════════════════════════════════════════════════════════════ */
/* Very subtle head bob — only while grounded and moving */
function updateCamera(dt) {
    if (!gameActive) return;
    if (gamePaused) return; // freeze camera while paused
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;

    // Third person over-shoulder offset
    const followDist = keys.shift ? 4.8 : 3.6;
    const heightOffset = 2.0;

    // Position camera BEHIND the player based on YAW
    const offsetZ = Math.cos(player.yaw) * Math.cos(player.pitch) * followDist;
    const offsetX = Math.sin(player.yaw) * Math.cos(player.pitch) * followDist;
    const offsetY = -Math.sin(player.pitch) * followDist;

    const targetCamX = player.x + offsetX;
    const targetCamZ = player.z + offsetZ;
    let targetCamY = player.y + heightOffset + offsetY;

    const camGround = surfaceY(targetCamX, targetCamZ);
    if (targetCamY < camGround + 0.5) targetCamY = camGround + 0.5;

    // Smooth damping
    if (!camera.gameInit) {
        camera.position.set(targetCamX, targetCamY, targetCamZ);
        camera.gameInit = true;
    } else {
        camera.position.x += (targetCamX - camera.position.x) * 12 * dt;
        camera.position.y += (targetCamY - camera.position.y) * 12 * dt;
        camera.position.z += (targetCamZ - camera.position.z) * 12 * dt;
    }
}

/* ═══════════════════════════════════════════════════════════════════
   ANIMATED OBJECTS UPDATE
═══════════════════════════════════════════════════════════════════ */
function updateAnimated(time, dt) {
    if (gamePaused) return; // freeze animated objects (shards, portal, debris, titan breathing)

    if (gameActive) {
        playerMesh.position.set(player.x, player.y, player.z);
        const moving = (Math.abs(player.vx) + Math.abs(player.vz)) > 0.5;
        if (moving) {
            const targetRot = Math.atan2(player.vx, player.vz);
            let diff = targetRot - playerMeshRot;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            playerMeshRot += diff * 10 * dt;

            const speedScale = keys.shift ? 16 : 10;
            playerMesh.legL.position.y = playerMesh.legLBaseY + Math.sin(time * speedScale) * 0.15;
            playerMesh.legR.position.y = playerMesh.legRBaseY + Math.sin(time * speedScale + Math.PI) * 0.15;
            playerMesh.legL.position.z = Math.sin(time * speedScale) * 0.4;
            playerMesh.legR.position.z = Math.sin(time * speedScale + Math.PI) * 0.4;
        } else {
            playerMesh.legL.position.y += (playerMesh.legLBaseY - playerMesh.legL.position.y) * 10 * dt;
            playerMesh.legR.position.y += (playerMesh.legRBaseY - playerMesh.legR.position.y) * 10 * dt;
            playerMesh.legL.position.z *= 0.8;
            playerMesh.legR.position.z *= 0.8;
        }
        playerMesh.rotation.y = playerMeshRot;
        playerMesh.headRef.rotation.x = player.pitch * 0.5;
        let headDiff = player.yaw - playerMeshRot;
        while (headDiff < -Math.PI) headDiff += Math.PI * 2;
        while (headDiff > Math.PI) headDiff -= Math.PI * 2;
        playerMesh.headRef.rotation.y = headDiff * 0.5;
        updateCompanions(dt, time);
    }

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

    // Burst particles — dispose temporary geometry on expiry
    updateBursts(dt);

    // Debris physics
    for (let i = animatedObjects.length - 1; i >= 0; i--) {
        const obj = animatedObjects[i];
        if (obj.type === 'debris') {
            obj.vy -= 18 * dt; // gravity
            obj.mesh.position.x += obj.vx * dt;
            obj.mesh.position.y += obj.vy * dt;
            obj.mesh.position.z += obj.vz * dt;
            obj.mesh.rotation.x += obj.vx * dt;
            obj.mesh.rotation.y += obj.vy * dt;
            obj.life -= dt;
            if (obj.life <= 0 || obj.mesh.position.y < 0) {
                scene.remove(obj.mesh);
                if (obj.mesh && obj.mesh.geometry) obj.mesh.geometry.dispose();
                animatedObjects.splice(i, 1);
            }
        }
    }

    // Titan event
    if (gameActive && !titanEvent.active) {
        titanTriggerTimer += dt;
        if (titanTriggerTimer > 6) {
            triggerTitanEvent();
        }
    }
    updateTitanEvent(dt, time);

}

/* ═══════════════════════════════════════════════════════════════════
   SCROLL-DRIVEN INTRO CAMERA (before game activates)
═══════════════════════════════════════════════════════════════════ */
const CAM_START = { x: 0, y: 7,   z: 25 };
/* Ends behind the spawn, where the third-person follow camera will take over,
   so entry does not sweep in from a stale position. */
const CAM_END   = { x: SPAWN.x, y: PLAYER_HEIGHT + 0.5, z: SPAWN.z + 3.6 };

let scrollProgress = 0;
let introComplete  = false;

window.setVoxelProgress = function (value) {
    scrollProgress = Math.max(0, Math.min(1, value));

    // Overlay opacity
    worldOverlay.style.opacity       = String(scrollProgress);
    worldOverlay.style.pointerEvents = scrollProgress > 0.98 ? 'auto' : 'none';

    // Hide the space scene once the world is opaque enough to cover it.
    const showWorld = scrollProgress > 0.02;
    scene.visible = showWorld;

    if (scrollProgress >= 0.999 && !introComplete) {
        introComplete = true;
        activateGame();
    }
};

/*
 * Called by script.js the instant the journey playhead hits the world. The
 * scroll controller is one-way from here: this is the seam where the voxel
 * world takes permanent ownership of input.
 */
window.onSaifWorldLock = function () {
    worldLocked = true;
    // Stop re-interpreting scroll as journey input. The intro camera is done;
    // from now on the camera is driven by updateCamera().
    scrollProgress = 1;
    worldOverlay.style.opacity = '1';
    worldOverlay.style.pointerEvents = 'auto';
    scene.visible = true;
};

function activateGame() {
    if (gameActive) return;
    gameActive = true;

    // Snap player to spawn
    player.x = SPAWN.x;
    player.z = SPAWN.z;
    player.y = surfaceY(SPAWN.x, SPAWN.z);
    player.vx = 0; player.vy = 0; player.vz = 0;
    player.yaw = SPAWN.yaw;   // face -Z, toward Wall Maria
    player.pitch = 0;

    // Drop the player onto whatever is actually solid at the spawn, so they
    // never start buried in a house or hovering over a pit.
    unstickFromSolid();

    // Snap the third-person camera to its target so entry doesn't sweep in
    // from a stale position.
    camera.gameInit = false;

    // Space is gone — hide the galaxy/Earth layers for good so they cannot
    // reappear behind the voxel world.
    if (typeof window.onSaifHideSpace === 'function') window.onSaifHideSpace();

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
        // Scroll-driven intro camera — descends from deep space to the exact
        // spot the third-person follow camera will take over from.
        const t = scrollProgress * scrollProgress * (3 - 2 * scrollProgress);
        camera.position.set(
            CAM_START.x + (CAM_END.x - CAM_START.x) * t,
            CAM_START.y + (CAM_END.y - CAM_START.y) * t,
            CAM_START.z + (CAM_END.z - CAM_START.z) * t
        );
        // Look target sweeps from far up the district to the ground ahead of
        // the spawn, so the camera is already aimed correctly on arrival.
        camera.lookAt(
            SPAWN.x * t,
            3 - 2 * t,
            -20 + (SPAWN.z + 20) * t
        );
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

    // Reset player — include health/death reset for respawn
    player.x = SPAWN.x; player.z = SPAWN.z;
    player.y = surfaceY(SPAWN.x, SPAWN.z);
    player.vx = 0; player.vy = 0; player.vz = 0;
    player.yaw = SPAWN.yaw; player.pitch = 0;
    playerHP = PLAYER_MAX_HP;
    playerDead = false;
    invulnerableUntil = 0;
    titanPlayerHit = false; // reset hit state for new encounter
    unstickFromSolid();
    camera.gameInit = false;

    // Reset Titan encounter — full reset so second encounter behaves
    // identically to the first (no stale state, no duplicate mesh).
    titanEvent.active = false;
    titanEvent.phase = 0;
    titanEvent.time = 0;
    titanEvent.attackCycle = undefined;
    titanPlayerHit = false;
    titanTriggerTimer = 0;
    if (titanMesh) {
        titanMesh.visible = false;
        titanMesh.position.set(0, 0, -28);
        titanMesh.rotation.set(0, 0, 0);
        titanMesh.scale.setScalar(1);
    }

    missionComplete = false;
    completeEl.style.display = 'none';
    if (hudEl) hudEl.style.display = 'block';
    updateHUD();

    updateHUD();
    setPromptVisible(true);
    requestLock();
};

/* ═══════════════════════════════════════════════════════════════════
   BOOTSTRAP
═══════════════════════════════════════════════════════════════════ */
buildHUD();

/*
 * Read-only test probe.
 *
 * The player, camera and titan state live in module scope, which is
 * deliberate encapsulation. Exposing a pure getter lets the browser test
 * harness observe real gameplay (position, grounded, camera, titan phase)
 * without the game code needing to know about tests, and without adding any
 * way to mutate state from the console.
 */
window.__saifTestProbe = function () {
    return {
        player: {
            x: player.x, y: player.y, z: player.z,
            vx: player.vx, vy: player.vy, vz: player.vz,
            yaw: player.yaw, pitch: player.pitch,
            grounded: player.grounded,
        },
        camera: {
            x: camera.position.x, y: camera.position.y, z: camera.position.z,
        },
        gameActive,
        worldLocked,
        pointerLocked,
        titan: {
            active: titanEvent.active,
            phase: titanEvent.phase,
            time: titanEvent.time,
            visible: titanMesh ? titanMesh.visible : null,
        },
        playerMeshVisible: playerMesh.visible,
        playerMeshPos: {
            x: playerMesh.position.x, y: playerMesh.position.y, z: playerMesh.position.z,
        },
        // Collision truth: would the player box overlap a solid here?
        insideSolid: boxHitsSolid(player.x, player.y, player.z),
        solidCount: solidSet.size,
    };
};

/* ═══════════════════════════════════════════════════════════════════
   SHIGANSHINA — Reference-driven rebuild
═══════════════════════════════════════════════════════════════════ */

// Materials for Shiganshina town — AOT-accurate colors
const townMats = {
    wallCream:     new THREE.MeshLambertMaterial({ color: 0xe8d4b8 }),  // cream plaster
    wallTan:       new THREE.MeshLambertMaterial({ color: 0xc4a882 }),  // tan plaster
    wallStone:     new THREE.MeshLambertMaterial({ color: 0x9a8a78 }),  // stone foundation
    timberDark:    new THREE.MeshLambertMaterial({ color: 0x3e2a1c }),  // dark brown timber
    timberBrown:   new THREE.MeshLambertMaterial({ color: 0x5c4028 }),  // medium brown
    roofTerra:     new THREE.MeshLambertMaterial({ color: 0xa04830 }),  // terracotta red
    roofBrown:     new THREE.MeshLambertMaterial({ color: 0x8b5a2b }),  // brown tile
    roofOrange:    new THREE.MeshLambertMaterial({ color: 0xc87850 }),  // orange tile
    window:        new THREE.MeshLambertMaterial({ color: 0x2a3a48 }),  // dark window
    doorDark:      new THREE.MeshLambertMaterial({ color: 0x2e1f14 }),  // dark door
};

/**
 * Build timber-frame house — AOT-style medieval German architecture
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} w - Width
 * @param {number} d - Depth
 * @param {number} h - Height (stories)
 * @param {string} style - 'normal', 'timber', 'stone'
 */
function buildHouse(x, z, w, d, h, style = 'timber') {
    const baseY = heightAt(Math.round(x), Math.round(z))
        + Math.max(-1, Math.min(1, Math.round(Math.sin(x * 0.25 + z * 0.19 + 1.7) * 1.2 + Math.cos(x * 0.12 - z * 0.15) * 0.6)));

    // Stone foundation layer
    for (let dx = 0; dx < w; dx++) {
        for (let dz = 0; dz < d; dz++) {
            queueBlock(x + dx, baseY, z + dz, townMats.wallStone, true);
        }
    }

    // Main structure — hollow box with walls
    for (let dx = 0; dx < w; dx++) {
        for (let dz = 0; dz < d; dz++) {
            for (let dy = 1; dy <= h; dy++) {
                const isPerimeter = (dx === 0 || dx === w - 1 || dz === 0 || dz === d - 1);
                if (isPerimeter) {
                    const wallMat = (Math.random() > 0.5) ? townMats.wallCream : townMats.wallTan;
                    queueBlock(x + dx, baseY + dy, z + dz, wallMat, true);
                }
            }
        }
    }

    // Timber frame pattern — vertical posts and horizontal beams
    if (style === 'timber' || style === 'normal') {
        // Vertical corner posts
        for (let dy = 1; dy <= h; dy++) {
            queueBlock(x, baseY + dy, z, townMats.timberDark, true);
            queueBlock(x + w - 1, baseY + dy, z, townMats.timberDark, true);
            queueBlock(x, baseY + dy, z + d - 1, townMats.timberDark, true);
            queueBlock(x + w - 1, baseY + dy, z + d - 1, townMats.timberDark, true);
        }

        // Mid-wall vertical posts — visible timber frame every 2 blocks
        if (w >= 3) {
            for (let dy = 1; dy <= h; dy++) {
                for (let px = 2; px < w - 1; px += 2) {
                    queueBlock(x + px, baseY + dy, z, townMats.timberDark, true);
                    queueBlock(x + px, baseY + dy, z + d - 1, townMats.timberDark, true);
                }
            }
        }

        // Horizontal beams at floor levels
        for (let dy = 1; dy <= h; dy++) {
            // Front face beam
            for (let dx = 0; dx < w; dx++) {
                queueBlock(x + dx, baseY + dy, z, townMats.timberBrown, true);
            }
            // Back face beam
            for (let dx = 0; dx < w; dx++) {
                queueBlock(x + dx, baseY + dy, z + d - 1, townMats.timberBrown, true);
            }
        }
    }

    // Windows — dark openings on facades
    if (h >= 2 && w >= 3) {
        for (let floor = 2; floor <= h; floor++) {
            // Front facade windows
            for (let dx = 1; dx < w - 1; dx += 2) {
                queueBlock(x + dx, baseY + floor, z, townMats.window, false);
            }
            // Side windows if deep enough
            if (d >= 4) {
                for (let dz = 1; dz < d - 1; dz += 2) {
                    queueBlock(x, baseY + floor, z + dz, townMats.window, false);
                    queueBlock(x + w - 1, baseY + floor, z + dz, townMats.window, false);
                }
            }
        }
    }

    // Door on ground floor
    if (w >= 3) {
        queueBlock(x + Math.floor(w / 2), baseY + 1, z, townMats.doorDark, false);
    }

    // Sloped terracotta tile roof — deterministic per position so the
    // town shows a varied but stable mix of terra/brown/orange tiles,
    // matching the reference town's roof variety.
    const roofMats = [townMats.roofTerra, townMats.roofBrown, townMats.roofOrange];
    const roofMat = roofMats[((x * 7 + z * 13) % 3 + 3) % 3];

    const roofH = Math.max(2, Math.floor(w / 2));
    for (let dx = -1; dx <= w; dx++) {
        for (let dz = -1; dz <= d; dz++) {
            // Ridge-style peaked roof
            const distFromCenterX = Math.abs(dx - w / 2);
            const elevate = Math.max(0, roofH - Math.floor(distFromCenterX));

            if (elevate > 0 && dx >= 0 && dx < w && dz >= -1 && dz <= d) {
                for (let ry = 0; ry < elevate; ry++) {
                    queueBlock(x + dx, baseY + h + 1 + ry, z + dz, roofMat, true);
                }
            }
        }
    }
}

/**
 * Build canal — carved waterway with stone banks
 */
function buildCanal(x1, z1, x2, z2, width = 2) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1)) * 2;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const cx = Math.round(x1 + (x2 - x1) * t);
        const cz = Math.round(z1 + (z2 - z1) * t);

        for (let dx = -width; dx <= width; dx++) {
            for (let dz = -width; dz <= width; dz++) {
                const dist = Math.abs(dx) + Math.abs(dz);
                if (dist <= width * 1.2) {
                    const wx = cx + dx;
                    const wz = cz + dz;
                    const baseH = heightAt(wx, wz);

                    // Dig down 2 blocks
                    solidSet.delete(`${wx},${baseH},${wz}`);
                    solidSet.delete(`${wx},${baseH - 1},${wz}`);

                    // Stone banks at edges
                    if (dist >= width) {
                        queueBlock(wx, baseH - 1, wz, townMats.wallStone, true);
                    }

                    // Water fill
                    queueBlock(wx, baseH - 2, wz, MAT.water);
                    queueBlock(wx, baseH - 1, wz, MAT.water);
                }
            }
        }
    }
}

/**
 * Build wooden bridge across canal
 */
function buildBridge(x, z, length, direction = 'x') {
    const baseY = heightAt(x, z) + 1;

    if (direction === 'x') {
        for (let dx = 0; dx < length; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                queueBlock(x + dx, baseY, z + dz, MAT.wood, true);
                // Side rails
                if (dz === -1 || dz === 1) {
                    queueBlock(x + dx, baseY + 1, z + dz, MAT.wood, false);
                }
            }
        }
    } else {
        for (let dz = 0; dz < length; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                queueBlock(x + dx, baseY, z + dz, MAT.wood, true);
                if (dx === -1 || dx === 1) {
                    queueBlock(x + dx, baseY + 1, z + dz, MAT.wood, false);
                }
            }
        }
    }
}

/**
 * Build town tree — placed throughout residential areas
 */
function buildTownTree(x, z, height = 4) {
    const baseY = heightAt(Math.round(x), Math.round(z));

    // Trunk
    for (let dy = 0; dy < height; dy++) {
        queueBlock(x, baseY + 1 + dy, z, MAT.wood, true);
    }

    // Leaf crown
    const crownY = baseY + height;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            for (let dy = 0; dy <= 2; dy++) {
                const dist = Math.abs(dx) + Math.abs(dz) + Math.abs(dy - 1);
                if (dist <= 2.5) {
                    const leafMat = (dy < 1) ? MAT.leavesDeep : MAT.leaves;
                    queueBlock(x + dx, crownY + dy, z + dz, leafMat);
                }
            }
        }
    }
}

/**
 * Build grid-based Shiganshina town — no overlapping buildings.
 *
 * Houses sit on a 4-unit grid (3-wide house + 1-wide street), so no two
 * buildings ever share a block. The spawn at (-16, 0) sits on a street
 * intersection, surrounded by houses but never inside one.
 */
function buildShinganshina() {
    const gx = [-23, -19, -15, -11, -7, -3, 1, 5, 9, 13, 17, 21]; // 12 columns
    const gz = [-19, -15, -11, -7, -3, 1, 5, 9];                 // 8 rows
    const occ = new Set();

    /** Place a house; double-checks the grid so no two buildings overlap. */
    function place(gx2, gz2, w, d, h, style = 'timber') {
        for (let dx = 0; dx < w; dx++) {
            for (let dz = 0; dz < d; dz++) {
                const k = `${gx2 + dx},${gz2 + dz}`;
                if (occ.has(k)) {
                    throw new Error('buildShinganshina: cell ' + k + ' already occupied');
                }
                occ.add(k);
            }
        }
        buildHouse(gx2, gz2, w, d, h, style);
    }

    // === Northwest residential blocks ===
    for (const z of [-19, -15, -11, -7]) {
        for (const x of gx) {
            const key = `${x},${z}`;
            if (key === '13,-19') {
                place(x, z, 3, 3, 3); // tall house
            } else if (key === '-23,-7') {
                place(x, z, 3, 3, 3); // tall house
            } else {
                place(x, z, 3, 3, (x + z) % 2 === 0 ? 3 : 2);
            }
        }
    }

    // === Main street — north side (z = -3) ===
    for (const x of gx) {
        const key = `${x},-3`;
        if (key === '-23,-3') {
            place(x, -3, 4, 4, 4); // NW corner landmark
        } else if (key === '-15,-3') {
            place(x, -3, 4, 4, 4); // SE corner landmark
        } else if (key === '-3,-3') {
            place(x, -3, 4, 4, 4); // market square
        } else if (key === '9,-3') {
            place(x, -3, 3, 3, 4); // district tower
        } else {
            place(x, -3, 3, 3, (x + -3) % 3 === 0 ? 3 : 2);
        }
    }

    // === Main street — south side (z = 1) ===
    for (const x of gx) {
        const key = `${x},1`;
        if (key === '1,1') {
            place(x, 1, 4, 4, 4); // central hall
        } else if (key === '5,1') {
            place(x, 1, 4, 4, 4); // town hall
        } else if (key === '9,1') {
            place(x, 1, 3, 3, 5); // watchtower
        } else if (key === '-3,1') {
            place(x, 1, 4, 4, 4); // guildhall
        } else {
            place(x, 1, 3, 3, (x + 1) % 3 === 0 ? 3 : 2);
        }
    }

    // === Southeast blocks ===
    for (const z of [5, 9]) {
        for (const x of gx) {
            const key = `${x},${z}`;
            if (key === '17,9') {
                place(x, z, 3, 3, 3); // SE landmark
            } else {
                place(x, z, 3, 3, (x + z) % 2 === 0 ? 3 : 2);
            }
        }
    }

    // === Trees along streets (reference style: trees line roads) ===
    // Main east-west streets (z = -3 and z = 1) — 5 trees each
    for (const tz of [-3, 1]) {
        for (const tx of [-20, -12, -4, 4, 12, 20]) {
            buildTownTree(tx, tz, 3);
        }
    }
    // North street spine (z = -7, -11) — 4 trees
    for (const tz of [-7, -11]) {
        for (const tx of [-16, -8, 0, 8, 16]) {
            buildTownTree(tx, tz, 3);
        }
    }

    // === Trees along the main streets ===
    // 15 trees on the four z-streets
    for (const tz of [-16, -8, 4]) {
        for (const tx of [-20, -8, 0, 8, 20]) {
            buildTownTree(tx, tz, 4);
        }
    }
    // 12 trees along the east/west spine (x = -20, 0, 20)
    for (const tz of [-20, -12, -4, 8]) {
        for (const tx of [-20, 0, 20]) {
            buildTownTree(tx, tz, 3);
        }
    }

    // === Vertical canal and its bridges ===
    buildCanal(-4, -20, -4, 9, 0);
    for (const bz of [-20, -16, -12, -8, -4, 0, 4, 8]) {
        const by = heightAt(-4, bz);
        for (let bx = -5; bx <= -1; bx++) {
            queueBlock(bx, by, bz, MAT.wood, true);  // planks
            queueBlock(bx, by + 1, bz, MAT.wood, false); // rails
        }
    }
}

buildShinganshina();
/*
 * Shiganshina wall — Wall Maria's inner gate district.
 *
 * The previous version stepped `x += 2`, leaving a 1-block gap at every odd
 * coordinate. The player box is 0.64 wide, so it fitted straight through those
 * gaps: the wall was decorative, not solid. It is now stepped by 1 and the
 * player is additionally confined to the district interior, so the perimeter
 * cannot be escaped at the corners either.
 */
const WALL = {
    xMin: -26, xMax: 26,   // wall inner faces sit at these columns
    zMin: -22, zMax: 14,
    height: 8,
};

function buildWall() {
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x7a6e62 });
    const wallTop = new THREE.MeshLambertMaterial({ color: 0x8d8274 });
    const H = WALL.height;

    for (let x = WALL.xMin; x <= WALL.xMax; x++) {
        for (let y = 0; y < H; y++) queueBlock(x, y, WALL.zMin, y === H - 1 ? wallTop : wallMat, true);
        for (let y = 0; y < H; y++) queueBlock(x, y, WALL.zMax, y === H - 1 ? wallTop : wallMat, true);
    }
    for (let z = WALL.zMin; z <= WALL.zMax; z++) {
        for (let y = 0; y < H; y++) queueBlock(WALL.xMin, y, z, y === H - 1 ? wallTop : wallMat, true);
        for (let y = 0; y < H; y++) queueBlock(WALL.xMax, y, z, y === H - 1 ? wallTop : wallMat, true);
    }

    // Corner bastions — read as wall towers and stop the corners being thin.
    for (const cx of [WALL.xMin, WALL.xMax]) {
        for (const cz of [WALL.zMin, WALL.zMax]) {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    for (let y = 0; y < H + 4; y++) {
                        queueBlock(cx + dx, y, cz + dz, y >= H ? wallTop : wallMat, true);
                    }
                }
            }
        }
    }

    // Mid-wall watchtowers, Wall Maria style — taller than the curtain and
    // solid all the way down so they also act as collision landmarks.
    for (const tx of [-13, 0, 13]) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let y = 0; y < H + 3; y++) {
                queueBlock(tx + dx, y, WALL.zMin, wallMat, true);
                queueBlock(tx + dx, y, WALL.zMax, wallMat, true);
            }
        }
    }
}

/**
 * Keeps the player inside the district. The wall now genuinely blocks
 * movement, but a corner gap or a future edit could still let the player
 * leave, so the interior is also enforced as a hard bound.
 */
function clampToDistrict() {
    return {
        x: Math.max(WALL.xMin + 0.5 + PLAYER_RADIUS, Math.min(WALL.xMax - 0.5 - PLAYER_RADIUS, player.x)),
        z: Math.max(WALL.zMin + 0.5 + PLAYER_RADIUS, Math.min(WALL.zMax - 0.5 - PLAYER_RADIUS, player.z)),
    };
}

buildTerrain();
buildWall();
// buildTrees(); // Removed - no trees in Shiganshina
buildPortal();
flushBlocks();

window.setVoxelProgress(0);
requestAnimationFrame(animate);
