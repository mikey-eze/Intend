const fs = require('fs');
let text = fs.readFileSync('voxel-world.js', 'utf8');

// Add Colossal Titan Model + Event System
const titanCode = `
/* ═══════════════════════════════════════════════════════════════════
   COLOSSAL TITAN (AOT)
═══════════════════════════════════════════════════════════════════ */
let titanMesh = null;
let titanEvent = { active: false, phase: 0, time: 0 };

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
    console.log('COLOSSAL TITAN EVENT TRIGGERED');
}

function updateTitanEvent(dt, time) {
    if (!titanEvent.active) return;
    titanEvent.time += dt;

    const t = titanEvent.time;

    // Phase 0: Titan rises behind wall (0-3s)
    if (titanEvent.phase === 0) {
        const riseProgress = Math.min(1, t / 3);
        titanMesh.position.y = -10 + riseProgress * 10;
        titanMesh.scale.setScalar(0.8 + riseProgress * 0.2);

        if (t > 3) {
            titanEvent.phase = 1;
            playSound('portal'); // Deep roar
        }
    }

    // Phase 1: Titan visible, moves forward slowly (3-8s)
    else if (titanEvent.phase === 1) {
        const moveProgress = Math.min(1, (t - 3) / 5);
        titanMesh.position.z = -28 + moveProgress * 6;

        // Arm swing
        titanMesh.armL.rotation.x = Math.sin(time * 0.8) * 0.3;
        titanMesh.armR.rotation.x = Math.sin(time * 0.8 + Math.PI) * 0.3;

        if (t > 8) {
            titanEvent.phase = 2;
        }
    }

    // Phase 2: Titan attacks wall (8-10s)
    else if (titanEvent.phase === 2) {
        const attackProgress = (t - 8) / 2;
        titanMesh.armR.rotation.x = -Math.PI * 0.5 + Math.sin(attackProgress * Math.PI * 4) * 0.8;

        if (t > 9.5 && t < 9.6) {
            // Wall impact moment
            destroyWallSection();
            playSound('portal');
            spawnDebris(0, 4, -22);
        }

        if (t > 10) {
            titanEvent.phase = 3;
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
`;

// Insert before INPUT STATE section
text = text.replace(
    '/* ═══════════════════════════════════════════════════════════════════\n   VOXEL CHARACTERS (AOT)',
    titanCode + '\n/* ═══════════════════════════════════════════════════════════════════\n   VOXEL CHARACTERS (AOT)'
);

// Add Shiganshina buildings
const buildingsCode = `
// Shiganshina Buildings (dense medieval town)
function buildShinganshina() {
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xd2b48c });
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x654321 });

    const housePositions = [
        { x: -8, z: 0, w: 4, d: 4, h: 3 },
        { x: -8, z: 6, w: 3, d: 3, h: 3 },
        { x: 6, z: -2, w: 5, d: 4, h: 4 },
        { x: 10, z: 4, w: 3, d: 5, h: 3 },
        { x: -14, z: -8, w: 4, d: 4, h: 3 },
        { x: 14, z: -6, w: 3, d: 4, h: 3 },
        { x: -18, z: 6, w: 5, d: 3, h: 4 },
        { x: 18, z: -12, w: 4, d: 5, h: 3 },
    ];

    housePositions.forEach(house => {
        const baseY = heightAt(Math.round(house.x), Math.round(house.z));

        // Walls
        for (let dx = 0; dx < house.w; dx++) {
            for (let dz = 0; dz < house.d; dz++) {
                for (let dy = 0; dy < house.h; dy++) {
                    // Hollow inside (only perimeter)
                    if (dx === 0 || dx === house.w - 1 || dz === 0 || dz === house.d - 1 || dy === 0) {
                        queueBlock(house.x + dx, baseY + dy, house.z + dz, wallMat);
                    }
                }
            }
        }

        // Roof (slanted appearance via height variation)
        for (let dx = -1; dx <= house.w; dx++) {
            for (let dz = -1; dz <= house.d; dz++) {
                const roofY = baseY + house.h + Math.max(0, 1 - Math.abs(dx - house.w / 2) / 2);
                queueBlock(house.x + dx, roofY, house.z + dz, roofMat);
            }
        }

        // Door (gap in wall)
        const doorX = house.x + Math.floor(house.w / 2);
        const doorZ = house.z;
        // (Conceptual — actual block removal would require different architecture)
    });
}
`;

text = text.replace(
    'buildHUD();\n// Shiganshina wall structure',
    'buildHUD();\n' + buildingsCode + '\nbuildShinganshina();\n// Shiganshina wall structure'
);

// Update animatedObjects to handle debris + titan
const animUpdate = `
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
                animatedObjects.splice(i, 1);
            }
        }
    }

    // Titan event
    if (gameActive && !titanEvent.active) {
        titanTriggerTimer += dt;
        if (titanTriggerTimer > 8) {
            triggerTitanEvent();
        }
    }
    updateTitanEvent(dt, time);
`;

text = text.replace(
    '    // Burst particles\n    updateBursts(dt);',
    '    // Burst particles\n    updateBursts(dt);\n' + animUpdate
);

fs.writeFileSync('voxel-world.js', text);
console.log('Colossal Titan + Shiganshina buildings added');
