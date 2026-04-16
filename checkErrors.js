const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.on('console', msg => { if(msg.type() === 'error') console.log('ERR:', msg.text()); });
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    
    page.on('response', response => {
        if (!response.ok()) {
            console.log(`Resource failed: ${response.url()} (Status: ${response.status()})`);
        }
    });
    
    await page.goto('http://localhost:8080/', { waitUntil: 'networkidle2' });
    
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({path: 'check.png'});
    
    await browser.close();
})();
