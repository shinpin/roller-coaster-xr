const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.on('console', msg => { if(msg.type() === 'error') console.log('ERR:', msg.text()); });
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    
    await page.goto('http://localhost:8080/', { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
        document.getElementById('start-btn').click();
    });
    await new Promise(r => setTimeout(r, 2000));
    await browser.close();
})();
