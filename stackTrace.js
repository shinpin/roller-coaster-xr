const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.on('console', msg => console.log('CON:', msg.text()));
    page.on('pageerror', err => console.log('ERR:', err.toString(), err.stack));
    await page.goto('http://localhost:8080/', { waitUntil: 'networkidle2' });
    await browser.close();
})();
