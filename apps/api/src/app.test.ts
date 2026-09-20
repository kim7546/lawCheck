import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from './app.js';
import { createAnswerGenerator } from './chat.js';

test('development mode allows twelve questions and bounds recent history', async () => {
  const seen: number[] = [];
  const client = request.agent(
    createApp(
      undefined,
      async ({ history }) => {
        seen.push(history.length);
        return { answer: '답변', isLegalQuestion: true };
      },
      { questionLimitEnabled: false },
    ),
  );
  const history: { question: string; answer: string }[] = [];
  for (let index = 0; index < 12; index++) {
    const response = await client.post('/api/v1/chat').send({ question: '질문', history });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.remainingQuestions, null);
    history.push({ question: '질문', answer: '답변' });
  }
  assert.equal(seen.length, 12);
  assert.equal(seen[11], 10);
  const config = await client.get('/api/v1/config');
  assert.equal(config.body.data.questionLimitEnabled, false);
  assert.equal(config.body.data.remainingQuestions, null);
});

test('chat forwards question and history and returns generated answer', async () => {
  const history = [{ question: '이전 질문', answer: '이전 답변' }];
  const response = await request(
    createApp(undefined, async (input) => {
      assert.deepEqual(input, { question: '새 질문', history });
      return { answer: 'GPT 답변', isLegalQuestion: true };
    }),
  )
    .post('/api/v1/chat')
    .send({ question: ' 새 질문 ', history });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.answer, 'GPT 답변');
});

test('invalid chat inputs never invoke AI', async () => {
  const app = createApp(undefined, async () => {
    assert.fail('must not call AI');
  });
  for (const body of [
    { question: '' },
    { question: 'x'.repeat(2001) },
    { question: '질문', history: [null] },
    { question: '질문', history: 'invalid history' },
  ]) {
    assert.equal((await request(app).post('/api/v1/chat').send(body)).status, 400);
  }
});

test('missing API key returns actionable error without a sample answer', async () => {
  const response = await request(createApp(undefined, createAnswerGenerator({})))
    .post('/api/v1/chat')
    .send({ question: '질문' });
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'AI_NOT_CONFIGURED');
});

test('Responses API request keeps credentials server-side and extracts message output', async () => {
  const generate = createAnswerGenerator({
    apiKey: 'test-key',
    model: 'test-model',
    fetch: async (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-key');
      const body = JSON.parse(init?.body as string);
      assert.equal(body.model, 'test-model');
      assert.equal(body.store, false);
      assert.deepEqual(
        body.input.map((item: { role: string }) => item.role),
        ['developer', 'user', 'assistant', 'user'],
      );
      return Response.json({
        status: 'completed',
        output: [
          { type: 'reasoning' },
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({ answer: '실제 응답', isLegalQuestion: true }),
              },
            ],
          },
        ],
      });
    },
  });
  assert.deepEqual(
    await generate({ question: '질문', history: [{ question: '이전 질문', answer: '이전 답변' }] }),
    { answer: '실제 응답', isLegalQuestion: true },
  );
});

test('upstream failures, timeouts and incomplete output never become successful answers', async () => {
  for (const [fetcher, status] of [
    [async () => new Response('secret provider error', { status: 401 }), 502],
    [async () => new Response('', { status: 429 }), 429],
    [
      async () => {
        throw new DOMException('timeout', 'TimeoutError');
      },
      504,
    ],
    [async () => Response.json({ status: 'completed', output: [] }), 502],
    [
      async () =>
        Response.json({
          status: 'incomplete',
          output: [{ type: 'message', content: [{ type: 'output_text', text: 'partial' }] }],
        }),
      502,
    ],
  ] as const) {
    const response = await request(
      createApp(undefined, createAnswerGenerator({ apiKey: 'secret-key', fetch: fetcher })),
    )
      .post('/api/v1/chat')
      .send({ question: '질문' });
    assert.equal(response.status, status);
    assert.equal(response.body.success, false);
    assert.ok(!JSON.stringify(response.body).includes('secret'));
  }
});

test('health works without database or AI credentials', async () => {
  const response = await request(createApp()).get('/api/v1/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.mode, 'prototype');
});

test('quota errors are distinguished from temporary rate limits without leaking provider details', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  for (const code of [
    'credit_balance_exhausted',
    'insufficient_quota',
    'billing_hard_limit_reached',
    'billing_not_active',
    'organization_spend_limit_exceeded',
    'project_spend_limit_exceeded',
    'organization_usage_limit_exceeded',
    'rate_limit_exceeded',
    'slow_down',
  ]) {
    const temporary = ['rate_limit_exceeded', 'slow_down'].includes(code);
    const response = await request(
      createApp(
        undefined,
        createAnswerGenerator({
          apiKey: 'secret-key',
          fetch: async () =>
            Response.json({ error: { code, message: 'secret provider details' } }, { status: 429 }),
        }),
      ),
    )
      .post('/api/v1/chat')
      .send({ question: 'secret question' });
    assert.equal(response.status, temporary ? 429 : 503);
    assert.equal(response.body.error.code, temporary ? 'AI_RATE_LIMITED' : 'AI_QUOTA_EXCEEDED');
    assert.ok(!JSON.stringify(response.body).includes('secret'));
  }
  assert.equal(log.mock.calls.length, 9);
  assert.ok(!JSON.stringify(log.mock.calls.map((call) => call.arguments)).includes('secret'));
});

