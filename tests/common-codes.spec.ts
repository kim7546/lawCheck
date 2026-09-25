import { test, expect } from '@playwright/test';
import type { CommonCodeRecord } from '@lawcheck/contracts';

test('administrator manages groups and details with conflict recovery; member menu stays hidden', async ({
  page,
}, testInfo) => {
  let admin = true;
  let conflict = false;
  let revision = 0;
  const record = (code: string, name: string): CommonCodeRecord => ({
    code,
    name,
    description: '',
    sortOrder: 10,
    isActive: true,
    updatedAt: new Date(revision++).toISOString(),
  });
  const groups = [record('EXPERT_GROUP', '전문가 그룹'), record('PLAN', '요금제')];
  const details: Record<string, CommonCodeRecord[]> = {
    EXPERT_GROUP: [record('LAWYER', '변호사')],
    PLAN: [record('FREE', 'Free')],
  };
  await page.route('**/api/v1/bo/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const parts = path.split('/').filter(Boolean);
    let data: unknown;
    if (path.endsWith('/me'))
      data = {
        id: 'admin',
        name: '관리자',
        plan: 'FREE',
        planCode: { name: 'Free' },
        canManageCodes: admin,
      };
    else if (path.endsWith('/dashboard'))
      data = { reviews: [], bestPosts: [], reviewCount: 0, communityCount: 0 };
    else {
      const group = parts[4];
      const isDetail = parts[5] === 'details';
      const target = isDetail ? details[group!]! : groups;
      if (route.request().method() === 'GET') data = target;
      else {
        if (conflict) {
          conflict = false;
          return route.fulfill({
            status: 409,
            json: { error: { message: '다른 관리자가 수정했습니다. 새로고침해 주세요.' } },
          });
        }
        const body = route.request().postDataJSON();
        const updateCode = isDetail ? parts[6] : group;
        if (updateCode)
          Object.assign(
            target.find((item) => item.code === updateCode)!,
            body,
            { updatedAt: new Date(revision++).toISOString() },
          );
        else {
          target.push({ ...body, updatedAt: new Date(revision++).toISOString() });
          if (!isDetail) details[body.code] = [];
        }
        data = target.find((item) => item.code === body.code);
      }
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('http://127.0.0.1:5174');
  await page.getByRole('button', { name: '공통 코드 관리', exact: true }).click();
  await expect(page.getByRole('heading', { name: '공통 코드 관리' })).toBeVisible();
  await page.getByRole('button', { name: '그룹 추가' }).click();
  const editor = page.getByRole('region', { name: '코드 편집' });
  await editor.getByLabel('코드', { exact: true }).fill('TEST_GROUP');
  await editor.getByLabel('코드명', { exact: true }).fill('테스트 그룹');
  await editor.getByLabel('설명', { exact: true }).fill('공통 코드 설명');
  await editor.getByLabel('정렬순서', { exact: true }).fill('30');
  await editor.getByRole('button', { name: '저장' }).click();
  await expect(page.getByRole('status')).toContainText('저장했습니다');
  await page.getByRole('button', { name: /테스트 그룹 TEST_GROUP/ }).click();
  await page.getByRole('button', { name: '상세 추가' }).click();
  await editor.getByLabel('코드', { exact: true }).fill('FIRST');
  await editor.getByLabel('코드명', { exact: true }).fill('첫 번째 코드');
  await editor.getByLabel('사용', { exact: true }).uncheck();
  await editor.getByRole('button', { name: '저장' }).click();
  await expect(page.getByRole('region', { name: '상세 코드', exact: true })).toContainText(
    '미사용',
  );
  await page.getByRole('button', { name: '첫 번째 코드 상세 수정' }).click();
  await expect(editor.getByLabel('코드', { exact: true })).toBeDisabled();
  await editor.getByLabel('코드명', { exact: true }).fill('수정한 코드');
  conflict = true;
  await editor.getByRole('button', { name: '저장' }).click();
  await expect(page.getByRole('alert')).toContainText('다른 관리자가 수정');
  await expect(editor.getByLabel('코드명', { exact: true })).toHaveValue('수정한 코드');
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole('button', { name: '첫 번째 코드 상세 수정' }).click();
  await editor.getByLabel('코드명', { exact: true }).fill('수정한 코드');
  await editor.getByLabel('사용', { exact: true }).check();
  await editor.getByRole('button', { name: '저장' }).click();
  await expect(page.getByRole('region', { name: '상세 코드', exact: true })).toContainText(
    '수정한 코드',
  );
  await page.getByRole('button', { name: '테스트 그룹 그룹 수정' }).click();
  await editor.getByLabel('사용', { exact: true }).uncheck();
  await editor.getByRole('button', { name: '저장' }).click();
  await expect(page.getByText('이 그룹은 미사용입니다.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('common-codes.png'), fullPage: true });
  admin = false;
  await page.reload();
  await expect(page.getByRole('heading', { name: '대시보드', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '공통 코드 관리', exact: true })).toHaveCount(0);
});
