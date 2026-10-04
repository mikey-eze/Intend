/**
 * Automated screenshot capture of Shiganshina environment
 * Navigates through: Space → Galaxy → Earth → World entry → Town views
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SHOTS_DIR = path.join(__dirname, 'shiganshina-screenshots');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR);

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: { width: 1920, height: 1080 },
        args: ['--window-size=1920,1080']
    });

    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:8123/', { waitUntil: 'networkidle0' });

    console.log('Page loaded. Starting journey...');
    await wait(2000);

    // === SCROLL TO TRIGGER EARTH TRANSITION ===
    console.log('Scrolling to Earth...');

    for (let i = 0; i < 150; i++) {
        await page.evaluate(() => window.scrollBy(0, 80));
        await wait(50);
    }

    console.log('Waiting for world entry...');
    await wait(8000);

    await page.click('body');
    await wait(1000);

    console.log('Entering world (requesting pointer lock)...');

    await page.evaluate(() => {
        const canvas = document.getElementById('voxel-canvas');
        if (canvas) canvas.click();
    });

    await wait(2000);

    // === CAPTURE SCREENSHOTS ===

    console.log('Capturing: spawn view');
    await page.screenshot({
        path: path.join(SHOTS_DIR, '01-spawn-view.png'),
        fullPage: false
    });
    await wait(500);

    const captureView = async (name, keys, duration = 1000) => {
        console.log(`Capturing: ${name}`);
        for (const key of keys) {
            await page.keyboard.down(key);
        }
        await wait(duration);
        for (const key of keys) {
            await page.keyboard.up(key);
        }
        await wait(500);
        await page.screenshot({
            path: path.join(SHOTS_DIR, `${name}.png`),
            fullPage: false
        });
    };

    await page.mouse.move(1400, 540);
    await wait(300);
    await captureView('02-main-street-right', [], 0);

    await captureView('03-forward-view', ['KeyW'], 2000);

    await page.mouse.move(800, 540);
    await wait(300);
    await captureView('04-west-district', [], 0);

    await captureView('05-toward-canal', ['KeyW', 'KeyD'], 3000);

    await page.mouse.move(1100, 640);
    await wait(300);
    await captureView('06-canal-view', [], 0);

    await captureView('07-residential-area', ['KeyW'], 2500);

    await page.mouse.move(600, 540);
    await wait(500);
    await captureView('08-town-center-view', [], 0);

    await page.mouse.move(960, 340);
    await wait(300);
    await captureView('09-wall-view', [], 0);

    await captureView('10-overview', ['KeyA', 'KeyW'], 2000);

    console.log(`Screenshots saved to: ${SHOTS_DIR}`);
    console.log('Keeping browser open for 5 seconds...');

    await wait(5000);

    await browser.close();
    console.log('Done!');
    process.exit(0);
})();
