import { test, expect } from '@playwright/test';

test('first page, sample question, selected-question review, and reset', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /복잡한 법률 고민/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: /부동산·임대차/ }).click();
  await expect(page.getByRole('textbox', { name: '법률 질문' })).toHaveValue(/보증금/);
  await page.getByRole('button', { name: '질문 보내기' }).click();
  await expect(page.getByText('예시 답변', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '변호사에게 검증 요청', exact: true }).click();
  const dialog = page.locator('dialog[open]');
  await expect(
    dialog.getByText('계약이 끝났는데 집주인이 보증금을 돌려주지 않아요.', { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel('답변받을 이메일').fill('demo@example.com');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: '검증 요청 체험하기' }).click();
  await expect(dialog.getByRole('heading', { name: /검증 요청 흐름을/ })).toBeVisible();
  await expect(dialog.getByText(/실제 접수나 이메일 발송은 하지 않았어요/)).toBeVisible();
  await dialog.getByRole('button', { name: '대화로 돌아가기' }).click();
  if (await page.getByRole('button', { name: '메뉴 열기' }).isVisible())
    await page.getByRole('button', { name: '메뉴 열기' }).click();
  await page.getByRole('button', { name: '새로운 질문 시작하기' }).click();
  await page.getByRole('button', { name: '새 대화 시작', exact: true }).click();
  await expect(page.getByRole('heading', { name: /복잡한 법률 고민/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('guide dismisses with Escape; prototype inputs never leave browser', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') writes.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: '어떻게 진행되나요?' }).click();
  await expect(page.getByRole('heading', { name: '변호사 검증, 이렇게 진행돼요' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByRole('textbox', { name: '법률 질문' }).fill('테스트 질문');
  await page.getByRole('button', { name: '질문 보내기' }).click();
  await expect(page.getByText('예시 답변', { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});
