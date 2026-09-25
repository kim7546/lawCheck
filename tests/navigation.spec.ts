import { test, expect } from '@playwright/test';

test('FO sidebar toggles without losing the draft and keeps a compact brand', async ({
  page,
  isMobile,
}, testInfo) => {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: {
        success: true,
        data: path.endsWith('/config')
          ? { questionLimitEnabled: false, mode: 'prototype', maxQuestions: 3 }
          : path.endsWith('/history')
            ? { messages: [] }
            : [],
      },
    });
  });
  await page.goto('/');
  const sidebar = page.getByRole('complementary', { name: '대화 이력' });
  const draft = page.getByRole('textbox', { name: '질문', exact: true });
  await expect(sidebar.locator('.sidebar-search-toggle')).not.toBeVisible();
  await draft.fill('메뉴를 접어도 작성 중인 질문은 유지됩니다.');
  if (isMobile) {
    const menu = page.getByRole('button', { name: '대화 메뉴 열기', exact: true });
    await menu.click();
    await expect(sidebar.locator('.brand-logo')).toBeVisible();
    await expect(sidebar.locator('.sidebar-search-toggle')).not.toBeVisible();
    await expect(sidebar.getByRole('button', { name: '사이드바 닫기' })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('fo-menu-open.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(sidebar).not.toBeVisible();
    await expect(menu).toBeFocused();
    await menu.click();
    await sidebar.getByRole('button', { name: '사이드바 닫기' }).click();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  } else {
    await sidebar.getByRole('button', { name: '사이드바 접기' }).click();
    await expect(sidebar).toHaveCSS('width', '72px');
    await expect(sidebar.locator('.brand-logo')).not.toBeVisible();
    await expect(sidebar.locator('.brand-symbol')).toBeVisible();
    await expect(sidebar.locator('.sidebar-toggle')).not.toBeVisible();
    await expect(sidebar.getByRole('button', { name: '대화 검색 열기' })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: '대화 메뉴 열기' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await page.screenshot({ path: testInfo.outputPath('fo-menu-collapsed.png'), fullPage: true });
    const mainBefore = await page.locator('.main-shell').boundingBox();
    const logo = sidebar.locator('.sidebar-logo');
    await logo.hover();
    await expect(sidebar).toHaveClass(/collapsed/);
    await expect(sidebar).toHaveCSS('width', '72px');
    await expect(logo).toHaveAttribute('aria-expanded', 'false');
    expect((await page.locator('.main-shell').boundingBox())?.x).toBe(mainBefore?.x);
    expect(await page.evaluate(() => localStorage.getItem('aiqaver.sidebar.collapsed'))).toBe(
      'true',
    );
    await logo.click();
    await expect(sidebar).toHaveCSS('width', '266px');
    await expect(logo).toHaveAttribute('aria-expanded', 'true');
    await expect(sidebar.locator('.brand-logo')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('aiqaver.sidebar.collapsed'))).toBe(
      'false',
    );
    await page.mouse.move(700, 300);
    await draft.click();
    await expect(sidebar).toHaveCSS('width', '266px');
    await sidebar.getByRole('button', { name: '사이드바 접기' }).click();
    await expect(sidebar).toHaveCSS('width', '72px');
    await expect(logo).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(sidebar).toHaveCSS('width', '266px');
    await expect(sidebar).not.toHaveClass(/collapsed/);
    await page.mouse.move(700, 300);
    await expect(sidebar).toHaveCSS('width', '266px');
    await sidebar.getByRole('button', { name: '사이드바 접기' }).click();
    await expect(sidebar).toHaveCSS('width', '72px');
  }
  await expect(draft).toHaveValue('메뉴를 접어도 작성 중인 질문은 유지됩니다.');
  if (!isMobile) {
    await page.reload();
    await expect(sidebar).toHaveCSS('width', '72px');
    await sidebar.getByRole('button', { name: '대화 검색 열기' }).click();
    await expect(page.getByRole('textbox', { name: '대화 검색' })).toBeFocused();
    await expect(sidebar.locator('.brand-logo')).toBeVisible();
    await expect(sidebar.getByRole('button', { name: '대화 검색 열기' })).not.toBeVisible();
    await sidebar.getByRole('button', { name: '사이드바 접기' }).click();
    await sidebar.getByRole('button', { name: '대화 메뉴 열기' }).click();
    await expect(sidebar).not.toHaveClass(/collapsed/);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(sidebar).toHaveCSS('transition-duration', '0s');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('admin shell has isolated navigation, direct access and no user API calls', async ({
  page,
}, testInfo) => {
  const apiRequests: string[] = [];
  await page.route('**/api/**', (route) => {
    apiRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto('/admin');
  await expect(page).toHaveTitle('AI QAVER Admin | 사용자 관리');
  const logo = page.getByRole('img', { name: 'AI QAVER Admin' });
  await expect(logo).toBeVisible();
  await expect
    .poll(() => logo.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    '/brand/aiqaver-symbol.png',
  );
  await expect(page.getByRole('heading', { name: '관리 홈', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('admin-home.png'), fullPage: true });
  const nav = page.getByRole('navigation', { name: '사용자 관리' });
  await nav.getByRole('link', { name: 'FO 사용자 관리', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'FO 사용자 관리', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '사용자 검색' })).toBeDisabled();
  await nav.getByRole('link', { name: 'Office 사용자 관리', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: '전문가 그룹' })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Office 사용자 관리', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('admin-office-users.png'), fullPage: true });
  await page.goto('/admin/#fo-users');
  await expect(page.getByRole('heading', { name: 'FO 사용자 관리', exact: true })).toBeVisible();
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
