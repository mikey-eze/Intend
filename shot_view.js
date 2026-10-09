const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--window-size=1280,720']
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: 'shot_space.png' });
  console.log('saved shot_space.png');
  await browser.close();
})();
