import puppeteer from 'puppeteer';
(async () => {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const logs = [];
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
    await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle0' });
    const winState = await page.evaluate(() => {
        return {
            hasSetProgress: typeof window.setVoxelProgress === 'function',
            worldLocked: typeof window.worldLocked !== 'undefined' ? window.worldLocked : 'undefined (module scoped)',
            gameActive: typeof window.gameActive !== 'undefined' ? window.gameActive : 'undefined (module scoped)'
        };
    });
    console.log('Window state:', winState);
    await browser.close();
})();
