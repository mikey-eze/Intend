/*
 * Render capture: drives the real journey with wheel events, waits for the
 * voxel world to become visible, then saves actual PNG frames of the browser.
 */
const fs = require('fs');
const { connect } = require('./_cdp.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openPage(url) {
    const r = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    return r.json();
}

async function shot(api, name) {
    const r = await api.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(name, Buffer.from(r.data, 'base64'));
    console.log('saved', name);
}

(async () => {
    const tab = await openPage('http://127.0.0.1:8123/index.html');
    const api = await connect(tab.webSocketDebuggerUrl);

    const errors = [];
    api.on(msg => {
        if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params.exceptionDetails;
            errors.push(`${d.text} ${d.exception ? (d.exception.description || d.exception.value) : ''} @${d.lineNumber}`);
        }
    });
    await api.send('Runtime.enable');
    await api.send('Page.enable');
    await api.send('Page.reload', { ignoreCache: true });
    await sleep(3500);

    const ev = async expr => {
        const r = await api.send('Runtime.evaluate', { expression: expr, returnByValue: true });
        const rr = r && r.result ? r.result : r;
        return rr && 'value' in rr ? rr.value : rr;
    };

    await shot(api, '_v_1_space.png');

    console.log('scrolling to bottom...');
    for (let i = 0; i < 30; i++) {
        await api.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 460, deltaX: 0, deltaY: 600 });
        await sleep(120);
    }

    // Capture mid-journey (Earth filling view) around t=6s.
    await sleep(5500);
    await shot(api, '_v_2_earth.png');
    console.log('earth op =', await ev("getComputedStyle(document.querySelector('.earth')).opacity"));

    // World becomes visible ~t=12s.
    await sleep(7000);
    const worldOp = await ev("getComputedStyle(document.getElementById('voxel-world')).opacity");
    console.log('world op =', worldOp);
    await shot(api, '_v_3_world.png');

    await sleep(3000);
    await shot(api, '_v_4_world_late.png');

    // Inspect the live scene graph through the canvas + globals the module exposes.
    const sceneInfo = await ev(`(function(){
        const c = document.getElementById('voxel-canvas');
        const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
        let pixels = null;
        if (gl) {
            try {
                const w = c.width, h = c.height;
                const buf = new Uint8Array(w * h * 4);
                gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
                // count distinct colors as a crude "is anything drawn" signal
                const set = new Set();
                let nonBlack = 0;
                for (let i = 0; i < buf.length; i += 4 * 997) {
                    const k = buf[i] + ',' + buf[i+1] + ',' + buf[i+2];
                    set.add(k);
                    if (buf[i] + buf[i+1] + buf[i+2] > 12) nonBlack++;
                }
                pixels = { sampledColors: set.size, nonBlackSamples: nonBlack };
            } catch (e) { pixels = { err: e.message }; }
        }
        return { canvasW: c && c.width, canvasH: c && c.height, pixels };
    })()`);
    console.log('SCENE PIXELS:', JSON.stringify(sceneInfo));

    console.log('\n=== ERRORS (' + errors.length + ') ===');
    errors.slice(0, 20).forEach(e => console.log(e));

    api.close();
    process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });