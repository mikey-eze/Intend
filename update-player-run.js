const fs = require('fs');
let text = fs.readFileSync('voxel-world.js', 'utf8');

const cb = `
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
`;

text = text.replace('/* ═══════════════════════════════════════════════════════════════════\n   INPUT STATE', cb + '\n/* ═══════════════════════════════════════════════════════════════════\n   INPUT STATE');

const pa = `
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
`;
text = text.replace('function updateAnimated(time, dt) {', 'function updateAnimated(time, dt) {\n' + pa);

const cu = `function updateCamera(dt) {
    if (!gameActive) return;
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
}`;
let lines = text.split('\n');
let newLines = [];
let skip = false;
for (let i=0; i<lines.length; i++) {
    if (lines[i].includes('let bobPhase = 0;')) {
        skip = true;
    }
    if (skip && lines[i].includes('camera.rotation.x = player.pitch;')) {
        skip = false;
        i++; // skip closing brace
        newLines.push(cu);
        continue;
    }
    if (!skip) newLines.push(lines[i]);
}

fs.writeFileSync('voxel-world.js', newLines.join('\n'));
