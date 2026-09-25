import { test, expect } from '@playwright/test';
import { officeSignupPolicy } from './office-policy.fixture';

test('Office signup requires explicit profession and all versioned consents, with retryable policy loading', async ({
  page,
}, testInfo) => {
  let policyUnavailable = true;
  let signupRequests = 0;
  await page.route('**/api/v1/bo/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/signup-policy')) {
      if (policyUnavailable)
        return route.fulfill({ status: 503, json: { error: { message: 'Unavailable' } } });
      return route.fulfill({ json: { success: true, data: officeSignupPolicy } });
    }
    if (path.endsWith('/signup')) {
      signupRequests++;
      const payload = route.request().postDataJSON();
      expect(payload.expertGroup).toBe('LAWYER');
      expect(payload.username).toBe('lawyer_test');
      expect(payload.betaSignupCode).toBe('1004');
      expect(payload.passwordConfirmation).toBe(payload.password);
      expect(payload.lawyerProfile).toEqual({
        mobilePhone: '010-1234-5678',
        registrationNumber: '001234',
        issueNumber: 'ISSUE-001',
        officeName: '테스트 법률사무소',
        address: '서울특별시 테스트로 1, 2층',
        officePhone: '02-1234-5678',
      });
      expect(payload.lawyerIdImage).toBeUndefined();
      expect(payload.consents).toEqual(
        officeSignupPolicy.agreements.map(({ kind, version }) => ({
          kind,
          version,
          accepted: true,
        })),
      );
      return route.fulfill({
        status: 409,
        json: { error: { message: '이미 가입된 이메일입니다.' } },
      });
    }
    return route.fulfill({ status: 401, json: { error: { message: '로그인이 필요합니다.' } } });
  });
  await page.goto('http://127.0.0.1:5174');
  await page.getByRole('button', { name: /아직 계정이 없나요/ }).click();
  const submit = page.getByRole('button', { name: '가입하고 시작하기' });
  await expect(page.getByRole('alert')).toContainText('가입 약관을 불러오지 못했습니다.');
  await expect(submit).toBeDisabled();
  policyUnavailable = false;
  await page.getByRole('button', { name: '약관 다시 불러오기' }).click();
  await expect(page.getByRole('radio')).toHaveCount(4);
  await expect(page.getByRole('radio', { name: '변호사', exact: true })).not.toBeChecked();
  for (const name of ['노무사', '변리사', '세무사'])
    await expect(page.getByRole('radio', { name: new RegExp(name) })).toBeDisabled();
  const all = page.getByRole('checkbox', { name: '모두 동의', exact: true });
  await expect(all).not.toBeChecked();
  await expect(page.locator('input[type="checkbox"]:checked')).toHaveCount(0);
  await expect(page.locator('.lawyer-signup-fields input').first()).toHaveAttribute(
    'name',
    'betaSignupCode',
  );
  await expect(page.locator('.lawyer-signup-fields input:required')).toHaveCount(6);
  for (const name of [
    '클로즈 베타 가입코드',
    '이름',
    '아이디',
    '이메일',
    '비밀번호',
    '비밀번호 확인',
  ]) {
    const input = page.getByLabel(name, { exact: true });
    await expect(input).toHaveAttribute('required', '');
    const mark = input.locator('..').locator('.required-mark');
    expect(await mark.evaluate((element) => getComputedStyle(element, '::before').content)).toBe(
      '"*"',
    );
    await expect(mark).toHaveCSS('color', 'rgb(220, 38, 38)');
    expect(
      await mark.evaluate((element) => element.parentElement?.firstElementChild === element),
    ).toBe(true);
  }
  await page.getByLabel('클로즈 베타 가입코드', { exact: true }).fill('1004');
  await page.getByLabel('이름', { exact: true }).fill('가입 테스트');
  await page.getByLabel('이메일', { exact: true }).fill('signup@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('test-password-123');
  await page.getByLabel('아이디', { exact: true }).fill('lawyer_test');
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('mismatch-password');
  await page.getByLabel('휴대전화', { exact: true }).fill('010-1234-5678');
  await page.getByLabel('변호사 등록 번호', { exact: true }).fill('001234');
  await expect(page.getByLabel('변호사 신분증 이미지', { exact: true })).toBeDisabled();
  await page.getByLabel('발급번호', { exact: true }).fill('ISSUE-001');
  await page.getByLabel('소속 법무법인/사무소명', { exact: true }).fill('테스트 법률사무소');
  await page.getByLabel('주소', { exact: true }).fill('서울특별시 테스트로 1, 2층');
  await page.getByLabel('대표전화', { exact: true }).fill('02-1234-5678');
  await all.check();
  await expect(submit).toBeDisabled();
  await page.getByRole('radio', { name: '변호사', exact: true }).check();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
  expect(signupRequests).toBe(0);
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('test-password-123');
  const privacy = page.getByRole('checkbox', { name: /개인정보 수집·이용 동의/ });
  await privacy.uncheck();
  await expect(all).toHaveJSProperty('indeterminate', true);
  await expect(submit).toBeDisabled();
  expect(signupRequests).toBe(0);
  await page.getByText('개인정보 수집·이용 동의 전문 보기', { exact: true }).click();
  const privacyDocument = page.getByLabel('개인정보 수집·이용 동의', { exact: true });
  await expect(privacyDocument).toContainText('수집·이용 목적');
  await expect(privacyDocument).toContainText('보유·이용 기간');
  await expect(privacyDocument).toContainText('동의 거부 권리');
  await privacy.check();
  await expect(all).toBeChecked();
  await page.getByText('개인정보 수집·이용 동의 전문 보기', { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('office-signup.png'), fullPage: true });
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText('이미 가입된 이메일입니다.');
  expect(signupRequests).toBe(1);
  await expect(privacy).toBeChecked();
  await all.uncheck();
  await expect(page.locator('input[type="checkbox"]:checked')).toHaveCount(0);
  await expect(submit).toBeDisabled();
  await page.getByRole('button', { name: /이미 계정이 있나요/ }).click();
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /아직 계정이 없나요/ }).click();
  await expect(page.getByRole('checkbox', { name: '모두 동의', exact: true })).not.toBeChecked();
  await expect(page.getByRole('radio', { name: '변호사', exact: true })).not.toBeChecked();
});

