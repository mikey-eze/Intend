import puppeteer from 'puppeteer';
(async () => {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle0' });
    await page.evaluate(() => window.setVoxelProgress(1.0));
    await new Promise(r => setTimeout(r, 1000));
    
    // Check collision count for solidSet in the console
    const wallSolidCount = await page.evaluate(() => {
        return typeof window.__saifTestProbe === 'function' ? window.__saifTestProbe().solidCount : null;
    });
    console.log('Total solid blocks:', wallSolidCount);
    await browser.close();
})();
