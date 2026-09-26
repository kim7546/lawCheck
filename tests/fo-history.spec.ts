import { test, expect } from '@playwright/test';

test('brand logo starts a new conversation, preserves history and keeps review notifications', async ({
  page,
  isMobile,
}, testInfo) => {
  test.setTimeout(60000);
  type Message = {
    id: string;
    role: string;
    parentMessageId: string | null;
    messageType: string;
    content: string;
    processingStatus: string;
  };
  const firstId = '00000000-0000-4000-8000-000000000001';
  const secondId = '00000000-0000-4000-8000-000000000002';
  let active = firstId;
  const chats = new Map<string, Message[]>([
    [firstId, []],
    [secondId, []],
  ]);
  const review = {
    id: 'review-1',
    sessionId: firstId,
    answerMessageId: 'answer-1',
    question: '보증금을 돌려받고 싶어요.',
    selectedAnswerId: null as string | null,
    answers: [] as {
      id: string;
      reply: string;
      unread: boolean;
      expert: { name: string };
      completedAt: string;
    }[],
  };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if (path.endsWith('/config'))
      data = { mode: 'prototype', maxQuestions: 3, questionLimitEnabled: false };
    else if (path.endsWith('/chat/history'))
      data = { sessionId: active, messages: chats.get(active) };
    else if (path.endsWith('/chat/conversations'))
      data = [...chats.entries()]
        .filter(([, messages]) => messages.length)
        .map(([id, messages]) => ({
          id,
          title: messages[0]?.content,
          updatedAt: new Date().toISOString(),
        }));
    else if (path.endsWith('/chat/session')) {
      active = secondId;
      data = { sessionId: active };
    } else if (path.endsWith('/select')) {
      active = path.split('/').at(-2)!;
      data = { sessionId: active, messages: chats.get(active) };
    } else if (path.endsWith('/chat')) {
      const body = route.request().postDataJSON();
      const messages = chats.get(body.sessionId)!;
      const questionId = `q-${messages.length}`;
      messages.push({
        id: questionId,
        role: 'USER',
        parentMessageId: null,
        messageType: 'USER_QUESTION',
        content: body.question,
        processingStatus: 'COMPLETED',
      });
      messages.push({
        id: `a-${messages.length}`,
        role: 'ASSISTANT',
        parentMessageId: questionId,
        messageType: 'AI_ANSWER',
        content: `AI 답변: ${body.question}`,
        processingStatus: 'COMPLETED',
      });
      data = {
        answer: `AI 답변: ${body.question}`,
        isLegalQuestion: true,
        sessionId: body.sessionId,
        answerMessageId: messages.at(-1)?.id,
      };
    } else if (path.endsWith('/read')) {
      const ids: string[] = route.request().postDataJSON().answerIds;
      review.answers.forEach((answer) => {
        if (ids.includes(answer.id)) answer.unread = false;
      });
    } else if (path.endsWith('/reviews')) data = review.answers.length ? [review] : [];
    await route.fulfill({ json: { success: true, data } });
  });
  if (isMobile) {
    // A desktop collapse preference must not change the visible mobile logo's action.
    await page.addInitScript(() => localStorage.setItem('aiqaver.sidebar.collapsed', 'true'));
  }
  await page.goto('/');
  await page.getByRole('textbox', { name: '질문', exact: true }).fill(review.question);
  await page.getByRole('button', { name: '질문 보내기' }).click();
  await expect(page.locator('.assistant-body > p')).toHaveText(`AI 답변: ${review.question}`);
  const draft = page.getByRole('textbox', { name: '질문', exact: true });
  await draft.fill('새 대화로 이동하면 지울 작성 중 질문');
  if (isMobile) await page.getByRole('button', { name: '대화 메뉴 열기', exact: true }).click();
  await page.locator('.brand-logo').click();
  await expect(page.getByRole('heading', { name: /법률이 궁금할 때/ })).toBeVisible();
  await expect(page.locator('.assistant-body')).toHaveCount(0);
  await expect(draft).toHaveValue('');
  await expect(draft).toBeFocused();
  expect(active).toBe(secondId);
  await page.getByRole('textbox', { name: '질문', exact: true }).fill('퇴직금을 계산하고 싶어요.');
  await page.getByRole('button', { name: '질문 보내기' }).click();
  await expect(page.locator('.assistant-body > p')).toContainText('퇴직금을 계산');
  await page.reload();
  await expect(page.locator('.assistant-body > p')).toContainText('퇴직금을 계산');
  const menu = page.getByRole('button', { name: '대화 메뉴 열기' });
  if (await menu.isVisible()) await menu.click();
  await expect(page.locator('.history-row')).toHaveCount(2);
  await page.getByRole('button', { name: review.question, exact: true }).click();
  await expect(page.locator('.assistant-body > p')).toHaveText(`AI 답변: ${review.question}`);
  review.answers.push(
    ...['첫 번째 검증 답변', '두 번째 검증 답변'].map((reply, index) => ({
      id: `review-answer-${index}`,
      reply,
      unread: true,
      expert: { name: `답변자 ${index + 1}` },
      completedAt: new Date().toISOString(),
    })),
  );
  // A completed review must appear through polling without reload or a focus event.
  await expect(page.getByRole('button', { name: '검증 알림 2개' })).toBeVisible({ timeout: 35000 });
  if (await menu.isVisible()) await menu.click();
  const badge = page.getByRole('button', { name: `${review.question} 검증 결과 새 답변 2개` });
  await expect(badge).toHaveCSS('background-color', 'rgb(233, 75, 83)');
  await page.screenshot({ path: testInfo.outputPath('sidebar-notifications.png'), fullPage: true });
  await badge.click();
  const modal = page.getByRole('dialog', { name: '검증 답변', exact: true });
  await expect(modal.getByText('첫 번째 검증 답변', { exact: true })).toBeVisible();
  await expect(modal.getByText('두 번째 검증 답변', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '검증 알림 0개' })).toBeAttached();
  await modal.screenshot({ path: testInfo.outputPath('review-modal.png') });
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.assistant-body > p')).toHaveText(`AI 답변: ${review.question}`);
  await expect(page.getByRole('button', { name: '검증 알림 0개' })).toBeVisible();
  review.answers.push({
    id: 'late-answer',
    reply: '새롭게 도착한 검증 답변',
    unread: true,
    expert: { name: '답변자 3' },
    completedAt: new Date().toISOString(),
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: '검증 알림 1개' })).toBeVisible();
  await page.getByRole('button', { name: '검증 알림 1개' }).click();
  await expect(modal.getByText('새롭게 도착한 검증 답변')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
