import puppeteer from 'puppeteer';
(async () => {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.toString()));
    
    // Inject instrumentation to trace place()
    await page.evaluateOnNewDocument(() => {
        let occ = new Set();
        let log = [];
        const originalPlace = window.place; // This won't work easily as place is local to buildShinganshina
        // We need to inject the trace into voxel-world.js via buildShinganshina
    });
    
    await page.goto('http://127.0.0.1:8123/index.html');
    await new Promise(r => setTimeout(r, 2000));
    console.log('Errors:', errors);
    await browser.close();
})();
