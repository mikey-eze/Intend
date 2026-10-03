/*
 * Journey test with CORRECT timing.
 *
 * script.js rate-limits journeyTarget to MAX_TARGET_RATE per ms (0.000085),
 * so the playhead needs >= ~11.8 s to cross 0 -> 1. Sampling after 1 s shows
 * a frozen scene, not a broken one. This test scrolls, then polls journey
 * progress over ~20 s so we see the actual progression.
 */
const { connect } = require('./_cdp.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openPage(url) {
    const r = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    return r.json();
}

(async () => {
    const tab = await openPage('http://127.0.0.1:8123/index.html');
    const api = await connect(tab.webSocketDebuggerUrl);

    const logs = [], errors = [];
    api.on(msg => {
        if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params.exceptionDetails;
            errors.push(`${d.text} ${d.exception ? (d.exception.description || d.exception.value) : ''} @${d.url || ''}:${d.lineNumber}`);
        }
        if (msg.method === 'Runtime.consoleAPICalled') {
            logs.push(`[${msg.params.type}] ` + (msg.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' '));
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

    console.log('scrollHeight =', await ev('document.documentElement.scrollHeight'));

    // Real wheel input, as a user would. deltaY 500 per notch.
    console.log('\n--- dispatching wheel scroll to bottom ---');
    for (let i = 0; i < 30; i++) {
        await api.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel', x: 640, y: 460, deltaX: 0, deltaY: 600
        });
        await sleep(120);
    }
    await sleep(500);
    console.log('scrollY after wheel =', await ev('window.scrollY'));

    const probe = `(function(){
        const q=s=>document.querySelector(s);
        const st=el=>el?getComputedStyle(el):null;
        const e=q('.earth'), g=q('.galaxy'), w=document.getElementById('voxel-world');
        return {
            scrollY: Math.round(window.scrollY),
            galaxyOp: st(g)?st(g).opacity:null,
            earthOp: st(e)?st(e).opacity:null,
            earthTransform: st(e)?st(e).transform:null,
            worldOp: st(w)?st(w).opacity:null,
            worldPointer: st(w)?st(w).pointerEvents:null,
            hudText: (document.getElementById('game-hud')||{}).innerText ? document.getElementById('game-hud').innerText.replace(/\\s+/g,' ') : null,
        };
    })()`;

    // Poll: journeyCurrent takes >= 11.8 s to cross 0 -> 1, so watch it climb.
    for (let i = 0; i < 12; i++) {
        const s = await ev(probe);
        console.log(`t=${(i * 2).toString().padStart(2)}s`, JSON.stringify(s));
        await sleep(2000);
    }

    console.log('\n=== PAGE ERRORS (' + errors.length + ') ===');
    errors.slice(0, 20).forEach(e => console.log(e));
    console.log('\n=== CONSOLE (' + logs.length + ') ===');
    logs.slice(0, 30).forEach(l => console.log(l));

    api.close();
    process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });