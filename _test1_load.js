/*
 * BROWSER TEST 1 — PAGE LOAD
 * Loads index.html in real Chrome, captures every console message, page error
 * and failed network request, then reports whether Three.js / the voxel world
 * actually initialised.
 */
const { connect, fetchJson, openPage } = require('./_cdp.js');

const URL_UNDER_TEST = 'http://127.0.0.1:8123/index.html';
const PORT = 9222;

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const target = await openPage(PORT, 'about:blank');
    const cdp = await connect(target.webSocketDebuggerUrl);

    const consoleMsgs = [];
    const pageErrors = [];
    const failedRequests = [];
    const requestUrls = new Map();

    cdp.on(msg => {
        if (msg.method === 'Runtime.consoleAPICalled') {
            const text = (msg.params.args || [])
                .map(a => a.value !== undefined ? a.value : (a.description || a.type))
                .join(' ');
            consoleMsgs.push({ type: msg.params.type, text });
        }
        if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params.exceptionDetails;
            pageErrors.push({
                text: d.exception ? (d.exception.description || d.exception.value) : d.text,
                url: d.url, line: d.lineNumber
            });
        }
        if (msg.method === 'Network.requestWillBeSent') {
            requestUrls.set(msg.params.requestId, msg.params.request.url);
        }
        if (msg.method === 'Network.loadingFailed') {
            failedRequests.push({
                url: requestUrls.get(msg.params.requestId) || '?',
                error: msg.params.errorText
            });
        }
    });

    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Page.enable');
    await cdp.send('Log.enable');

    await cdp.send('Page.navigate', { url: URL_UNDER_TEST });
    // Give the page time to load Three.js from CDN, build the world and start rAF.
    await sleep(9000);

    // Probe the live page state.
    const probe = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
            const out = {};
            // canvas + scene elements
            out.spaceCanvas = !!document.getElementById('space-dust');
            out.voxelCanvas = !!document.getElementById('voxel-canvas');
            out.galaxy = !!document.querySelector('.galaxy');
            out.earth = !!document.querySelector('.earth');

            const c = document.getElementById('voxel-canvas');
            if (c) {
                out.canvasSize = c.width + 'x' + c.height;
                // A WebGL canvas that has never been drawn to is transparent black.
                out.canvasHasPixels = (() => {
                    try {
                        const gl = c.getContext('webgl2') || c.getContext('webgl');
                        if (!gl) return 'no-webgl-context';
                        return 'context-ok';
                    } catch (e) { return 'error: ' + e.message; }
                })();
            }

            // journey state exposed on window?
            out.hasSetVoxelProgress = typeof window.setVoxelProgress === 'function';
            out.hasOnSaifWorldLock = typeof window.onSaifWorldLock === 'function';

            // document scrollability
            out.scrollHeight = document.documentElement.scrollHeight;
            out.innerHeight = window.innerHeight;
            out.scrollY = window.scrollY;

            // galaxy / earth current visual state
            const g = document.querySelector('.galaxy');
            const e = document.querySelector('.earth');
            if (g) { out.galaxyTransform = g.style.transform; out.galaxyOpacity = g.style.opacity; }
            if (e) { out.earthTransform = e.style.transform; out.earthOpacity = e.style.opacity; out.earthDisplay = e.style.display; }

            out.overlayOpacity = document.getElementById('voxel-world')?.style.opacity;
            out.hudExists = !!document.getElementById('game-hud');
            return JSON.stringify(out);
        })()`,
        returnByValue: true
    });

    console.log('=== BROWSER TEST 1: PAGE LOAD ===\n');
    console.log('URL:', URL_UNDER_TEST, '\n');

    console.log('--- Page state probe ---');
    const state = JSON.parse(probe.result.value);
    for (const [k, v] of Object.entries(state)) {
        console.log(`  ${k.padEnd(22)} ${v}`);
    }

    console.log('\n--- Console messages ---');
    if (consoleMsgs.length === 0) console.log('  (none)');
    consoleMsgs.forEach(m => console.log(`  [${m.type}] ${m.text}`));

    console.log('\n--- Uncaught page errors ---');
    if (pageErrors.length === 0) console.log('  (none)  <-- GOOD');
    pageErrors.forEach(e => console.log(`  ${e.text}\n     at ${e.url}:${e.line}`));

    console.log('\n--- Failed network requests ---');
    if (failedRequests.length === 0) console.log('  (none)  <-- GOOD');
    failedRequests.forEach(f => console.log(`  ${f.url}  ->  ${f.error}`));

    const errCount = pageErrors.length + failedRequests.length
        + consoleMsgs.filter(m => m.type === 'error').length;
    console.log(`\n=== RESULT: ${errCount === 0 ? 'CLEAN LOAD' : errCount + ' PROBLEM(S)'} ===`);

    cdp.close();
    process.exit(0);
})().catch(e => { console.error('DRIVER ERROR:', e.message); process.exit(1); });
