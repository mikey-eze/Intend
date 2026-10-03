/*
 * Live console + runtime probe. Attaches to a page, enables Runtime/Log/Page
 * domains so nothing emitted before attach is missed, then dumps console
 * messages, page errors, failed loads and a snapshot of runtime globals.
 */
const { connect, fetchJson } = require('./_cdp.js');

const PAGE_URL = 'http://127.0.0.1:8123/index.html';

async function newTab(url) {
    const res = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    return res.json();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const tab = await newTab(PAGE_URL);
    const api = await connect(tab.webSocketDebuggerUrl);

    const logs = [];
    const errors = [];
    const failed = [];

    api.on(msg => {
        if (msg.method === 'Runtime.consoleAPICalled') {
            const text = (msg.params.args || [])
                .map(a => a.value !== undefined ? String(a.value) : (a.description || a.type))
                .join(' ');
            logs.push(`[${msg.params.type}] ${text}`);
        }
        if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params.exceptionDetails;
            errors.push(`${d.text} ${d.exception ? d.exception.description || d.exception.value : ''} @${d.url || ''}:${d.lineNumber}`);
        }
        if (msg.method === 'Log.entryAdded') {
            const e = msg.params.entry;
            if (e.level === 'error') logs.push(`[log:error] ${e.text} ${e.url || ''}`);
        }
        if (msg.method === 'Network.loadingFailed') {
            failed.push(`${msg.params.type} ${msg.params.errorText}`);
        }
    });

    await api.send('Runtime.enable');
    await api.send('Log.enable');
    await api.send('Page.enable');
    await api.send('Network.enable');
    await api.send('Page.reload', { ignoreCache: true });

    await sleep(4000);

    const probe = await api.send('Runtime.evaluate', {
        expression: `(() => {
            const q = s => document.querySelector(s);
            const style = el => el ? getComputedStyle(el) : null;
            const wo = q('#voxel-world'), vc = q('#voxel-canvas');
            const wos = style(wo);
            const canvasVisible = vc ? (vc.width > 0 && vc.height > 0) : false;
            return {
                docReady: document.readyState,
                scripts: [...document.querySelectorAll('script')].map(s => s.src.split('/').pop() || 'inline'),
                galaxy: !!q('.galaxy'), earth: !!q('.earth'),
                earthOpacity: style(q('.earth')) ? style(q('.earth')).opacity : null,
                worldOverlayExists: !!wo,
                worldOpacity: wos ? wos.opacity : null,
                worldDisplay: wos ? wos.display : null,
                canvasExists: !!vc,
                canvasSize: vc ? [vc.width, vc.height] : null,
                hudExists: !!q('#game-hud'),
                hudText: q('#game-hud') ? q('#game-hud').innerText.replace(/\\s+/g, ' ').slice(0, 200) : null,
                scrollHeight: document.documentElement.scrollHeight,
                innerHeight: window.innerHeight,
                scrollY: window.scrollY,
            };
        })()`,
        returnByValue: true,
    });

    console.log('=== RUNTIME SNAPSHOT ===');
    const val = probe.result && (probe.result.result ? (probe.result.result.value !== undefined ? probe.result.result.value : probe.result.result) : probe.result);
    console.log(JSON.stringify(val !== undefined ? val : probe, null, 2));
    console.log('\n=== CONSOLE (' + logs.length + ') ===');
    logs.slice(0, 60).forEach(l => console.log(l));
    console.log('\n=== PAGE ERRORS (' + errors.length + ') ===');
    errors.forEach(e => console.log(e));
    console.log('\n=== FAILED LOADS (' + failed.length + ') ===');
    failed.forEach(f => console.log(f));

    api.close();
    process.exit(0);
})().catch(e => { console.error('PROBE FAILED:', e.message); process.exit(1); });