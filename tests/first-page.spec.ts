import { test, expect } from '@playwright/test';

test('keyboard submission preserves composition and scrolls to the newest question and answer', async ({
  page,
}) => {
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let calls = 0;
  const answer = Array.from({ length: 45 }, (_, i) => `답변 설명 ${i + 1}`).join('\n');
  await page.route('**/api/v1/chat', async (route) => {
    calls++;
    if (calls === 2) await pending;
    await route.fulfill({ json: { success: true, data: { answer, isLegalQuestion: true } } });
  });
  await page.goto('/');
  const input = page.getByRole('textbox', { name: '법률 질문' });
  await input.fill('첫 줄');
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('첫 줄\n');
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229 });
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', repeat: true });
  await expect(page.locator('.turn')).toHaveCount(0);
  expect(calls).toBe(0);
  await input.fill('보증금을 못 받았어요.');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(page.locator('.assistant-body > p').last()).toHaveText(answer);
  await input.fill('어떤 서류가 필요한가요?');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(page.getByText('AI가 답변을 준비하고 있어요…')).toBeVisible();
  const newest = page.locator('.turn').last();
  const question = newest.locator('.user-message');
  await expect(question).toBeInViewport({ ratio: 1 });
  await expect
    .poll(async () => {
      const q = await question.boundingBox();
      const composer = await page.locator('.composer-section').boundingBox();
      return !!q && !!composer && q.y >= 0 && q.y + q.height <= composer.y;
    })
    .toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  finish();
  await expect(newest.locator('.assistant-body > p')).toHaveText(answer);
  await expect(question).toBeInViewport({ ratio: 1 });
  await expect
    .poll(async () => {
      const box = await newest.boundingBox();
      return box ? Math.abs(box.y - 25) : Infinity;
    })
    .toBeLessThan(5);
  await expect(input).toHaveValue('');
  expect(calls).toBe(2);
});

