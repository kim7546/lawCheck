import { test, expect } from '@playwright/test';

test('question-first brand layout and logo fit the viewport', async ({ page }, testInfo) => {
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
  await expect(page).toHaveTitle(/aiqaver.com/);
  await expect(page.locator('aside, .sidebar, .nav-backdrop')).toHaveCount(0);
  await expect(page.getByRole('banner').getByRole('img', { name: 'aiqaver.com' })).toBeVisible();
  await expect(page.getByRole('button', { name: '새로운 질문 시작하기' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/법률사무소|사무실/);
  await page.getByRole('button', { name: '이용 방법', exact: true }).click();
  await expect(page.locator('dialog[open]')).not.toContainText(/법률사무소|사무실|변호사/);
  await page.keyboard.press('Escape');
  const composer = page.getByRole('textbox', { name: '질문' });
  await expect(composer).toBeVisible();
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

test('office brand, navigation and cards fit the viewport', async ({ page }, testInfo) => {
  await page.goto('http://127.0.0.1:5174');
  await expect(page).toHaveTitle(/aiqaver.com Office/);
  await expect(page.getByRole('img', { name: 'aiqaver.com' })).toBeVisible();
  await expect(page.locator('.stats article')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('bo.png'), fullPage: true });
  await page.getByRole('button', { name: '검증 요청', exact: true }).click();
  await expect(page.getByRole('heading', { name: '검증 요청', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '검증 요청', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
