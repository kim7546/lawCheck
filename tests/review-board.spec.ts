import { test, expect } from '@playwright/test';

test('reviewer signs up, claims a request and submits a verification answer', async ({
  page,
}, testInfo) => {
  let authenticated = false;
  const user = { id: 'reviewer-1', name: '답변자', email: 'review@example.com' };
  const post = {
    id: 'post-1',
    question: '보증금을 돌려받으려면 어떻게 하나요?',
    aiAnswer: '계약서와 지급 내역을 확인하세요.',
    status: 'REQUESTED',
    reply: null as string | null,
    createdAt: new Date().toISOString(),
    completedAt: null as string | null,
  };
  await page.route('**/api/v1/bo/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if (path.endsWith('/me')) {
      if (!authenticated)
        return route.fulfill({ status: 401, json: { error: { message: '로그인이 필요합니다.' } } });
      data = user;
    } else if (path.endsWith('/signup')) {
      authenticated = true;
      data = user;
    } else if (path.endsWith('/claim')) {
      post.status = 'REVIEWING';
    } else if (path.endsWith('/complete')) {
      post.status = 'COMPLETED';
      post.reply = route.request().postDataJSON().reply;
      post.completedAt = new Date().toISOString();
    } else if (path.endsWith('/post-1')) data = post;
    else if (path.endsWith('/logout')) authenticated = false;
    else data = { items: [post], total: 1, page: 1 };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('http://127.0.0.1:5174');
  await page.getByRole('button', { name: /아직 계정이 없나요/ }).click();
  await page.getByLabel('이름', { exact: true }).fill(user.name);
  await page.getByLabel('이메일', { exact: true }).fill(user.email);
  await page.getByLabel('비밀번호', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: '가입하고 시작하기' }).click();
  await expect(page.getByRole('heading', { name: '검증 요청 게시판' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('board.png'), fullPage: true });
  await page.getByRole('button', { name: /보증금을 돌려받으려면/ }).click();
  await expect(page.getByText(post.aiAnswer)).toBeVisible();
  await expect(page.getByRole('button', { name: '검증완료', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '검증', exact: true }).click();
  await page
    .getByLabel('검토 의견과 보완할 내용을 작성해 주세요.')
    .fill('계약 종료일과 보증금 지급 증빙을 함께 확인해 주세요.');
  await page.getByRole('button', { name: '검증완료', exact: true }).click();
  await expect(
    page.getByText('계약 종료일과 보증금 지급 증빙을 함께 확인해 주세요.'),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText('검증을 완료했습니다.');
  await expect(page.getByRole('button', { name: '검증', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('textbox', { name: '검토 의견과 보완할 내용을 작성해 주세요.' }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('completed.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: '검증 요청 게시판' })).toBeVisible();
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
});

test('requester compares multiple answers and keeps exactly one selection after reload', async ({
  page,
}, testInfo) => {
  const review = {
    id: 'post-1',
    question: '보증금 반환에 대한 검증 요청',
    selectedAnswerId: null as string | null,
    answers: [
      {
        id: 'answer-a',
        reply: '첫 번째 검증 의견입니다.',
        reviewer: { name: '답변자 A' },
        completedAt: new Date().toISOString(),
      },
      {
        id: 'answer-b',
        reply: '두 번째 검증 의견입니다.',
        reviewer: { name: '답변자 B' },
        completedAt: new Date().toISOString(),
      },
    ],
  };
  await page.route('**/api/v1/chat/history', (route) =>
    route.fulfill({ json: { success: true, data: { messages: [] } } }),
  );
  await page.route('**/api/v1/chat/conversations', (route) =>
    route.fulfill({ json: { success: true, data: [] } }),
  );
  await page.route('**/api/v1/reviews/post-1/read', (route) =>
    route.fulfill({ json: { success: true } }),
  );
  let failSelection = false;
  await page.route('**/api/v1/config', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: { mode: 'prototype', questionLimitEnabled: false, maxQuestions: 3 },
      },
    }),
  );
  await page.route('**/api/v1/reviews', (route) =>
    route.fulfill({ json: { success: true, data: [review] } }),
  );
  await page.route('**/api/v1/reviews/post-1/selection', (route) => {
    if (failSelection)
      return route.fulfill({
        status: 503,
        json: { error: { message: '선택을 저장하지 못했습니다.' } },
      });
    review.selectedAnswerId = route.request().postDataJSON().answerId;
    return route.fulfill({
      json: { success: true, data: { selectedAnswerId: review.selectedAnswerId } },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '검증 알림 2개' })).toBeVisible();
  await page.getByRole('button', { name: '검증 알림 2개' }).click();
  const results = page.getByRole('region', { name: '검증 결과' });
  await expect(results.getByText('첫 번째 검증 의견입니다.')).toBeVisible();
  await expect(results.getByText('두 번째 검증 의견입니다.')).toBeVisible();
  await results.getByRole('button', { name: '이 답변 선택' }).first().click();
  await expect(results.locator('.selected-answer')).toContainText('첫 번째 검증 의견입니다.');
  await page.reload();
  await page.getByRole('button', { name: '검증 알림 2개' }).click();
  await expect(results.locator('.selected-answer')).toContainText('첫 번째 검증 의견입니다.');
  failSelection = true;
  await results.getByRole('button', { name: '이 답변 선택' }).click();
  await expect(results.getByRole('alert')).toHaveText('선택을 저장하지 못했습니다.');
  await expect(results.locator('.selected-answer')).toContainText('첫 번째 검증 의견입니다.');
  failSelection = false;
  await results.getByRole('button', { name: '이 답변 선택' }).click();
  await expect(results.locator('.selected-answer')).toHaveCount(1);
  await expect(results.locator('.selected-answer')).toContainText('두 번째 검증 의견입니다.');
  await page.reload();
  await page.getByRole('button', { name: '검증 알림 2개' }).click();
  await expect(results.locator('.selected-answer')).toContainText('두 번째 검증 의견입니다.');
  await expect(results.getByRole('button', { name: '선택 완료' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await results.screenshot({ path: testInfo.outputPath('multiple-answers.png') });
});
