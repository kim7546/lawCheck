import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('test-results/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:5173');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `test-results/screenshots/fo-${name}.png`, fullPage: true });
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://127.0.0.1:5174');
  await page.getByRole('heading', { name: '업무 현황', exact: true }).waitFor();
  await page.screenshot({ path: 'test-results/screenshots/bo-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '휴가 관리' }).click();
  await page.getByRole('heading', { name: '휴가 관리', exact: true }).waitFor();
  console.log('FO desktop/mobile screenshots captured; BO navigation verified.');
} finally {
  await browser.close();
}
