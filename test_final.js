import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    const logs = [];
    const errors = [];
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => errors.push(err.toString()));

    // Navigate to page
    await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle0' });

    // Simulate interaction/scroll to trigger transition
    await page.evaluate(() => {
        window.setVoxelProgress(0.995);
    });
    await new Promise(r => setTimeout(r, 2000));

    // Audit State
    const state = await page.evaluate(() => {
        return {
            gameActive: typeof gameActive !== 'undefined' ? gameActive : 'undefined',
            worldLocked: typeof worldLocked !== 'undefined' ? worldLocked : 'undefined',
            SPAWN: typeof SPAWN !== 'undefined' ? SPAWN : 'undefined',
            buildShinganshina_Executed: !!window.__test_shinganshina_executed // Note: I can't check this if I don't modify the source
        };
    });

    console.log('--- Console Logs ---');
    console.log(logs);
    console.log('\n--- Page Errors ---');
    console.log(errors);
    console.log('\n--- Runtime State ---');
    console.log(state);

    await browser.close();
})().catch(e => {
    console.error('Test error:', e);
});
