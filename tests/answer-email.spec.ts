import { test, expect } from '@playwright/test';
import type { AdminEmailDetail } from '@lawcheck/contracts';

test('admin email history searches, shows attempts, retries failure and recovers errors', async ({
  page,
}) => {
  const delivery: AdminEmailDetail = {
    id: '00000000-0000-4000-8000-000000000001',
    contributionId: '00000000-0000-4000-8000-000000000002',
    recipient: 'questioner@example.com',
    subject: '[AI QAVER] 질문에 전문가 답변이 등록되었습니다',
    status: 'FAILED',
    attemptCount: 5,
    version: 6,
    lastErrorCode: 'CONNECTION',
    createdAt: '2026-10-04T01:00:00Z',
    sentAt: null,
    nextAttemptAt: '2026-10-04T01:00:00Z',
    body: '질문\n임대차 질문\n답변\n전문가 답변 전문\n답변 확인 링크\nhttps://search.aiqaver.com/#answer=token',
    linkExpiresAt: '2026-11-03T01:00:00Z',
    attempts: [
      {
        id: 'attempt',
        attemptNo: 5,
        status: 'FAILED',
        errorCode: 'CONNECTION',
        startedAt: '2026-10-04T01:00:00Z',
        finishedAt: '2026-10-04T01:00:01Z',
      },
    ],
  };
  let fail = false;
  await page.route('**/api/v1/admin/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown;
    if (url.pathname.endsWith('/me'))
      data = { id: 'admin', name: '관리자', email: 'admin@example.com', username: 'admin' };
    else if (url.pathname.endsWith('/retry')) {
      expect(route.request().postDataJSON()).toEqual({ version: 6 });
      delivery.status = 'QUEUED';
      delivery.version++;
      data = {};
    } else if (url.pathname.endsWith(`/${delivery.id}`)) data = delivery;
    else {
      if (fail) {
        await route.fulfill({
          status: 500,
          json: { success: false, error: { message: '이력 조회 실패' } },
        });
        return;
      }
      data = {
        items: url.searchParams.get('q') === '없는주소' ? [] : [delivery],
        total: url.searchParams.get('q') === '없는주소' ? 0 : 1,
        page: 1,
        pageSize: 20,
      };
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('http://127.0.0.1:5175/#emails');
  await expect(page.getByRole('heading', { name: '이메일 발송이력', exact: true })).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'questioner@example.com', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'questioner@example.com 발송 상세' }).click();
  await expect(page.getByRole('heading', { name: '이메일 발송 상세' })).toBeVisible();
  await expect(page.locator('.admin-email-body')).toContainText('전문가 답변 전문');
  await expect(page.getByRole('cell', { name: 'CONNECTION' })).toBeVisible();
  await page.getByRole('button', { name: '재발송 요청', exact: true }).click();
  await expect(page.getByRole('definition').filter({ hasText: '발송 대기' })).toBeVisible();
  await page.getByRole('button', { name: '목록으로' }).click();
  await page.getByLabel('검색어').fill('없는주소');
  await page.getByRole('button', { name: '조회', exact: true }).click();
  await expect(page.getByText('조회 조건에 해당하는 발송 이력이 없습니다.')).toBeVisible();
  fail = true;
  await page.getByRole('button', { name: '새로고침' }).click();
  await expect(page.getByRole('alert')).toContainText('이력 조회 실패');
  fail = false;
  await page.getByRole('button', { name: '새로고침' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('email link restores the question screen, expert replies and further questions on a new browser', async ({
  page,
}) => {
  const token = 'a'.repeat(64),
    sessionId = '00000000-0000-4000-8000-000000000012';
  const history = {
    sessionId,
    remainingQuestions: null,
    messages: [
      {
        id: 'question',
        parentMessageId: null,
        role: 'USER',
        content: '등록한 질문 원문',
        messageType: 'USER_QUESTION',
        processingStatus: 'COMPLETED',
      },
      {
        id: 'answer',
        parentMessageId: 'question',
        role: 'ASSISTANT',
        content: '이전 AI 답변',
        messageType: 'AI_ANSWER',
        processingStatus: 'COMPLETED',
      },
    ],
  };
  let restored = false;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if (path === `/api/v1/review-answer/${token}/restore`) {
      expect(route.request().method()).toBe('POST');
      restored = true;
      data = { sessionId };
    } else if (path === '/api/v1/config')
      data = {
        officeName: 'Test',
        mode: 'prototype',
        questionLimitEnabled: false,
        remainingQuestions: null,
        maxQuestions: 3,
        voiceInputEnabled: false,
      };
    else if (path.endsWith('/select')) {
      expect(restored).toBe(true);
      data = history;
    } else if (path === '/api/v1/chat/conversations')
      data = [{ id: sessionId, title: '등록한 질문 원문', updatedAt: '2026-10-04T01:00:00Z' }];
    else if (path === '/api/v1/reviews')
      data = [
        {
          id: 'review',
          sessionId,
          answerMessageId: 'answer',
          question: '등록한 질문 원문',
          selectedAnswerId: null,
          answers: [
            {
              id: 'expert-answer',
              reply: '전문가 답변 전문',
              unread: true,
              completedAt: '2026-10-04T01:00:00Z',
              expert: { name: '홍전문' },
            },
          ],
        },
      ];
    else if (path === '/api/v1/chat') {
      expect(route.request().postDataJSON().sessionId).toBe(sessionId);
      data = {
        answer: '추가 질문의 답변',
        isLegalQuestion: true,
        sessionId,
        questionMessageId: 'new-question',
        answerMessageId: 'new-answer',
      };
    } else data = {};
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto(`/#answer=${token}`);
  await expect(page.getByText('메일 링크의 질문과 답변을 복원했습니다.')).toBeVisible();
  await expect(page.locator('.user-message')).toContainText('등록한 질문 원문');
  await expect(page.locator('.assistant-body')).toContainText('이전 AI 답변');
  expect(page.url()).not.toContain(token);
  await page.getByRole('button', { name: '전문가 답변 보기', exact: true }).click();
  await expect(page.getByText('전문가 답변 전문', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('textbox', { name: '질문', exact: true }).fill('이어지는 질문');
  await page.getByRole('button', { name: '질문 보내기', exact: true }).click();
  await expect(page.locator('.assistant-body').last()).toContainText('추가 질문의 답변');
});

test('expired email links do not open another conversation', async ({ page }) => {
  await page.route('**/api/v1/review-answer/**', (route) =>
    route.fulfill({
      status: 404,
      json: { success: false, error: { message: '답변 링크가 유효하지 않거나 만료되었습니다.' } },
    }),
  );
  await page.goto(`/#answer=${'a'.repeat(64)}`);
  await expect(page.getByRole('alert')).toContainText('만료되었습니다');
  await expect(page.getByRole('textbox', { name: '질문', exact: true })).toHaveCount(0);
});