test('quota type fallback and malformed provider errors are handled safely', async () => {
  for (const [body, status, code] of [
    [{ error: { type: 'insufficient_quota', code: null } }, 503, 'AI_QUOTA_EXCEEDED'],
    [null, 429, 'AI_RATE_LIMITED'],
    [{ error: 'unexpected' }, 429, 'AI_RATE_LIMITED'],
  ] as const) {
    const response = await request(
      createApp(
        undefined,
        createAnswerGenerator({
          apiKey: 'test-key',
          fetch: async () => Response.json(body, { status: 429 }),
        }),
      ),
    )
      .post('/api/v1/chat')
      .send({ question: '질문' });
    assert.equal(response.status, status);
    assert.equal(response.body.error.code, code);
  }
});
test('public config exposes office branding without environment secrets', async () => {
  const response = await request(createApp('테스트 사무실')).get('/api/v1/config');
  assert.deepEqual(response.body.data, {
    officeName: '테스트 사무실',
    mode: 'prototype',
    maxQuestions: 3,
    questionLimitEnabled: false,
    remainingQuestions: null,
  });
});
test('prototype cannot accidentally accept or send real verification requests', async () => {
  const response = await request(createApp())
    .post('/api/v1/verification-requests')
    .send({ email: 'test@example.com' });
  assert.equal(response.status, 404);
});

test('server limits a cookie session to three questions even when history is omitted; reset starts a new session', async () => {
  let calls = 0;
  const client = request.agent(
    createApp(
      undefined,
      async () => {
        calls++;
        return { answer: '법률 질문을 입력해 주세요.', isLegalQuestion: false };
      },
      { questionLimitEnabled: true },
    ),
  );
  for (let index = 0; index < 3; index++) {
    const response = await client.post('/api/v1/chat').send({ question: '안녕하세요' });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.remainingQuestions, 2 - index);
    assert.equal(response.body.data.isLegalQuestion, false);
  }
  assert.equal((await client.get('/api/v1/config')).body.data.remainingQuestions, 0);
  const blocked = await client.post('/api/v1/chat').send({ question: '네 번째' });
  assert.equal(blocked.body.error.code, 'QUESTION_LIMIT_REACHED');
  assert.equal(calls, 3);
  await client.post('/api/v1/chat/session').expect(200);
  await client.post('/api/v1/chat').send({ question: '새 질문' }).expect(200);
  assert.equal(calls, 4);
});

test('pending requests cannot race the session counter and failures refund the question', async () => {
  let finish: () => void = () => {};
  let started: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const client = request.agent(
    createApp(
      undefined,
      async () => {
        started();
        await pending;
        throw new Error('test failure');
      },
      { questionLimitEnabled: true },
    ),
  );
  await client.get('/api/v1/config');
  const first = client
    .post('/api/v1/chat')
    .send({ question: '첫 질문' })
    .then((r) => r);
  await entered;
  await client.post('/api/v1/chat').send({ question: '동시 질문' }).expect(409);
  finish();
  assert.equal((await first).status, 502);
  assert.equal((await client.get('/api/v1/config')).body.data.remainingQuestions, 3);
});

test('structured answers preserve classification and reject missing or malformed classification', async () => {
  for (const data of [
    { answer: '법률 안내', isLegalQuestion: true },
    { answer: '법률 질문을 해 주세요.', isLegalQuestion: false },
    { answer: '분류 없음' },
    { answer: '잘못된 분류', isLegalQuestion: 'true' },
  ]) {
    const generate = createAnswerGenerator({
      apiKey: 'test-key',
      fetch: async (_url, init) => {
        const payload = JSON.parse(init?.body as string);
        assert.equal(payload.text.format.type, 'json_schema');
        assert.equal(payload.text.format.strict, true);
        return Response.json({
          status: 'completed',
          output: [
            { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] },
          ],
        });
      },
    });
    if (typeof data.isLegalQuestion === 'boolean') {
      assert.deepEqual(await generate({ question: '질문', history: [] }), data);
    } else {
      await assert.rejects(generate({ question: '질문', history: [] }), {
        code: 'AI_INVALID_RESPONSE',
      });
    }
  }
});
