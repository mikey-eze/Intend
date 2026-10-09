import puppeteer from 'puppeteer';
(async () => {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.toString()));
    await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle0' });
    await page.evaluate(() => window.setVoxelProgress(1.0));
    await new Promise(r => setTimeout(r, 2000));
    const state = await page.evaluate(() => ({
        gameActive: typeof gameActive !== 'undefined' ? gameActive : false,
        player: typeof player !== 'undefined' ? {x: player.x, z: player.z} : null
    }));
    console.log('State:', JSON.stringify(state));
    console.log('Errors:', errors);
    await browser.close();
})();
