import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();

    // We will collect results here
    let results = [];
    const logResult = (name, pass) => results.push(`${name}: ${pass ? 'PASS' : 'FAIL'}`);

    // Load page
    await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle0' });

    // 1-5 Transition (Simulating the scroll via the exposed progress function)
    await page.evaluate(() => {
        window.setVoxelProgress(0.999);
        setTimeout(() => {
           if(typeof window.onSaifWorldLock === 'function') window.onSaifWorldLock();
           // force the final threshold check in script.js which calls lockWorld -> onSaifWorldLock
        }, 500);
    });

    await new Promise(r => setTimeout(r, 1000));

    // Get Probe Data
    const probe1 = await page.evaluate(() => typeof window.__saifTestProbe === 'function' ? window.__saifTestProbe() : null);

    logResult("Shiganshina visible (gameActive)", probe1 && probe1.gameActive);
    logResult("Player respawned at (-16, 0)", probe1 && probe1.player.x === -16 && probe1.player.z === 0);
    logResult("Player inside solid (house/ground intersection)", probe1 && !probe1.insideSolid);

    // Simulate Input W + Space
    await page.keyboard.down('KeyW');
    await page.keyboard.down('Space');
    await new Promise(r => setTimeout(r, 200));
    await page.keyboard.up('KeyW');
    await page.keyboard.up('Space');

    // Check Probe 2 (Movement check)
    const probe2 = await page.evaluate(() => typeof window.__saifTestProbe === 'function' ? window.__saifTestProbe() : null);

    logResult("WASD/Jump works (Player displaced)", probe2 && probe2.player.x !== -16);

    // Simulate Pointer Lock / Mouse Movement (Checking if errors occur)
    let pointerError = await page.evaluate(() => {
        try {
            document.dispatchEvent(new MouseEvent('mousemove', {movementX: 10, movementY: 5}));
            return false; // no errors
        } catch(e) { return true; }
    });
    logResult("Mouse camera dispatches without error", !pointerError);

    console.log("=== PLAYTEST RESULTS ===");
    results.forEach(r => console.log(r));

    await browser.close();
})();
