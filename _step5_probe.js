/*
 * Post-journey scene probe: real gameplay state via window.__saifTestProbe,
 * scene/background inspection, and a fresh screenshot.
 */
const fs = require('fs');
const { connect } = require('./_cdp.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openPage(url) {
    const r = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    return r.json();
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
    const shot = async name => {
        const r = await api.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(name, Buffer.from(r.data, 'base64'));
        console.log('saved', name);
    };

    // Drive the journey to completion.
    for (let i = 0; i < 30; i++) {
        await api.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 460, deltaX: 0, deltaY: 600 });
        await sleep(120);
    }
    await sleep(14000); // journeyCurrent needs >= 11.8 s

    console.log('=== PROBE after journey ===');
    console.log(JSON.stringify(await ev('window.__saifTestProbe ? window.__saifTestProbe() : "NO PROBE"'), null, 2));

    console.log('=== SCENE ===');
    console.log(JSON.stringify(await ev(`(function(){
        const c = document.getElementById('voxel-canvas');
        return {
            rendererSize: [c.width, c.height],
            hudDisplay: getComputedStyle(document.getElementById('game-hud')).display,
            hudVisible: getComputedStyle(document.getElementById('game-hud')).visibility,
            hudOpacity: getComputedStyle(document.getElementById('game-hud')).opacity,
            hudZIndex: getComputedStyle(document.getElementById('game-hud')).zIndex,
            earthUidisplay: getComputedStyle(document.querySelector('.earth-ui')).opacity,
            oldUiDisplay: getComputedStyle(document.querySelector('.old-ui')).opacity,
            overlayBg: getComputedStyle(document.getElementById('voxel-world')).background,
        };
    })()`), null, 2));

    await shot(api, '_v_5_world_probe.png');

    // Wait past titan reveal (~10s event) and check phase + shot
    await sleep(12000);
    console.log('=== PROBE titan ===');
    console.log(JSON.stringify(await ev('window.__saifTestProbe()'), null, 2));
    await shot(api, '_v_6_titan.png');

    console.log('=== ERRORS (' + errors.length + ') ===');
    errors.slice(0, 20).forEach(e => console.log(e));
    api.close();
    process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });