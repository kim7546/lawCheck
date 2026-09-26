import { test, expect, type Locator } from '@playwright/test';
import { boMenus } from './bo-menus.fixture';

async function touch(
  target: Locator,
  type: string,
  points: {
    touches: { clientX: number; clientY: number }[];
    changedTouches?: { clientX: number; clientY: number }[];
  },
) {
  await target.evaluate(
    (element, { type, points }) => {
      element.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), points));
    },
    { type, points },
  );
}

test('Free dashboard opens latest requests and community supports posting and replies', async ({
  page,
}, testInfo) => {
  const author = { id: 'user-1', name: '작성자', email: 'test@example.com', plan: 'FREE' };
  const posts = [
    {
      id: 'community-1',
      title: '함께 나누는 검증 경험',
      content: '게시글 본문입니다.',
      author,
      createdAt: '2026-09-25T00:00:00Z',
      _count: { replies: 0 },
      replies: [] as { id: string; content: string; author: typeof author; createdAt: string }[],
      page: 1,
    },
  ];
  const reviews = Array.from({ length: 5 }, (_, i) => ({
    id: `review-${i}`,
    question: `최신 검증요청 ${i + 1}`,
    status: 'REQUESTED',
    createdAt: '2026-09-25T00:00:00Z',
  }));
  let failReply = true;
  await page.route('**/api/v1/bo/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let data: unknown;
    if (path.endsWith('/me')) data = author;
    else if (path.endsWith('/menus')) data = boMenus;
    else if (path.endsWith('/dashboard'))
      data = {
        reviewCount: 7,
        communityCount: posts.length,
        reviews,
        bestPosts: posts.slice(0, 5),
      };
    else if (path.endsWith('/replies')) {
      if (failReply) {
        failReply = false;
        return route.fulfill({
          status: 503,
          json: { error: { message: '저장 실패. 다시 시도해 주세요.' } },
        });
      }
      const post = posts.find((p) => path.includes(`/${p.id}/`))!;
      post.replies.push({
        id: 'reply-1',
        content: route.request().postDataJSON().content,
        author,
        createdAt: post.createdAt,
      });
      post._count.replies++;
      data = { id: 'reply-1' };
    } else if (path.endsWith('/community') && method === 'POST') {
      const body = route.request().postDataJSON();
      const post = {
        ...posts[0]!,
        id: 'community-2',
        title: body.title,
        content: body.content,
        _count: { replies: 0 },
        replies: [],
      };
      posts.unshift(post);
      data = { id: post.id };
    } else if (path.endsWith('/community')) data = { items: posts, page: 1, total: posts.length };
    else if (path.includes('/community/')) data = posts.find((p) => path.endsWith(`/${p.id}`));
    else if (path.endsWith('/reviews')) data = { items: reviews, page: 1, total: 7 };
    else data = { ...reviews[0], aiAnswer: '검증 대상 AI 답변', reply: null, completedAt: null };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('http://127.0.0.1:5174');
  await expect(page.getByRole('heading', { name: '대시보드', exact: true })).toBeVisible();
  await expect(page.getByText('FREE', { exact: true })).toBeVisible();
  await expect(page.locator('.dashboard-panel').first().locator('.board-row')).toHaveCount(5);
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
  await page.getByRole('button', { name: /최신 검증요청 1/ }).click();
  await expect(page.getByText('검증 대상 AI 답변')).toBeVisible();
  await expect(page.getByRole('button', { name: /목록으로/ })).toHaveCount(2);
  await page
    .getByRole('button', { name: /목록으로/ })
    .last()
    .click();
  await expect(page.getByRole('heading', { name: '검증 요청 게시판' })).toBeVisible();
  await page.getByRole('button', { name: /최신 검증요청 1/ }).click();
  if (testInfo.project.name === 'mobile') {
    const detail = page.locator('.board-detail');
    await touch(detail, 'touchstart', { touches: [{ clientX: 30, clientY: 200 }] });
    await touch(detail, 'touchend', {
      touches: [],
      changedTouches: [{ clientX: 200, clientY: 210 }],
    });
    await expect(page.getByRole('heading', { name: '검증 요청 게시판' })).toBeVisible();
  }
  await page.getByRole('button', { name: '대시보드', exact: true }).click();
  await page.getByRole('button', { name: /함께 나누는 검증 경험/ }).click();
  await expect(page.getByText('게시글 본문입니다.')).toBeVisible();
  await expect(page.getByRole('button', { name: /목록으로/ })).toHaveCount(2);
  await page
    .getByRole('button', { name: /목록으로/ })
    .last()
    .click();
  await page.getByRole('button', { name: '글쓰기', exact: true }).click();
  await page.getByLabel('제목', { exact: true }).fill('새 커뮤니티 글');
  await page.getByLabel('내용', { exact: true }).fill('경험을 공유합니다.');
  await page.getByRole('button', { name: '게시글 등록' }).click();
  await expect(page.getByRole('heading', { name: '새 커뮤니티 글' })).toBeVisible();
  await page.getByLabel('답글 작성').fill('도움이 되었습니다.');
  await page.getByRole('button', { name: '답글 등록' }).click();
  await expect(page.getByRole('alert')).toContainText('저장 실패');
  await expect(page.getByLabel('답글 작성')).toHaveValue('도움이 되었습니다.');
  await page.getByRole('button', { name: '답글 등록' }).click();
  await expect(page.getByRole('heading', { name: '답글 1개' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('도움이 되었습니다.', { exact: true })).toBeVisible();
  if (testInfo.project.name === 'mobile') {
    const detail = page.locator('.board-detail');
    // Vertical scrolling and gestures in the reply editor must keep the detail open.
    await touch(detail, 'touchstart', { touches: [{ clientX: 30, clientY: 200 }] });
    await touch(detail, 'touchmove', { touches: [{ clientX: 40, clientY: 300 }] });
    await touch(detail, 'touchend', {
      touches: [],
      changedTouches: [{ clientX: 200, clientY: 210 }],
    });
    await expect(detail).toBeVisible();
    const editor = page.getByLabel('답글 작성');
    await touch(editor, 'touchstart', { touches: [{ clientX: 30, clientY: 200 }] });
    await touch(editor, 'touchend', {
      touches: [],
      changedTouches: [{ clientX: 200, clientY: 210 }],
    });
    await expect(detail).toBeVisible();
    await touch(detail, 'touchstart', { touches: [{ clientX: 30, clientY: 200 }] });
    await touch(detail, 'touchend', {
      touches: [],
      changedTouches: [{ clientX: 200, clientY: 210 }],
    });
    await expect(page.getByRole('button', { name: '글쓰기', exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('community.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: '대시보드', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /새 커뮤니티 글/ }).click();
  await expect(page.getByText('도움이 되었습니다.', { exact: true })).toBeVisible();
});
