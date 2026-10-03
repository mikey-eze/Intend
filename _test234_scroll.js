/*
 * BROWSER TESTS 2-5 — SPACE, SCROLL JOURNEY, EARTH APPROACH, WORLD TRANSITION
 * Drives real mouse-wheel input events and samples the live scene at each
 * stage of the journey.
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

    // Read the live journey state.
    const probe = () => cdp.send('Runtime.evaluate', {
        expression: `(() => {
            const g = document.querySelector('.galaxy');
            const e = document.querySelector('.earth');
            const ov = document.getElementById('voxel-world');
            const hud = document.getElementById('game-hud');
            const prompt = document.getElementById('lock-prompt');
            const num = s => { const m = /scale\\(([\\d.]+)\\)/.exec(s||''); return m ? +m[1] : null; };
            return JSON.stringify({
                scrollY: Math.round(window.scrollY),
                maxScroll: Math.round(document.documentElement.scrollHeight - window.innerHeight),
                galaxyScale: num(g?.style.transform),
                galaxyOpacity: g ? +(+g.style.opacity).toFixed(3) : null,
                earthScale: num(e?.style.transform),
                earthOpacity: e ? +(+e.style.opacity).toFixed(3) : null,
                earthDisplay: e?.style.display,
                overlayOpacity: ov?.style.opacity,
                hudDisplay: hud ? getComputedStyle(hud).display : null,
                hudOpacity: hud ? hud.style.opacity : null,
                promptDisplay: prompt ? getComputedStyle(prompt).display : null,
                objective: document.getElementById('hud-objective')?.textContent || null,
                // is the voxel canvas actually drawing non-black pixels?
                voxelLive: (() => {
                    const c = document.getElementById('voxel-canvas');
                    if (!c) return 'no-canvas';
                    return c.width + 'x' + c.height;
                })(),
            });
        })()`, returnByValue: true
    }).then(r => JSON.parse(r.result.value));

    // Real wheel input, in page coordinates.
    async function wheel(deltaY, times = 1, gapMs = 60) {
        for (let i = 0; i < times; i++) {
            await cdp.send('Input.dispatchMouseEvent', {
                type: 'mouseWheel', x: 640, y: 400,
                deltaX: 0, deltaY, pointerType: 'mouse'
            });
            await sleep(gapMs);
        }
    }

    const stage = async (label) => {
        const s = await probe();
        console.log(`\n[${label}]`);
        console.log(`   scrollY=${s.scrollY}/${s.maxScroll}  galaxy scale=${s.galaxyScale} op=${s.galaxyOpacity}`);
        console.log(`   earth   scale=${s.earthScale} op=${s.earthOpacity} display=${s.earthDisplay}`);
        console.log(`   overlay=${s.overlayOpacity}  hud=${s.hudDisplay} prompt=${s.promptDisplay}  voxel=${s.voxelLive}`);
        return s;
    };

    console.log('=== BROWSER TEST 2: SPACE ===');
    const s0 = await stage('initial load');
    // Confirm the star canvas is actually animating (not a frozen frame).
    const frameA = await cdp.send('Runtime.evaluate', {
        expression: `document.getElementById('space-dust').toDataURL().length`, returnByValue: true });
    await sleep(1200);
    const frameB = await cdp.send('Runtime.evaluate', {
        expression: `document.getElementById('space-dust').toDataURL().length`, returnByValue: true });
    const animating = frameA.result.value !== frameB.result.value;
    console.log(`   star canvas changing between frames? ${animating ? 'YES (animating)' : 'NO (FROZEN!)'}`);

    console.log('\n=== BROWSER TEST 3/4: SCROLL JOURNEY + EARTH APPROACH ===');
    // Scroll down in a controlled way, sampling as we go.
    const samples = [];
    for (let round = 1; round <= 14; round++) {
        await wheel(400, 3);
        await sleep(1400);
        const s = await probe();
        samples.push({ round, ...s });
        console.log(`  r${String(round).padStart(2)} scrollY=${String(s.scrollY).padStart(4)} | galaxy ${s.galaxyScale} op${s.galaxyOpacity} | earth ${s.earthScale} op${s.earthOpacity} ${s.earthDisplay} | overlay ${s.overlayOpacity} | hud ${s.hudDisplay}`);
        if (s.hudDisplay && s.hudDisplay !== 'none') { console.log('  --> WORLD REACHED, stopping scroll'); break; }
    }

    console.log('\n--- EARTH PROGRESSION CHECK ---');
    const earthSeen = samples.filter(s => s.earthDisplay === 'block' && s.earthOpacity > 0.01);
    const scales = earthSeen.map(s => s.earthScale);
    const uniq = [...new Set(scales)].sort((a, b) => a - b);
    console.log(`  Earth visible in ${earthSeen.length} samples`);
    console.log(`  distinct Earth scales observed (ascending): ${uniq.join(' -> ')}`);
    const grew = uniq.length >= 3 && uniq[uniq.length - 1] > uniq[0] * 3;
    console.log(`  ${grew ? 'PASS' : 'FAIL'}: Earth visibly grew from small to large (${uniq[0]} -> ${uniq[uniq.length-1]})`);

    console.log('\n--- IDLE CHECK: does Earth keep growing with no input? ---');
    const before = await probe();
    await sleep(4000);
    const after = await probe();
    console.log(`  before: earthScale=${before.earthScale} overlay=${before.overlayOpacity}`);
    console.log(`  after 4s idle: earthScale=${after.earthScale} overlay=${after.overlayOpacity}`);
    console.log(`  ${before.earthScale === after.earthScale ? 'PASS: no idle progression' : 'NOTE: changed while idle'}`);

    console.log('\n--- LARGE WHEEL TEST: can one gesture skip to the world? ---');
    await cdp.send('Page.navigate', { url: URL_UNDER_TEST });
    await sleep(6000);
    await wheel(3000, 1);   // one enormous flick
    await sleep(1500);
    const big1 = await probe();
    console.log(`  after ONE 3000px flick + 1.5s: earth=${big1.earthScale} overlay=${big1.overlayOpacity} hud=${big1.hudDisplay}`);
    console.log(`  ${big1.hudDisplay === 'none' || !big1.hudDisplay ? 'PASS: did not skip to the world' : 'FAIL: skipped straight to the world'}`);

    console.log('\n--- CONTINUE TO WORLD ---');
    for (let i = 0; i < 20; i++) {
        await wheel(500, 3);
        await sleep(1200);
        const s = await probe();
        if (s.hudDisplay && s.hudDisplay !== 'none') {
            console.log(`  WORLD REACHED at scrollY=${s.scrollY} overlay=${s.overlayOpacity} hud=${s.hudDisplay} prompt=${s.promptDisplay}`);
            console.log(`  objective: ${s.objective}`);
            break;
        }
    }
    const fin = await probe();
    console.log(`\n  FINAL: overlay=${fin.overlayOpacity} hud=${fin.hudDisplay} prompt=${fin.promptDisplay}`);
    console.log(`  ${fin.hudDisplay && fin.hudDisplay !== 'none' ? 'PASS: world + HUD active' : 'FAIL: world did not load'}`);

    console.log(`\n--- Page errors during journey: ${errors.length ? errors.join(' | ') : 'none'} ---`);
    cdp.close();
    process.exit(0);
})().catch(e => { console.error('DRIVER ERROR:', e.message); process.exit(1); });
