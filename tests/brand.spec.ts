import { test, expect } from '@playwright/test';

test('free AI templates, notice and labeled ad fit the viewport in order', async ({
  page,
}, testInfo) => {
  let chatCalls = 0;
  await page.route('**/api/v1/chat', (route) => {
    chatCalls++;
    return route.fulfill({ json: { success: true, data: { answer: '테스트 답변' } } });
  });
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
  await expect(page).toHaveTitle('무료 AI');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    '무료 AI로 궁금한 점을 물어보세요. AI QAVER에서 AI와 대화하고 답변을 확인하세요.',
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', '무료 AI');
  await expect(
    page.getByRole('heading', { name: '무엇이든 물어보세요', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.sidebar')).toHaveCount(1);
  await expect(page.locator('.workspace-title')).toHaveCount(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    '/brand/aiqaver-symbol.png',
  );
  await expect(page.getByRole('button', { name: '새로운 질문 시작하기' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/법률|변호사|상담/);
  const templates = page.getByRole('group', { name: '질문 템플릿' });
  await expect(templates.getByRole('button')).toHaveCount(4);
  await expect(templates.locator('svg')).toHaveCount(4);
  await page.getByRole('button', { name: '이용 방법', exact: true }).click();
  await expect(page.locator('dialog[open]')).not.toContainText(/법률사무소|사무실|변호사/);
  await page.keyboard.press('Escape');
  const composer = page.getByRole('textbox', { name: '질문' });
  await expect(composer).toBeVisible();
  const hero = await page.locator('.hero').boundingBox();
  const inputBox = await page.locator('.composer').boundingBox();
  expect(hero && inputBox && hero.y + hero.height <= inputBox.y).toBe(true);
  const ad = page.locator('.content-ad-slot');
  await expect(ad).toBeVisible();
  await expect(ad).toHaveText('ad');
  await expect(ad).toHaveCSS('border-top-style', 'solid');
  const adBox = await ad.boundingBox();
  const notice = await page.locator('.composer-notice').boundingBox();
  const templatesBox = await templates.boundingBox();
  const adLabel = await ad.locator('.ad-label').boundingBox();
  expect(
    inputBox && templatesBox && Math.abs(templatesBox.y - inputBox.y - inputBox.height - 10) < 1,
  ).toBe(true);
  expect(templatesBox && notice && templatesBox.y + templatesBox.height < notice.y).toBe(true);
  expect(notice && adBox && Math.abs(adBox.y - notice.y - notice.height - 10) < 1).toBe(true);
  expect(adBox && adLabel && adLabel.x > adBox.x && adLabel.x - adBox.x < 20).toBe(true);
  expect(adBox && adLabel && adLabel.y > adBox.y && adLabel.y - adBox.y < 15).toBe(true);
  expect(adBox && adBox.y + adBox.height <= page.viewportSize()!.height).toBe(true);
  expect(inputBox && adBox && adBox.width < inputBox.width).toBe(true);
  expect(adBox?.height).toBeGreaterThan(0);
  expect(adBox?.height).toBeLessThan(100);
  expect(await ad.evaluate((el) => parseFloat(getComputedStyle(el).borderRadius))).toBeGreaterThan(
    0,
  );
  for (const [name, prompt] of [
    ['글쓰기', '감사 인사를 전하는 정중한 이메일 초안을 작성해 줘.'],
    ['번역', "'도와주셔서 감사합니다. 좋은 하루 보내세요.'를 자연스러운 영어로 번역해 줘."],
    ['학습', '새로운 개념을 쉽게 이해하는 공부 방법과 일주일 학습 계획을 알려줘.'],
    ['아이디어', '일상에서 실천할 수 있는 창의적인 취미 아이디어 5가지를 추천해 줘.'],
  ]) {
    await templates.getByRole('button', { name, exact: true }).click();
    await expect(composer).toHaveValue(prompt);
    await expect(composer).toBeFocused();
  }
  expect(chatCalls).toBe(0);
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
