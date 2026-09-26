import { test, expect } from '@playwright/test';
import {
  questionTopics,
  type AdminQuestion,
  type AdminQuestionsPage,
  type AdminQuestionStatistics,
} from '@lawcheck/contracts';

test.use({ baseURL: 'http://127.0.0.1:5175' });

test('admin question menus show full answers, filter periods, paginate and display topic statistics', async ({
  page,
}, testInfo) => {
  const stamp = '2026-01-01T01:00:00Z';
  const question: AdminQuestion = {
    id: 'question-1',
    content: '집주인이 보증금을 돌려주지 않아요.\n계약 종료 후 어떻게 해야 하나요?',
    createdAt: stamp,
    processingStatus: 'COMPLETED',
    topic: 'realEstate',
    answers: [
      {
        id: 'answer-1',
        content: '계약 종료와 반환 요청 내역을 확인하세요.\n필요한 서류를 정리해 주세요.',
        kind: 'AI',
        author: 'AI QAVER',
        createdAt: stamp,
      },
      {
        id: 'expert-1',
        content: '계약서와 반환 요청 기록을 보관해 주세요.',
        kind: 'EXPERT',
        author: '김전문',
        createdAt: stamp,
      },
      {
        id: 'expert-2',
        content: '추가로 반환 약정 내용을 확인해 주세요.',
        kind: 'EXPERT',
        author: '이전문',
        createdAt: stamp,
      },
    ],
  };
  let fail = false;
  const requested: URL[] = [];
  await page.route('**/api/v1/admin/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/me'))
      return route.fulfill({
        json: {
          success: true,
          data: { id: 'admin', name: '운영 관리자', email: 'admin@example.com', username: 'admin' },
        },
      });
    requested.push(url);
    if (fail)
      return route.fulfill({
        status: 503,
        json: { error: { message: '조회에 실패했습니다. 다시 시도해 주세요.' } },
      });
    const year = url.searchParams.get('year');
    const period = {
      startDate: year ? `${year}-01-01` : url.searchParams.get('startDate')!,
      endDate: year ? `${year}-12-31` : url.searchParams.get('endDate')!,
    };
    const empty = year === '2024';
    let data: AdminQuestionsPage | AdminQuestionStatistics;
    if (url.pathname.endsWith('/questions')) {
      const currentPage = Number(url.searchParams.get('page'));
      data = {
        ...period,
        total: empty ? 0 : 21,
        page: currentPage,
        pageSize: 20,
        items: empty
          ? []
          : currentPage === 1
            ? [question]
            : [
                {
                  ...question,
                  id: 'question-21',
                  content: '답변을 기다리는 질문',
                  answers: [],
                  processingStatus: 'FAILED',
                  topic: 'other',
                },
              ],
      };
    } else if (url.pathname.endsWith('/question-statistics')) {
      data = {
        ...period,
        total: empty ? 0 : 21,
        topics: questionTopics.map(({ code }) => ({
          topic: code,
          count: empty ? 0 : code === 'realEstate' ? 20 : code === 'other' ? 1 : 0,
          percentage: empty ? 0 : code === 'realEstate' ? 95.2 : code === 'other' ? 4.8 : 0,
        })),
      };
    } else throw new Error(`Unexpected request ${url.pathname}`);
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/#questions');
  await expect(page.getByRole('navigation', { name: '관리자 메뉴' }).getByRole('link')).toHaveText([
    '운영 요약',
    '질문현황',
    '통계',
    '사용자 관리',
    '공통코드 관리',
    'BO 메뉴 관리',
  ]);
  await expect(page.getByRole('heading', { name: '질문현황', exact: true })).toBeVisible();
  await expect(page.getByText(question.content)).toBeVisible();
  for (const answer of question.answers) await expect(page.getByText(answer.content)).toBeVisible();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByText('답변 생성에 실패하여 저장된 답변이 없습니다.')).toBeVisible();
  await expect(page.getByText('2 / 2 페이지')).toBeVisible();
  await page.getByLabel('조회 기준').selectOption('dates');
  await page.getByLabel('시작일', { exact: true }).fill('2026-01-02');
  await page.getByLabel('종료일', { exact: true }).fill('2026-01-01');
  await page.getByRole('button', { name: '조회', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('시작일은 종료일보다 늦을 수 없습니다.');
  await page.getByLabel('시작일', { exact: true }).fill('2025-12-31');
  await page.getByRole('button', { name: '조회', exact: true }).click();
  await expect(page.getByText('1 / 2 페이지')).toBeVisible();
  expect(requested.at(-1)?.searchParams.get('startDate')).toBe('2025-12-31');
  expect(requested.at(-1)?.searchParams.get('endDate')).toBe('2026-01-01');
  expect(requested.at(-1)?.searchParams.has('year')).toBe(false);
  await expect(
    page.getByText('2025-12-31 ~ 2026-01-01 · 질문 접수일 · 한국 시간 기준'),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('admin-questions.png'), fullPage: true });
  fail = true;
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('조회에 실패');
  await expect(page.getByText('전체 질문 0건')).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await expect(page.getByText(question.content)).toBeVisible();
  await page.getByRole('link', { name: '통계', exact: true }).click();
  await expect(page).toHaveURL(/#statistics$/);
  await expect(page.getByRole('heading', { name: '주제별 질문 통계' })).toBeVisible();
  const estateRow = page
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: '부동산·임대차' }) });
  await expect(estateRow).toContainText('20건');
  await expect(estateRow).toContainText('95.2%');
  await page.getByLabel('조회 기준').selectOption('dates');
  await page.getByLabel('시작일', { exact: true }).fill('2026-01-01');
  await page.getByLabel('종료일', { exact: true }).fill('2026-06-30');
  await page.getByRole('button', { name: '조회', exact: true }).click();
  await expect(
    page.getByText('2026-01-01 ~ 2026-06-30 · 질문 접수일 · 한국 시간 기준'),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('admin-question-statistics.png'),
    fullPage: true,
  });
  await page.getByLabel('조회 기준').selectOption('year');
  await page.getByLabel('년도', { exact: true }).fill('2024');
  await page.getByRole('button', { name: '조회', exact: true }).click();
  await expect(page.getByText('전체 질문 0건')).toBeVisible();
  await expect(page.getByText('조회 기간에 접수된 질문이 없습니다.')).toBeVisible();
  await expect(
    page.getByText('2024-01-01 ~ 2024-12-31 · 질문 접수일 · 한국 시간 기준'),
  ).toBeVisible();
  await page.getByRole('link', { name: '질문현황', exact: true }).click();
  await page.getByLabel('년도', { exact: true }).fill('2024');
  await page.getByRole('button', { name: '조회', exact: true }).click();
  await expect(page.getByText('조회 기간에 접수된 질문이 없습니다.')).toBeVisible();
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeDisabled();
});

for (const section of ['questions', 'statistics']) {
  test(`${section} returns to login on expired admin authorization`, async ({ page }) => {
    await page.route('**/api/v1/admin/**', (route) =>
      route.fulfill(
        new URL(route.request().url()).pathname.endsWith('/me')
          ? {
              json: { success: true, data: { id: 'admin', name: '운영 관리자' } },
            }
          : { status: 403, json: { error: { message: '활성화된 관리자 권한이 필요합니다.' } } },
      ),
    );
    await page.goto(`/#${section}`);
    await expect(page.getByRole('heading', { name: '관리자 로그인', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('활성화된 관리자');
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
  });
}
