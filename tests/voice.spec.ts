import { expect, test } from '@playwright/test';
import { mockVoice } from './voice.fixture';

test('voice previews speech, reconciles final text and only sends after user review', async ({
  page,
}, testInfo) => {
  const calls = await mockVoice(page);
  await page.goto('/');
  const input = page.getByRole('textbox', { name: '질문', exact: true });
  await input.fill('임대차 문의입니다.');
  await page.getByRole('button', { name: '음성으로 질문 입력' }).click();
  await expect(page.getByText('듣고 있어요 · 최대 2분')).toBeVisible();
  await expect(input).toHaveAttribute('readonly', '');
  const delta = {
    type: 'conversation.item.input_audio_transcription.delta',
    item_id: 'speech-1',
    event_id: 'delta-1',
    delta: '보증금 50만 원',
  };
  await page.evaluate((event) => {
    window.voiceHarness.emit(event);
    window.voiceHarness.emit(event);
  }, delta);
  await expect(page.getByLabel('인식 중인 내용')).toHaveText('보증금 50만 원');
  await expect(input).toHaveValue('임대차 문의입니다.');
  await expect(page.getByRole('button', { name: '질문 보내기', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('voice-listening.png'), fullPage: true });
  await page.getByRole('button', { name: '말하기 완료' }).click();
  await expect(input).toHaveValue('임대차 문의입니다.\n보증금 500만 원을 돌려받지 못했어요.');
  expect(calls.questions).toHaveLength(0);
  expect(calls.sessions).toEqual([{ sessionId: '11111111-1111-4111-8111-111111111111' }]);
  expect(await page.evaluate(() => window.voiceHarness.snapshot())).toMatchObject({
    stopped: [true],
    closed: [true],
    commits: 1,
  });
  await input.fill('보증금 5,000만 원을 돌려받지 못했어요.');
  await input.press('Enter');
  await expect(page.locator('.assistant-body > p')).toHaveText(
    '계약서와 입금 내역을 확인해 주세요.',
  );
  expect(calls.questions[0]?.question).toBe('보증금 5,000만 원을 돌려받지 못했어요.');
  await expect(page.locator('.verify-button')).toBeHidden();
  await page.reload();
  await expect(page.locator('.user-message')).toContainText('보증금 5,000만 원');
  await expect(page.locator('.verify-button')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('denied microphone and session limits preserve typed drafts', async ({ page }) => {
  const calls = await mockVoice(page, { permission: 'deny' });
  await page.goto('/');
  const input = page.getByRole('textbox', { name: '질문', exact: true });
  await input.fill('작성하던 질문');
  await page.getByRole('button', { name: '음성으로 질문 입력' }).click();
  await expect(page.getByRole('status')).toContainText('마이크 사용이 허용되지 않았어요');
  await expect(input).toHaveValue('작성하던 질문');
  expect(calls.sessions).toHaveLength(0);
  await input.fill('직접 입력할 수 있어요.');
  await expect(page.getByRole('button', { name: '질문 보내기', exact: true })).toBeEnabled();
});

test('session issuance errors stop the microphone and allow another attempt', async ({ page }) => {
  await mockVoice(page, { sessionStatus: 429 });
  await page.goto('/');
  await page.getByRole('button', { name: '음성으로 질문 입력' }).click();
  await expect(page.getByRole('status')).toContainText('1분 후 다시 시도');
  expect(await page.evaluate(() => window.voiceHarness.snapshot())).toMatchObject({
    stopped: [true],
    closed: [true],
    commits: 0,
  });
  await expect(page.getByRole('button', { name: '음성으로 질문 입력' })).toBeEnabled();
});

test('disconnect keeps partial speech for explicit recovery without auto-submission', async ({
  page,
}) => {
  const calls = await mockVoice(page);
  await page.goto('/');
  await page.getByRole('button', { name: '음성으로 질문 입력' }).click();
  await expect(page.getByText('듣고 있어요 · 최대 2분')).toBeVisible();
  await page.evaluate(() => {
    window.voiceHarness.emit({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'speech-1',
      delta: '퇴직금을 못 받았어요.',
    });
    window.voiceHarness.disconnect();
  });
  await expect(page.getByRole('status')).toContainText('연결이 끊겼어요');
  const input = page.getByRole('textbox', { name: '질문', exact: true });
  await expect(input).toHaveValue('');
  await page.getByRole('button', { name: '인식한 내용 사용' }).click();
  await expect(input).toHaveValue('퇴직금을 못 받았어요.');
  expect(calls.questions).toHaveLength(0);
  expect(await page.evaluate(() => window.voiceHarness.snapshot())).toMatchObject({
    stopped: [true],
    closed: [true],
  });
});

test('cancel ignores late transcript events and late microphone permissions', async ({ page }) => {
  const calls = await mockVoice(page, { permission: 'pending' });
  await page.goto('/');
  await page.getByRole('textbox', { name: '질문', exact: true }).fill('기존 질문');
  await page.getByRole('button', { name: '음성으로 질문 입력' }).click();
  await expect(page.getByText('마이크에 연결하고 있어요')).toBeVisible();
  await page.getByRole('button', { name: '음성 입력 취소' }).click();
  await page.evaluate(() => window.voiceHarness.releasePermission());
  await expect
    .poll(() => page.evaluate(() => window.voiceHarness.snapshot().stopped))
    .toEqual([true]);
  await expect(page.getByRole('textbox', { name: '질문', exact: true })).toHaveValue('기존 질문');
  expect(calls.sessions).toHaveLength(0);
});

test('new conversation closes voice and rejects the previous conversation final result', async ({
  page,
}) => {
  await mockVoice(page, { autoComplete: false });
  await page.goto('/');
  await page.getByRole('button', { name: '음성으로 질문 입력' }).click();
  await expect(page.getByText('듣고 있어요 · 최대 2분')).toBeVisible();
  await page.getByRole('button', { name: '말하기 완료' }).click();
  await page.locator('button[aria-label="새로운 질문 시작하기"]:visible').first().click();
  await page.evaluate(() => {
    window.voiceHarness.emit({ type: 'input_audio_buffer.committed', item_id: 'speech-1' }, 0);
    window.voiceHarness.emit(
      {
        type: 'conversation.item.input_audio_transcription.completed',
        item_id: 'speech-1',
        transcript: '이전 대화에만 속한 질문',
      },
      0,
    );
  });
  await expect(page.getByRole('textbox', { name: '질문', exact: true })).toHaveValue('');
  await expect(page.getByRole('region', { name: '음성 입력', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.voiceHarness.snapshot())).toMatchObject({
    stopped: [true],
    closed: [true],
  });
});

test('automatic time limit finishes once and overlong speech is preserved for editing', async ({
  page,
}) => {
  const longText = '가'.repeat(2001);
  const calls = await mockVoice(page, { maxSeconds: 1, finalText: longText });
  await page.goto('/');
  await page.getByRole('button', { name: '음성으로 질문 입력' }).click();
  const input = page.getByRole('textbox', { name: '질문', exact: true });
  await expect(input).toHaveValue(longText);
  await expect(page.getByRole('alert')).toContainText('2,000자까지');
  await expect(page.getByRole('button', { name: '질문 보내기', exact: true })).toBeDisabled();
  expect(calls.questions).toHaveLength(0);
  await input.fill('수정한 짧은 질문');
  await expect(page.getByRole('button', { name: '질문 보내기', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.voiceHarness.snapshot().commits)).toBe(1);
});

test('empty speech never replaces the draft and a disabled feature hides the microphone', async ({
  page,
}) => {
  const calls = await mockVoice(page, { finalText: '' });
  await page.goto('/');
  const input = page.getByRole('textbox', { name: '질문', exact: true });
  await input.fill('그대로 남을 질문');
  await page.getByRole('button', { name: '음성으로 질문 입력' }).click();
  await page.getByRole('button', { name: '말하기 완료' }).click();
  await expect(page.getByRole('status')).toContainText('음성을 인식하지 못했어요');
  await expect(input).toHaveValue('그대로 남을 질문');
  expect(calls.questions).toHaveLength(0);
  await page.route('**/api/v1/config', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          officeName: '테스트',
          questionLimitEnabled: false,
          maxQuestions: 3,
          voiceInputEnabled: false,
        },
      },
    }),
  );
  await page.reload();
  await expect(page.getByRole('textbox', { name: '질문', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '음성으로 질문 입력' })).toHaveCount(0);
});
