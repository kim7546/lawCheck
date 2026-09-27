import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import request from 'supertest';
import { createVoiceService } from './voice.js';
import { createApp } from './app.js';
import { ChatError } from './chat.js';

const credential = (time = Date.now()) =>
  Response.json({
    value: 'ek_test',
    expires_at: Math.floor(time / 1000) + 60,
    session: { secret: 'private' },
  });

test('voice uses a Korean transcription-only session and only returns short-lived credentials', async () => {
  const voice = createVoiceService({
    apiKey: 'private-key',
    fetch: async (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/realtime/client_secrets');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('Authorization'), 'Bearer private-key');
      assert.match(headers.get('OpenAI-Safety-Identifier') ?? '', /^[a-f0-9]{64}$/);
      assert.notEqual(headers.get('OpenAI-Safety-Identifier'), 'browser-1');
      const body = JSON.parse(init?.body as string);
      assert.equal(body.expires_after.seconds, 60);
      assert.equal(body.session.type, 'transcription');
      assert.equal(body.session.audio.input.transcription.model, 'gpt-live-transcribe');
      assert.deepEqual(body.session.audio.input.transcription.languages, ['ko']);
      assert.equal(body.session.audio.input.turn_detection, null);
      assert.equal(body.session.audio.input.transcription.language, undefined);
      return credential();
    },
  });
  const result = await voice.createSession('browser-1');
  assert.deepEqual(Object.keys(result).sort(), ['clientSecret', 'expiresAt', 'maxDurationSeconds']);
  assert.equal(result.clientSecret, 'ek_test');
  assert.equal(result.maxDurationSeconds, 120);
  assert.ok(!JSON.stringify(result).includes('private'));
});

test('disabled or unconfigured voice never calls the provider', async () => {
  for (const options of [{}, { enabled: false, apiKey: 'key' }]) {
    const service = createVoiceService({
      ...options,
      fetch: async () => assert.fail('provider called'),
    });
    assert.equal(service.enabled, false);
    await assert.rejects(
      service.createSession('browser'),
      (e: unknown) => e instanceof ChatError && e.status === 503,
    );
  }
});

test('voice connection failures are actionable and redact upstream details', async () => {
  for (const [fetcher, status] of [
    [async () => new Response('private details', { status: 401 }), 502],
    [async () => new Response('private details', { status: 429 }), 429],
    [
      async () => {
        throw new DOMException('private details', 'TimeoutError');
      },
      504,
    ],
    [
      async () => {
        throw new Error('private network details');
      },
      502,
    ],
    [async () => new Response('not-json'), 502],
    [async () => Response.json({ value: 'private-key', expires_at: 99999999999 }), 502],
    [async () => Response.json({ value: 'ek_test', expires_at: 1 }), 502],
    [async () => Response.json(null), 502],
  ] as const) {
    const service = createVoiceService({ apiKey: 'private-key', fetch: fetcher });
    await assert.rejects(service.createSession('browser'), (error: unknown) => {
      assert.ok(error instanceof ChatError);
      assert.equal(error.status, status);
      assert.ok(!error.message.includes('private'));
      return true;
    });
  }
});

test('voice limits repeated and overlapping token issuance and releases locks after failure', async () => {
  let now = Date.now();
  let calls = 0;
  const service = createVoiceService({
    apiKey: 'key',
    now: () => now,
    fetch: async () => {
      calls++;
      return credential(now);
    },
  });
  for (let index = 0; index < 5; index++) await service.createSession('browser');
  await assert.rejects(
    service.createSession('browser'),
    (error: unknown) => error instanceof ChatError && error.status === 429,
  );
  assert.equal(calls, 5);
  await service.createSession('other-browser');
  now += 60_001;
  await service.createSession('browser');
  assert.equal(calls, 7);

  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const concurrent = createVoiceService({
    apiKey: 'key',
    fetch: async () => {
      await gate;
      throw new Error('network failure');
    },
  });
  const first = concurrent.createSession('browser');
  await assert.rejects(
    concurrent.createSession('browser'),
    (error: unknown) => error instanceof ChatError && error.status === 409,
  );
  release();
  await assert.rejects(
    first,
    (error: unknown) => error instanceof ChatError && error.status === 502,
  );
  await assert.rejects(
    concurrent.createSession('browser'),
    (error: unknown) => error instanceof ChatError && error.status === 502,
  );
});

test('voice has a bounded instance issuance budget across new browsers', async () => {
  const service = createVoiceService({ apiKey: 'key', fetch: async () => credential() });
  for (let index = 0; index < 60; index++) await service.createSession(`browser-${index}`);
  await assert.rejects(
    service.createSession('another'),
    (error: unknown) => error instanceof ChatError && error.status === 429,
  );
});

test('voice endpoint requires JSON, same-origin browser requests and a configured database', async () => {
  const app = createApp(undefined, undefined, {
    voice: { apiKey: 'key', fetch: async () => assert.fail('provider called') },
  });
  for (const site of ['cross-site', 'same-site']) {
    const response = await request(app)
      .post('/api/v1/voice/session')
      .set('Sec-Fetch-Site', site)
      .send({})
      .expect(403);
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  await request(app).post('/api/v1/voice/session').set('Origin', 'null').send({}).expect(403);
  for (const body of [[], { sessionId: 5 }, { sessionId: 'not-a-session' }])
    await request(app).post('/api/v1/voice/session').send(body).expect(400);
  await request(app).post('/api/v1/voice/session').type('form').send('sessionId=x').expect(400);
  await request(app).post('/api/v1/voice/session').send({}).expect(503);
  const config = await request(app).get('/api/v1/config').expect(200);
  assert.equal(config.body.data.voiceInputEnabled, false);
  const disabled = createApp(undefined, undefined, { voice: { enabled: false, apiKey: 'key' } });
  await request(disabled).post('/api/v1/voice/session').send({}).expect(503);
});
