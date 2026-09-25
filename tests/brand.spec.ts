import { test, expect } from '@playwright/test';

test('question-first brand layout and logo fit the viewport', async ({ page }, testInfo) => {
  await page.route('**/api/v1/chat/history', (route) =>
    route.fulfill({ json: { success: true, data: { messages: [] } } }),
  );
  await page.route('**/api/v1/chat/conversations', (route) =>
    route.fulfill({ json: { success: true, data: [] } }),
  );
  await page.route('**/api/v1/reviews', (route) =>
    route.fulfill({ json: { success: true, data: [] } }),
  );
  await page.route('**/api/v1/config', (route) =>
    route.fulfill({
      json: {
        data: {
          mode: 'prototype',
          officeName: '법률사무소 IBS',
          questionLimitEnabled: false,
          maxQuestions: 3,
        },
      },
    }),
  );
  await page.goto('/');
  await expect(page).toHaveTitle('AI QAVER | 질문에서 확신까지');
  await expect(page.locator('.sidebar')).toHaveCount(1);
  await expect(page.locator('.workspace-title')).toHaveCount(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    '/brand/aiqaver-symbol.png',
  );
  await expect(page.getByRole('button', { name: '새로운 질문 시작하기' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/법률사무소|사무실/);
  await page.getByRole('button', { name: '이용 방법', exact: true }).click();
  await expect(page.locator('dialog[open]')).not.toContainText(/법률사무소|사무실|변호사/);
  await page.keyboard.press('Escape');
  const composer = page.getByRole('textbox', { name: '질문' });
  await expect(composer).toBeVisible();
  const hero = await page.locator('.hero').boundingBox();
  const inputBox = await page.locator('.composer').boundingBox();
  expect(hero && inputBox && hero.y + hero.height <= inputBox.y).toBe(true);
  expect(await composer.evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(
    await page.locator('.topic-grid').evaluate((el) => el.getBoundingClientRect().top),
  );
  await composer.fill('효율적인 학습 계획을 세우고 싶어요.');
  await expect(page.getByRole('button', { name: '질문 보내기' })).toHaveCSS(
    'background-color',
    'rgb(37, 99, 235)',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect
    .poll(() => page.locator('.brand-logo').evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('fo.png'), fullPage: true });
});

test('expert login replaces office management and fits the viewport', async ({
  page,
}, testInfo) => {
  await page.route('**/api/v1/bo/me', (route) =>
    route.fulfill({
      status: 401,
      json: { success: false, error: { message: '로그인이 필요합니다.' } },
    }),
  );
  await page.goto('http://127.0.0.1:5174');
  await expect(page).toHaveTitle('AI QAVER Office | 전문가 검증 커뮤니티');
  await expect(page.getByRole('img', { name: 'AI QAVER Office', exact: true })).toHaveAttribute(
    'src',
    '/brand/aiqaver-office.png',
  );
  await expect(page.getByRole('img', { name: 'AI QAVER Office', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/사무실|휴가 관리|변호사 관리/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('bo.png'), fullPage: true });
  await page.getByRole('button', { name: /아직 계정이 없나요/ }).click();
  await expect(page.getByRole('heading', { name: '회원가입', exact: true })).toBeVisible();
  await expect(page.getByLabel('이름', { exact: true })).toBeVisible();
});
