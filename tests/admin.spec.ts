import { test, expect } from '@playwright/test';
import type { AdminSummary, AdminUser, CommonCodeRecord } from '@lawcheck/contracts';
import { boMenus } from './bo-menus.fixture';

test.use({ baseURL: 'http://127.0.0.1:5175' });

test('admin login, summary, member roles, codes and menu changes persist across pages', async ({
  page,
}, testInfo) => {
  let authenticated = false;
  let failSummary = false;
  let conflict = false;
  const stamp = '2026-09-26T01:00:00.000Z';
  const actor = {
    id: 'admin-1',
    name: '운영 관리자',
    username: 'admin',
    email: 'admin@example.com',
  };
  const member: AdminUser = {
    id: 'member-1',
    name: '김전문',
    username: 'expert',
    email: 'expert@example.com',
    expertGroup: 'LAWYER',
    expertCode: { name: '변호사' },
    lawyerProfile: { officeName: '서울 법률사무소' },
    adminProfile: null,
    plan: 'FREE',
    planCode: { name: 'Free' },
    isActive: true,
    createdAt: stamp,
    updatedAt: stamp,
  };
  const record = (code: string, name: string): CommonCodeRecord => ({
    code,
    name,
    description: '',
    sortOrder: 10,
    isActive: true,
    updatedAt: stamp,
  });
  const groups = [record('EXPERT_GROUP', '전문가 그룹'), record('PLAN', '요금제')];
  const codes = {
    EXPERT_GROUP: [record('LAWYER', '변호사')],
    PLAN: [record('FREE', 'Free'), record('PRO', 'Pro')],
  };
  const menus = structuredClone(boMenus);
  const summary: AdminSummary = {
    days: 30,
    since: '2026-08-28T15:00:00Z',
    generatedAt: stamp,
    questions: 120,
    requests: 40,
    verified: 30,
    waiting: 6,
    reviewing: 4,
    overdue: 2,
    completedAnswers: 45,
    selectedAnswers: 15,
    completionRate: 75,
    selectionRate: 50,
    averageHours: 3.5,
    activeExperts: 6,
    daily: [
      { date: '2026-09-25', questions: 40, requests: 10, verified: 8 },
      { date: '2026-09-26', questions: 80, requests: 30, verified: 22 },
    ],
    experts: [
      {
        id: member.id,
        name: member.name,
        group: '변호사',
        reviewing: 2,
        completed: 10,
        selected: 5,
      },
    ],
  };
  await page.route('**/api/v1/admin/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1/admin', '');
    const post = route.request().method() === 'POST';
    const body = post ? route.request().postDataJSON() : null;
    if (path === '/login') {
      if (body.password !== 'test-password-123')
        return route.fulfill({
          status: 401,
          json: { error: { message: '관리자 계정 또는 비밀번호를 확인해 주세요.' } },
        });
      authenticated = true;
      return route.fulfill({ json: { success: true, data: actor } });
    }
    if (!authenticated)
      return route.fulfill({
        status: 401,
        json: { error: { message: '관리자 로그인이 필요합니다.' } },
      });
    let data: unknown;
    if (path === '/me') data = actor;
    else if (path === '/logout') authenticated = false;
    else if (path === '/summary') {
      if (failSummary)
        return route.fulfill({ status: 503, json: { error: { message: '집계에 실패했습니다.' } } });
      data = { ...summary, days: Number(url.searchParams.get('days')) };
    } else if (path === '/users')
      data = {
        page: Number(url.searchParams.get('page')),
        total: url.searchParams.get('search') === '없음' ? 0 : 1,
        items: url.searchParams.get('search') === '없음' ? [] : [member],
      };
    else if (path === `/users/${member.id}`) {
      if (conflict) {
        conflict = false;
        return route.fulfill({
          status: 409,
          json: {
            error: { message: '다른 관리자가 수정했습니다. 새로고침 후 다시 시도해 주세요.' },
          },
        });
      }
      expect(body.updatedAt).toBe(member.updatedAt);
      Object.assign(member, {
        name: body.name,
        plan: body.plan,
        isActive: body.isActive,
        adminProfile: { isActive: body.isAdmin },
        updatedAt: new Date().toISOString(),
        planCode: { name: body.plan === 'PRO' ? 'Pro' : 'Free' },
      });
      data = member;
    } else if (path === '/code-groups') data = groups;
    else if (path === '/code-groups/EXPERT_GROUP/details') data = codes.EXPERT_GROUP;
    else if (path === '/code-groups/PLAN/details') data = codes.PLAN;
    else if (path === '/code-groups/PLAN/details/FREE') {
      Object.assign(codes.PLAN[0]!, body);
      data = codes.PLAN[0];
    } else if (path === '/menus') data = menus;
    else if (path.startsWith('/menus/')) {
      const menu = menus.find((m) => path.endsWith(`/${m.key}`))!;
      Object.assign(menu, body, { updatedAt: new Date().toISOString() });
      data = menu;
    } else throw new Error(`Unexpected admin request: ${path}`);
    return route.fulfill({ json: { success: true, data } });
  });
  await page.route('**/api/v1/bo/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/me')
      ? { ...actor, plan: 'FREE' }
      : path.endsWith('/menus')
        ? menus
            .filter((m) => m.isActive && m.key !== 'codes')
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : { reviews: [], bestPosts: [], reviewCount: 0, communityCount: 0 };
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/admin');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.getByRole('link', { name: /AI QAVER로 돌아가기/ })).toHaveAttribute(
    'href',
    'http://127.0.0.1:5173',
  );
  await page.getByLabel('아이디 또는 이메일').fill('admin');
  await page.getByLabel('비밀번호', { exact: true }).fill('wrong-password-123');
  await page.getByRole('button', { name: '관리자 로그인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('관리자 계정');
  await page.getByLabel('비밀번호', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: '관리자 로그인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '운영 요약' })).toBeVisible();
  await expect(page.locator('.admin-stat').filter({ hasText: '접수 질문' })).toContainText('120');
  await expect(page.locator('.admin-stat').filter({ hasText: '검증 완료율' })).toContainText('75%');
  await page.getByRole('button', { name: '최근 7일' }).click();
  await expect(page.getByRole('button', { name: '최근 7일' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('heading', { name: '전문가별 검증 실적' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('admin-overview.png'), fullPage: true });
  failSummary = true;
  await page.getByRole('button', { name: '새로고침' }).click();
  await expect(page.getByText('현황을 불러오지 못했습니다. 새로고침해 주세요.')).toBeVisible();
  await expect(page.locator('.admin-stat')).toHaveCount(0);
  failSummary = false;
  await page.getByRole('button', { name: '새로고침' }).click();
  await expect(page.locator('.admin-stat')).toHaveCount(4);
  const nav = page.getByRole('navigation', { name: '관리자 메뉴' });
  await nav.getByRole('link', { name: '사용자 관리', exact: true }).click();
  await page.getByRole('textbox', { name: '사용자 검색' }).fill('없음');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByText('조회 조건에 맞는 사용자가 없습니다.')).toBeVisible();
  await page.getByRole('textbox', { name: '사용자 검색' }).fill('김전문');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('button', { name: '김전문 회원 수정' }).click();
  const editor = page.getByRole('region', { name: '회원 정보 수정' });
  await editor.getByLabel('관리자 권한 부여').check();
  await editor.getByRole('combobox', { name: '요금제', exact: true }).selectOption('PRO');
  conflict = true;
  await editor.getByRole('button', { name: '회원 정보 저장' }).click();
  await expect(editor.getByLabel('관리자 권한 부여')).toBeChecked();
  await expect(
    page.getByText('다른 관리자가 수정했습니다. 새로고침 후 다시 시도해 주세요.').first(),
  ).toBeVisible();
  await editor.getByRole('button', { name: '회원 정보 저장' }).click();
  await expect(page.getByRole('status').filter({ hasText: '회원 정보를 저장' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'expert@example.com' })).toContainText(
    '관리자',
  );
  await expect(page.getByRole('row').filter({ hasText: 'expert@example.com' })).toContainText(
    '변호사',
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: '사용자 관리', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('admin-users.png'), fullPage: true });
  await nav.getByRole('link', { name: '공통코드 관리' }).click();
  await page.getByRole('button', { name: /요금제 PLAN/ }).click();
  await page.getByRole('button', { name: 'Free 상세 수정' }).click();
  const codeEditor = page.getByRole('region', { name: '코드 편집' });
  await codeEditor.getByLabel('코드명', { exact: true }).fill('무료 요금제');
  await codeEditor.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('region', { name: '상세 코드', exact: true })).toContainText(
    '무료 요금제',
  );
  await nav.getByRole('link', { name: 'BO 메뉴 관리' }).click();
  await page.getByRole('button', { name: '커뮤니티 메뉴 수정' }).click();
  const menuEditor = page.getByRole('region', { name: '메뉴 수정' });
  await menuEditor.getByLabel('메뉴 표시').uncheck();
  await menuEditor.getByRole('button', { name: '메뉴 저장' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'community' })).toContainText('숨김');
  await page.getByRole('button', { name: '검증요청 게시판 메뉴 수정' }).click();
  await menuEditor.getByLabel('메뉴명', { exact: true }).fill('전문가 검증');
  await menuEditor.getByLabel('표시 순서').fill('1');
  await menuEditor.getByRole('button', { name: '메뉴 저장' }).click();
  await expect(page.getByRole('status')).toContainText('메뉴 설정을 저장');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('admin-menus.png'), fullPage: true });
  await page.goto('http://127.0.0.1:5174');
  const boNav = page.getByRole('navigation', { name: '주 메뉴' });
  await expect(boNav.getByRole('button').first()).toHaveText('전문가 검증');
  await expect(boNav.getByRole('button', { name: '커뮤니티' })).toHaveCount(0);
  await page.goto('/admin/#menus');
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('heading', { name: '관리자 로그인', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '관리자 로그인', exact: true })).toBeVisible();
});

test('expired administrator session returns to login without exposing management data', async ({
  page,
}) => {
  await page.route('**/api/v1/admin/me', (route) =>
    route.fulfill({ json: { success: true, data: { id: 'admin', name: '관리자' } } }),
  );
  await page.route('**/api/v1/admin/summary**', (route) =>
    route.fulfill({
      status: 403,
      json: { error: { message: '활성화된 관리자 권한이 필요합니다.' } },
    }),
  );
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: '관리자 로그인', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('활성화된 관리자');
  await expect(page.getByRole('navigation', { name: '관리자 메뉴' })).toHaveCount(0);
});
