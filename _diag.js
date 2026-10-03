/* Minimal 10-point browser diagnostic. Read-only. No fixes, no journey. */
const { connect } = require('./_cdp.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    // open page
    const r = await fetch('http://127.0.0.1:9222/json/new?http://127.0.0.1:8123/index.html', { method: 'PUT' });
    const tab = await r.json();
    const api = await connect(tab.webSocketDebuggerUrl);

    const errors = [], logs = [];
    api.on(msg => {
        if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params.exceptionDetails;
            errors.push(`${d.text} ${d.exception ? (d.exception.description || d.exception.value) : ''} @${(d.url||'').split('/').pop()}:${d.lineNumber}`);
        }
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
            errors.push('[console.error] ' + (msg.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' '));
        }
    });

    await api.send('Runtime.enable');
    await api.send('Page.enable');
    await api.send('Page.reload', { ignoreCache: true });
    await sleep(4000); // let page finish loading (incl. three.js CDN import)

    const ev = async expr => {
        const r2 = await api.send('Runtime.evaluate', { expression: expr, returnByValue: true });
        const rr = r2 && r2.result ? r2.result : r2;
        return rr && 'value' in rr ? rr.value : rr;
    };

    const diag = await ev(`(function(){
        const canvas = document.getElementById('voxel-canvas');
        const overlay = document.getElementById('voxel-world');
        return {
            readyState: document.readyState,
            voxelCanvasExists: !!canvas,
            voxelCanvasSized: !!(canvas && canvas.width > 0),
            worldOverlayExists: !!overlay,
            worldOpacity: overlay ? getComputedStyle(overlay).opacity : null,
            threeOnWindow: typeof window.THREE,
            setVoxelProgressExists: typeof window.setVoxelProgress,
            activateGameExists: typeof window.activateGame,
            testProbeExists: typeof window.__saifTestProbe,
            moduleLoaded: typeof window.setVoxelProgress === 'function', // set at end of voxel-world.js
        };
    })()`);

    console.log('READY:', diag.readyState);
    console.log('VOXEL CANVAS:', diag.voxelCanvasExists ? 'yes' : 'no', '(sized:', diag.voxelCanvasSized + ')');
    console.log('THREE on window:', diag.threeOnWindow);
    console.log('VOXEL INITIALIZER (window.setVoxelProgress):', diag.setVoxelProgressExists);
    console.log('ACTIVATE GAME (window.activateGame):', diag.activateGameExists);
    console.log('MODULE LOADED:', diag.moduleLoaded ? 'yes' : 'no');
    console.log('WORLD OVERLAY opacity (0 = pre-journey):', diag.worldOpacity);
    console.log('CONSOLE ERRORS:', errors.length);
    errors.slice(0, 5).forEach(e => console.log('  !', e));

    api.close();
    process.exit(0);
})().catch(e => { console.error('DIAG FAILED:', e.message); process.exit(1); });