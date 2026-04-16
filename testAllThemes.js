const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.on('console', msg => { if(msg.type() === 'error') console.log('ERR:', msg.text()); });
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    
    await page.goto('http://localhost:8080/', { waitUntil: 'networkidle2' });
    
    const themes = ['underwater', 'sky', 'land', 'synthwave', 'kyoto', 'taipei'];
    for(const t of themes) {
        console.log('Testing theme:', t);
        await page.evaluate((theme) => {
            document.getElementById('theme-select').value = theme;
            document.getElementById('theme-select').dispatchEvent(new Event('change'));
        }, t);
        await new Promise(r => setTimeout(r, 1000));
    }
    
    await browser.close();
})();
