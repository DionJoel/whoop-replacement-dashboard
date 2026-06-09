const { chromium } = require('playwright-chromium');
(async () => {
  const browser = await chromium.launch({ headless: true, args:['--no-sandbox','--disable-setuid-sandbox']});
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36' });
  const page = await context.newPage();
  const response = await page.goto('https://cronometer.com/login/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('status', response && response.status());
  const html = await page.content();
  console.log('length', html.length);
  console.log(html.slice(0, 2000));
  await page.screenshot({ path: '/tmp/cronometer_login.png', fullPage: true });
  console.log('screenshot saved to /tmp/cronometer_login.png');
  await browser.close();
})();