test('Office signup requires a beta code and retains optional lawyer details', async ({ page }) => {
  let submitted = false;
  let signupRequests = 0;
  await page.route('**/api/v1/bo/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/signup-policy'))
      return route.fulfill({ json: { success: true, data: officeSignupPolicy } });
    if (path.endsWith('/signup')) {
      signupRequests++;
      const payload = route.request().postDataJSON();
      if (payload.betaSignupCode !== '1004')
        return route.fulfill({
          status: 400,
          json: { error: { message: '클로즈 베타 가입코드를 확인해 주세요.' } },
        });
      expect(Object.values(payload.lawyerProfile)).toEqual(['', '', '', '', '', '']);
      submitted = true;
      return route.fulfill({
        status: 409,
        json: { error: { message: '이미 사용 중인 아이디 또는 이메일입니다.' } },
      });
    }
    return route.fulfill({ status: 401, json: { error: { message: '로그인이 필요합니다.' } } });
  });
  await page.goto('http://127.0.0.1:5174');
  await page.getByRole('button', { name: /아직 계정이 없나요/ }).click();
  await page.getByLabel('이름', { exact: true }).fill('최소 가입');
  await page.getByLabel('아이디', { exact: true }).fill('minimal_user');
  await page.getByLabel('이메일', { exact: true }).fill('minimal@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('test-password-123');
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('test-password-123');
  await page.getByRole('radio', { name: '변호사', exact: true }).check();
  await page.getByRole('checkbox', { name: '모두 동의', exact: true }).check();
  const betaCode = page.getByLabel('클로즈 베타 가입코드', { exact: true });
  await page.getByRole('button', { name: '가입하고 시작하기' }).click();
  await expect(betaCode).toBeFocused();
  expect(signupRequests).toBe(0);
  await betaCode.fill('1003');
  await page.getByRole('button', { name: '가입하고 시작하기' }).click();
  await expect(page.getByRole('alert')).toHaveText('클로즈 베타 가입코드를 확인해 주세요.');
  expect(submitted).toBe(false);
  await expect(page.getByLabel('아이디', { exact: true })).toHaveValue('minimal_user');
  await betaCode.fill('1004');
  await page.getByRole('button', { name: '가입하고 시작하기' }).click();
  await expect(page.getByRole('alert')).toHaveText('이미 사용 중인 아이디 또는 이메일입니다.');
  expect(submitted).toBe(true);
  expect(signupRequests).toBe(2);
});