test('disabled limit allows twelve questions and hides quota UI', async ({ page }) => {
  await page.route('**/api/v1/config', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          officeName: '법률사무소 IBS',
          mode: 'prototype',
          maxQuestions: 3,
          questionLimitEnabled: false,
          remainingQuestions: null,
        },
      },
    }),
  );
  const lengths: number[] = [];
  await page.route('**/api/v1/chat', (route) => {
    lengths.push(route.request().postDataJSON().history.length);
    return route.fulfill({
      json: {
        success: true,
        data: {
          answer: `답변 ${lengths.length}`,
          isLegalQuestion: false,
          remainingQuestions: null,
        },
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('.remaining')).toHaveCount(0);
  for (let index = 0; index < 12; index++) {
    await page.getByRole('textbox', { name: '법률 질문' }).fill(`질문 ${index + 1}`);
    await page.getByRole('button', { name: '질문 보내기' }).click();
    await expect(page.locator('.assistant-body > p').last()).toHaveText(`답변 ${index + 1}`);
  }
  expect(lengths).toHaveLength(12);
  expect(lengths[11]).toBe(10);
  await expect(page.getByRole('textbox', { name: '법률 질문' })).toBeEnabled();
  await expect(page.locator('.remaining')).toHaveCount(0);
});

test('pending question appears immediately, reply follows and history is sent', async ({
  page,
}) => {
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const requests: { question: string; history: unknown[] }[] = [];
  await page.route('**/api/v1/chat', async (route) => {
    requests.push(route.request().postDataJSON());
    await pending;
    await route.fulfill({ json: { success: true, data: { answer: '첫 답변\n다음 줄' } } });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: '법률 질문' }).fill('첫 질문');
  await page.getByRole('textbox', { name: '법률 질문' }).press('Enter');
  await expect(page.getByRole('textbox', { name: '법률 질문' })).toHaveValue('');
  await expect(page.locator('.user-message')).toHaveText('첫 질문');
  await expect(page.getByText('AI가 답변을 준비하고 있어요…')).toBeVisible();
  await expect(page.getByRole('button', { name: '질문 보내기' })).toBeDisabled();
  finish();
  await expect(page.locator('.assistant-body > p')).toHaveText('첫 답변\n다음 줄');
  await expect(page.getByRole('textbox', { name: '법률 질문' })).toHaveValue('');
  await page.getByRole('textbox', { name: '법률 질문' }).fill('후속 질문');
  await page.getByRole('button', { name: '질문 보내기' }).click();
  await expect(page.locator('.assistant-body > p').last()).toHaveText('첫 답변\n다음 줄');
  expect(requests[1]).toEqual({
    question: '후속 질문',
    history: [{ question: '첫 질문', answer: '첫 답변\n다음 줄' }],
  });
});

test('failed answer restores question for retry and does not consume quota', async ({ page }) => {
  await page.route('**/api/v1/chat', (route) =>
    route.fulfill({
      status: 503,
      json: {
        success: false,
        error: { code: 'AI_NOT_CONFIGURED', message: 'AI 연결 설정이 필요해요.' },
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('textbox', { name: '법률 질문' }).fill('다시 보낼 질문');
  await page.getByRole('button', { name: '질문 보내기' }).click();
  await expect(page.getByRole('alert')).toHaveText('AI 연결 설정이 필요해요.');
  await expect(page.getByRole('textbox', { name: '법률 질문' })).toHaveValue('다시 보낼 질문');
  await expect(page.locator('.remaining b')).toHaveText('3');
  await expect(
    page.getByRole('button', { name: '변호사에게 검증 요청', exact: true }),
  ).toBeHidden();
  await page.route('**/api/v1/chat', (route) =>
    route.fulfill({ json: { success: true, data: { answer: '재시도 성공' } } }),
  );
  await page.getByRole('button', { name: '질문 보내기' }).click();
  await expect(page.getByText('재시도 성공')).toBeVisible();
});

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/config', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          officeName: '법률사무소 IBS',
          mode: 'prototype',
          maxQuestions: 3,
          questionLimitEnabled: true,
          remainingQuestions: 3,
        },
      },
    }),
  );
  await page.route('**/api/v1/chat/session', (route) => route.fulfill({ json: { success: true } }));
  await page.route('**/api/v1/chat', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: { answer: '질문에 대한 GPT 테스트 답변입니다.', isLegalQuestion: true },
      },
    }),
  );
});

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
  await expect(page.getByText('질문에 대한 GPT 테스트 답변입니다.', { exact: true })).toBeVisible();
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

test('guide dismisses with Escape; questions are sent to the chat API', async ({ page }) => {
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
  await expect(page.getByText('질문에 대한 GPT 테스트 답변입니다.', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toContain('/api/v1/chat');
});

test('three questions exhaust the session; only legal answers offer verification', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/v1/chat', (route) => {
    calls++;
    return route.fulfill({
      json: { success: true, data: { answer: `답변 ${calls}`, isLegalQuestion: calls === 2 } },
    });
  });
  await page.goto('/');
  await expect(page.locator('.remaining')).toHaveText('남은 질문 3 / 3');
  for (const [index, question] of [
    '오늘 날씨는?',
    '보증금을 못 받았어요.',
    '점심 메뉴 추천해 줘',
  ].entries()) {
    await page.getByRole('textbox', { name: '법률 질문' }).fill(question);
    await page.getByRole('button', { name: '질문 보내기' }).click();
    await expect(page.locator('.assistant-body > p').last()).toHaveText(`답변 ${index + 1}`);
    await expect(page.locator('.remaining b')).toHaveText(String(2 - index));
    await expect(page.locator('.turn').nth(index).locator('.verify-button')).toHaveCount(
      index === 1 ? 1 : 0,
    );
  }
  await expect(page.getByRole('textbox', { name: '법률 질문' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '질문 보내기' })).toBeDisabled();
  expect(calls).toBe(3);
  if (await page.getByRole('button', { name: '메뉴 열기' }).isVisible())
    await page.getByRole('button', { name: '메뉴 열기' }).click();
  await page.getByRole('button', { name: '새로운 질문 시작하기' }).click();
  await page.getByRole('button', { name: '새 대화 시작', exact: true }).click();
  await expect(page.locator('.remaining b')).toHaveText('3');
  await expect(page.getByRole('textbox', { name: '법률 질문' })).toBeEnabled();
});
