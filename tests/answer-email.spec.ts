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

test('email link reads its answer on a new browser and reports expired links', async ({ page }) => {
  const token = 'a'.repeat(64);
  let expired = false;
  await page.route('**/api/v1/review-answer/**', async (route) => {
    expect(new URL(route.request().url()).pathname).toBe(`/api/v1/review-answer/${token}`);
    await route.fulfill(
      expired
        ? {
            status: 404,
            json: {
              success: false,
              error: { message: '답변 링크가 유효하지 않거나 만료되었습니다.' },
            },
          }
        : {
            json: {
              success: true,
              data: {
                question: '등록한 질문 원문',
                reply: '전문가 답변 전문\n두 번째 줄',
                author: '홍전문',
                completedAt: '2026-10-04T01:00:00Z',
              },
            },
          },
    );
  });
  await page.goto(`http://127.0.0.1:5173/#answer=${token}`);
  await expect(page.getByRole('heading', { name: '전문가 답변', exact: true })).toBeVisible();
  await expect(page.getByText('전문가 답변 전문\n두 번째 줄')).toBeVisible();
  await expect(page.getByRole('heading', { name: '홍전문님의 답변' })).toBeVisible();
  expired = true;
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('만료되었습니다');
});
