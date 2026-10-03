/*
 * BROWSER TESTS 6-7 — GAME MOVEMENT + COLLISION, verified in real Chrome.
 * Enters the world, engages pointer lock, sends genuine keyboard and mouse
 * events, and reads the live player state through window.__saifTestProbe().
 */
const { connect, openPage } = require('./_cdp.js');

const PORT = 9222;
const URL_UNDER_TEST = 'http://127.0.0.1:8123/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const target = await openPage(PORT, 'about:blank');
    const cdp = await connect(target.webSocketDebuggerUrl);
    const errors = [];
    cdp.on(msg => {
        if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params.exceptionDetails;
            errors.push(d.exception ? (d.exception.description || d.exception.value) : d.text);
        }
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: URL_UNDER_TEST });
    await sleep(7000);

    const evalp = async (expr) => {
        const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
        return r.result.value;
    };
    const probe = () => evalp('JSON.stringify(window.__saifTestProbe())').then(JSON.parse);

    // --- enter the world ---
    for (let i = 0; i < 40; i++) {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 400, deltaX: 0, deltaY: 500 });
        await sleep(400);
        if (await evalp(`getComputedStyle(document.getElementById('game-hud')).display !== 'none'`)) break;
    }
    await sleep(1200);
    console.log('=== BROWSER TEST 6: GAME MOVEMENT ===');
    const p0 = await probe();
    console.log(`  world entered: gameActive=${p0.gameActive} worldLocked=${p0.worldLocked}`);
    console.log(`  player spawn: (${p0.player.x.toFixed(2)}, ${p0.player.y.toFixed(2)}, ${p0.player.z.toFixed(2)}) grounded=${p0.player.grounded}`);
    console.log(`  player mesh visible=${p0.playerMeshVisible} at (${p0.playerMeshPos.x.toFixed(2)}, ${p0.playerMeshPos.y.toFixed(2)}, ${p0.playerMeshPos.z.toFixed(2)})`);
    console.log(`  solid blocks in world: ${p0.solidCount}`);
    console.log(`  player inside a solid? ${p0.insideSolid}`);

    // --- pointer lock (needs a real gesture) ---
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 400, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 400, button: 'left', clickCount: 1 });
    await sleep(1000);
    const locked = await evalp(`document.pointerLockElement ? document.pointerLockElement.id : null`);
    console.log(`  pointer lock: ${locked || 'NOT LOCKED'}`);
    if (!locked) {
        console.log('  (pointer lock unavailable to automation — testing with it forced on instead)');
        await evalp(`window.__forceLock = true; true`);
    }

    const key = async (code, keyName, down) => {
        await cdp.send('Input.dispatchKeyEvent', {
            type: down ? 'keyDown' : 'keyUp',
            code, key: keyName,
            windowsVirtualKeyCode: keyName.toUpperCase().charCodeAt(0),
        });
    };

    // Hold a key for a duration and measure displacement.
    async function moveTest(label, code, keyName, ms, extra = null) {
        const a = await probe();
        await key(code, keyName, true);
        if (extra) await extra(true);
        await sleep(ms);
        if (extra) await extra(false);
        await key(code, keyName, false);
        await sleep(500);
        const b = await probe();
        const dx = b.player.x - a.player.x, dz = b.player.z - a.player.z;
        const dist = Math.hypot(dx, dz);
        console.log(`  ${label.padEnd(18)} moved ${dist.toFixed(3)} units  (dx=${dx.toFixed(2)} dz=${dz.toFixed(2)}) y=${b.player.y.toFixed(2)} grounded=${b.player.grounded} insideSolid=${b.insideSolid}`);
        return { dist, a, b };
    }

    console.log('\n--- WASD / SHIFT / SPACE ---');
    const wRes = await moveTest('W (forward)', 'KeyW', 'w', 900);
    const sRes = await moveTest('S (back)', 'KeyS', 's', 900);
    const aRes = await moveTest('A (left)', 'KeyA', 'a', 900);
    const dRes = await moveTest('D (right)', 'KeyD', 'd', 900);
    const shiftRes = await moveTest('SHIFT (sprint)', 'ShiftLeft', 'Shift', 900);

    // Jump: sample y while space is held.
    const jBefore = await probe();
    await key('Space', ' ', true);
    let peakY = jBefore.player.y, sawAirborne = false;
    for (let i = 0; i < 14; i++) {
        await sleep(70);
        const s = await probe();
        peakY = Math.max(peakY, s.player.y);
        if (!s.player.grounded) sawAirborne = true;
    }
    await key('Space', ' ', false);
    await sleep(1200);
    const jAfter = await probe();
    console.log(`  ${'SPACE (jump)'.padEnd(18)} rose ${(peakY - jBefore.player.y).toFixed(2)} units  airborne=${sawAirborne}  landed y=${jAfter.player.y.toFixed(2)} (start ${jBefore.player.y.toFixed(2)}) grounded=${jAfter.player.grounded}`);

    // Mouse look
    const camBefore = await probe();
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 400, deltaX: 250, deltaY: 0, button: 'none' });
    await sleep(400);
    const camAfter = await probe();
    console.log(`  ${'MOUSE (look)'.padEnd(18)} yaw ${camBefore.player.yaw.toFixed(3)} -> ${camAfter.player.yaw.toFixed(3)}  camMoved=${Math.hypot(camAfter.camera.x - camBefore.camera.x, camAfter.camera.z - camBefore.camera.z).toFixed(3)}`);

    console.log('\n=== BROWSER TEST 7: COLLISION ===');
    // Charge at the north wall from spawn; must stop, not pass.
    const wallBefore = await probe();
    await key('KeyW', 'w', true);
    await sleep(6000);
    await key('KeyW', 'w', false);
    await sleep(600);
    const wallAfter = await probe();
    console.log(`  north wall charge: z ${wallBefore.player.z.toFixed(2)} -> ${wallAfter.player.z.toFixed(2)} (wall at z=-22, interior limit -21.18)`);
    console.log(`    ${wallAfter.player.z > -22 ? 'PASS: stopped by the wall' : 'FAIL: passed through the wall'}`);
    console.log(`    insideSolid=${wallAfter.insideSolid} grounded=${wallAfter.player.grounded} y=${wallAfter.player.y.toFixed(2)}`);

    console.log('\nPage errors:', errors.length ? errors.join(' | ') : 'none');
    cdp.close();
    process.exit(0);
})().catch(e => { console.error('DRIVER ERROR:', e.message); process.exit(1); });