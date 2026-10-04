import assert from 'node:assert/strict';
import { randomUUID, scryptSync } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { createServer } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient, type AnswerEmailDelivery, type Prisma } from '@prisma/client';
import request from 'supertest';
import { createApp } from './app.js';
import { ChatStorage } from './chat-storage.js';
import {
  processAnswerEmail,
  answerOrigin,
  renewAnswerLink,
  tokenHash,
  enqueueAnswerEmail,
} from './answer-email.js';
import { createEmailProvider, EmailTransportError, type OutgoingEmail } from './email-provider.js';

test(
  'answer completion queues atomically; sending, retries, leases, links and admin history',
  { timeout: 60000 },
  async () => {
    const pg = new PGlite({ extensions: { btree_gist } });
    const socket = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 0 });
    let db: PrismaClient | undefined;
    try {
      const base = new URL('../prisma/migrations/', import.meta.url);
      for (const entry of (await readdir(base, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name)))
        await pg.exec(await readFile(new URL(`${entry.name}/migration.sql`, base), 'utf8'));
      await socket.start();
      db = new PrismaClient({
        datasources: {
          db: {
            url: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?connection_limit=2&sslmode=disable`,
          },
        },
      });
      const password = 'test-password-123',
        salt = 'a'.repeat(32);
      const expert = await db.expertAccount.create({
        data: {
          email: 'expert-mail@example.com',
          name: '답변 전문가',
          passwordHash: `${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
          adminProfile: { create: {} },
        },
      });
      await db.lawOffice.create({ data: { code: 'LAW001', name: 'Test' } });
      const post = await db.reviewBoardPost.create({
        data: {
          sessionId: randomUUID(),
          answerMessageId: randomUUID(),
          question: '임대차 질문',
          aiAnswer: 'AI 답변',
          requesterEmail: 'questioner@example.com',
        },
      });
      const app = createApp(
        'Test',
        async () => ({ answer: '이어서 받은 AI 답변', isLegalQuestion: true }),
        { db, storage: new ChatStorage(db) },
      );
      const bo = request.agent(app),
        admin = request.agent(app);
      await bo.post('/api/v1/bo/login').send({ identifier: expert.email, password }).expect(200);
      await bo.post(`/api/v1/bo/reviews/${post.id}/claim`).send({}).expect(200);
      await bo.post(`/api/v1/bo/reviews/${post.id}/complete`).send({ reply: '   ' }).expect(400);
      assert.equal(await db.answerEmailDelivery.count(), 0);
      // Database queue failure rolls the completed reply back to REVIEWING.
      await pg.exec(
        "CREATE FUNCTION fail_email() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test'; END; $$; CREATE TRIGGER fail_email BEFORE INSERT ON answer_email_deliveries FOR EACH ROW EXECUTE FUNCTION fail_email()",
      );
      await bo
        .post(`/api/v1/bo/reviews/${post.id}/complete`)
        .send({ reply: '전문가 답변 전문' })
        .expect(500);
      assert.equal((await db.reviewContribution.findFirstOrThrow()).status, 'REVIEWING');
      await pg.exec(
        'DROP TRIGGER fail_email ON answer_email_deliveries; DROP FUNCTION fail_email()',
      );
      await bo
        .post(`/api/v1/bo/reviews/${post.id}/complete`)
        .send({ reply: '전문가 답변 전문' })
        .expect(200);
      await bo.post(`/api/v1/bo/reviews/${post.id}/complete`).send({ reply: '중복' }).expect(409);
      const delivery = await db.answerEmailDelivery.findFirstOrThrow();
      assert.equal(await db.answerEmailDelivery.count(), 1);
      assert.equal(delivery.recipient, 'questioner@example.com');
      assert.ok(delivery.body.includes('전문가 답변 전문'));
      const token = /#answer=([a-f0-9]{64})/.exec(delivery.body)![1]!;
      assert.notEqual(token, delivery.linkTokenHash);
      const linked = await request(app).get(`/api/v1/review-answer/${token}`).expect(200);
      assert.equal(linked.body.data.reply, '전문가 답변 전문');
      assert.equal(linked.body.data.author, expert.name);
      assert.equal(linked.body.data.recipient, undefined);
      await request(app)
        .get(`/api/v1/review-answer/${'f'.repeat(64)}`)
        .expect(404);
      // Restore the same conversation on a new browser without moving the original ownership.
      const original = request.agent(app),
        restored = request.agent(app),
        outsider = request.agent(app);
      await original.get('/api/v1/config').expect(200);
      const originalHistory = (await original.get('/api/v1/chat/history').expect(200)).body.data;
      const session = await db.chatSession.findUniqueOrThrow({
        where: { id: originalHistory.sessionId },
      });
      const questionId = randomUUID();
      await db.chatMessage.createMany({
        data: [
          {
            id: questionId,
            lawOfficeId: session.lawOfficeId,
            sessionId: session.id,
            sequenceNo: 1,
            role: 'USER',
            messageType: 'USER_QUESTION',
            processingStatus: 'COMPLETED',
            content: post.question,
          },
          {
            id: post.answerMessageId,
            lawOfficeId: session.lawOfficeId,
            sessionId: session.id,
            sequenceNo: 2,
            role: 'ASSISTANT',
            messageType: 'AI_ANSWER',
            processingStatus: 'COMPLETED',
            content: post.aiAnswer,
            parentMessageId: questionId,
          },
        ],
      });
      await db.reviewBoardPost.update({ where: { id: post.id }, data: { sessionId: session.id } });
      await restored.post('/api/v1/chat').send({ question: '새 브라우저의 다른 대화' }).expect(200);
      const otherSessionId = (await restored.get('/api/v1/chat/history').expect(200)).body.data
        .sessionId;
      await outsider.post(`/api/v1/chat/conversations/${session.id}/select`).send({}).expect(404);
      await restored
        .post(`/api/v1/review-answer/${token}/restore`)
        .set('Sec-Fetch-Site', 'cross-site')
        .send({})
        .expect(403);
      await db.chatSession.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } });
      await restored
        .post(`/api/v1/review-answer/${token}/restore`)
        .send({})
        .expect(200)
        .then((r) => assert.equal(r.body.data.sessionId, session.id));
      await restored.post(`/api/v1/review-answer/${token}/restore`).send({}).expect(200);
      assert.equal(await db.foConversation.count({ where: { sessionId: session.id } }), 2);
      const conversations = (await restored.get('/api/v1/chat/conversations').expect(200)).body
        .data;
      assert.ok(conversations.some((item: { id: string }) => item.id === otherSessionId));
      assert.ok(conversations.some((item: { id: string }) => item.id === session.id));
      const restoredHistory = (await restored.get('/api/v1/chat/history').expect(200)).body.data;
      assert.equal(restoredHistory.sessionId, session.id);
      assert.deepEqual(
        restoredHistory.messages.map((m: { content: string }) => m.content),
        [post.question, post.aiAnswer],
      );
      assert.equal(
        (await original.get('/api/v1/chat/history').expect(200)).body.data.sessionId,
        session.id,
      );
      const restoredReviews = (await restored.get('/api/v1/reviews').expect(200)).body.data;
      assert.equal(restoredReviews[0].answers[0].reply, '전문가 답변 전문');
      await restored
        .post(`/api/v1/reviews/${post.id}/selection`)
        .send({ answerId: delivery.contributionId })
        .expect(200);
      await restored
        .post('/api/v1/chat')
        .send({ sessionId: session.id, question: '복원한 대화의 추가 질문' })
        .expect(200);
      assert.equal(
        (await original.get('/api/v1/chat/history').expect(200)).body.data.messages.length,
        4,
      );
      await outsider
        .post(`/api/v1/review-answer/${'f'.repeat(64)}/restore`)
        .send({})
        .expect(404);
      await request(app).get('/api/v1/admin/emails').expect(401);
      await bo.get('/api/v1/admin/emails').expect(401);
      await admin
        .post('/api/v1/admin/login')
        .send({ identifier: expert.email, password })
        .expect(200);
      await admin.get('/api/v1/admin/emails?from=2026-02-30').expect(400);
      const list = await admin.get('/api/v1/admin/emails?q=questioner&status=QUEUED').expect(200);
      assert.equal(list.body.data.total, 1);
      assert.equal(list.body.data.items[0].body, undefined);
      assert.equal(list.body.data.items[0].linkTokenHash, undefined);
      await admin
        .get('/api/v1/admin/emails?q=unmatched')
        .expect(200)
        .then((r) => assert.equal(r.body.data.total, 0));
      assert.equal(await processAnswerEmail(db), false);
      const sent: OutgoingEmail[] = [];
      const provider = {
        send: async (message: OutgoingEmail) => {
          sent.push(message);
        },
      };
      assert.equal(await processAnswerEmail(db, provider), true);
      assert.equal(await processAnswerEmail(db, provider), false);
      assert.equal(sent.length, 1);
      assert.equal(sent[0]!.recipient, delivery.recipient);
      assert.equal(sent[0]!.text, delivery.body);
      let detail = (await admin.get(`/api/v1/admin/emails/${delivery.id}`).expect(200)).body.data;
      assert.equal(detail.status, 'SENT');
      assert.equal(detail.attempts[0].status, 'SENT');
      await admin
        .post(`/api/v1/admin/emails/${delivery.id}/retry`)
        .send({ version: detail.version })
        .expect(409);
      await db.answerEmailDelivery.update({
        where: { id: delivery.id },
        data: { status: 'QUEUED', retryCount: 0 },
      });
      for (let i = 1; i <= 5; i++) {
        await db.answerEmailDelivery.update({
          where: { id: delivery.id },
          data: { nextAttemptAt: new Date(0) },
        });
        await processAnswerEmail(db, {
          send: async () => {
            throw new Error('SMTP password and body must never be logged');
          },
        });
        const current: AnswerEmailDelivery = await db.answerEmailDelivery.findUniqueOrThrow({
          where: { id: delivery.id },
        });
        assert.equal(current.status, i === 5 ? 'FAILED' : 'RETRY');
        assert.equal(current.lastErrorCode, 'DELIVERY_ERROR');
        if (i < 5) assert.ok(current.nextAttemptAt.getTime() > Date.now());
      }
      detail = (await admin.get(`/api/v1/admin/emails/${delivery.id}`).expect(200)).body.data;
      assert.equal(detail.attempts.length, 6);
      await admin
        .post(`/api/v1/admin/emails/${delivery.id}/retry`)
        .set('Sec-Fetch-Site', 'cross-site')
        .send({ version: detail.version })
        .expect(403);
      await admin
        .post(`/api/v1/admin/emails/${delivery.id}/retry`)
        .send({ version: 1 })
        .expect(409);
      await admin
        .post(`/api/v1/admin/emails/${delivery.id}/retry`)
        .send({ version: detail.version })
        .expect(200);
      await admin
        .post(`/api/v1/admin/emails/${delivery.id}/retry`)
        .send({ version: detail.version })
        .expect(409);
      // Expired lease is recovered; stale attempt is retained and marked failed.
      await db.answerEmailDelivery.update({
        where: { id: delivery.id },
        data: { status: 'SENDING', retryCount: 1, attemptCount: 7, leaseUntil: new Date(0) },
      });
      await db.answerEmailAttempt.create({ data: { deliveryId: delivery.id, attemptNo: 7 } });
      await Promise.all([processAnswerEmail(db, provider), processAnswerEmail(db, provider)]);
      assert.equal(sent.length, 2);
      detail = (await admin.get(`/api/v1/admin/emails/${delivery.id}`).expect(200)).body.data;
      assert.equal(detail.status, 'SENT');
      assert.equal(detail.attempts[6].errorCode, 'LEASE_EXPIRED');
      assert.equal(detail.attempts.length, 8);
      await db.answerEmailDelivery.update({
        where: { id: delivery.id },
        data: { linkExpiresAt: new Date(0) },
      });
      await request(app).get(`/api/v1/review-answer/${token}`).expect(404);
      await outsider.post(`/api/v1/review-answer/${token}/restore`).send({}).expect(404);
      await db.expertAdminProfile.update({
        where: { accountId: expert.id },
        data: { isActive: false },
      });
      await admin.get(`/api/v1/admin/emails/${delivery.id}`).expect(403);
    } finally {
      await db?.$disconnect();
      await socket.stop();
      await pg.close();
    }
  },
);

test('H-ERP SMTP adapter delivers real SMTP DATA to a local test server', async () => {
  let data = '',
    received = '';
  const server = createServer((socket) => {
    socket.write('220 test SMTP\r\n');
    let buffer = '',
      inData = false;
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n');
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            received = data;
            socket.write('250 accepted\r\n');
          } else data += line + '\r\n';
        } else if (line.startsWith('EHLO')) socket.write('250-test\r\n250 OK\r\n');
        else if (line === 'DATA') {
          inData = true;
          socket.write('354 continue\r\n');
        } else if (line === 'QUIT') {
          socket.end('221 bye\r\n');
        } else socket.write('250 OK\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    const provider = createEmailProvider({
      EMAIL_TRANSPORT: 'smtp',
      EMAIL_FROM: 'sender@example.com',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(address.port),
      SMTP_ALLOW_INSECURE: 'true',
      NODE_ENV: 'test',
    })!;
    await provider.send({
      recipient: 'reader@example.com',
      subject: 'Answer notification',
      text: 'Full answer\nhttps://search.aiqaver.com/#answer=test',
      messageKey: randomUUID(),
    });
    assert.ok(received.includes('To: reader@example.com'));
    assert.ok(received.includes('AI QAVER'));
    assert.ok(
      received.includes(
        Buffer.from('Full answer\nhttps://search.aiqaver.com/#answer=test')
          .toString('base64')
          .slice(0, 30),
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('transport configuration and Resend redact provider errors', async () => {
  assert.equal(createEmailProvider({}), undefined);
  assert.equal(
    createEmailProvider({
      EMAIL_TRANSPORT: 'smtp',
      EMAIL_FROM: 'sender@example.com',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_USER: 'sender@example.com',
    }),
    undefined,
  );
  assert.throws(
    () =>
      createEmailProvider({
        EMAIL_TRANSPORT: 'smtp',
        EMAIL_FROM: 'sender@example.com',
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_ALLOW_INSECURE: 'true',
        NODE_ENV: 'production',
      }),
    EmailTransportError,
  );
  const original = globalThis.fetch;
  try {
    let payload: unknown;
    globalThis.fetch = async (_url, init) => {
      payload = JSON.parse(String(init?.body));
      return new Response('{"id":"provider-id"}', { status: 200 });
    };
    const provider = createEmailProvider({
      EMAIL_TRANSPORT: 'resend',
      EMAIL_FROM: 'sender@example.com',
      RESEND_API_KEY: 'test-key',
    })!;
    await provider.send({
      recipient: 'reader@example.com',
      subject: 'test',
      text: 'answer',
      messageKey: randomUUID(),
    });
    assert.deepEqual(payload, {
      from: 'AI QAVER <sender@example.com>',
      to: ['reader@example.com'],
      subject: 'test',
      text: 'answer',
    });
    globalThis.fetch = async () => new Response('sensitive echoed answer', { status: 429 });
    await assert.rejects(
      provider.send({
        recipient: 'reader@example.com',
        subject: 'test',
        text: 'answer',
        messageKey: randomUUID(),
      }),
      (error: unknown) =>
        error instanceof EmailTransportError &&
        error.code === 'RATE_LIMIT' &&
        !error.message.includes('sensitive'),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('answer links renew with a new random token and retain the complete reply', () => {
  const old = 'a'.repeat(64);
  const body = `질문\n임대차\n답변\n전문가 답변\nhttp://localhost:5173/#answer=${old}`;
  const renewed = renewAnswerLink(body);
  const token = /#answer=([a-f0-9]{64})/.exec(renewed.body)![1]!;
  assert.notEqual(token, old);
  assert.equal(renewed.linkTokenHash, tokenHash(token));
  assert.ok(renewed.body.includes('전문가 답변'));
  assert.ok(renewed.linkExpiresAt.getTime() > Date.now() + 29 * 86400000);
  assert.equal(answerOrigin({ NODE_ENV: 'production' }), 'https://search.aiqaver.com');
  assert.throws(() =>
    answerOrigin({ NODE_ENV: 'production', FO_PUBLIC_URL: 'http://example.com' }),
  );
  assert.throws(() => answerOrigin({ FO_PUBLIC_URL: 'https://user:password@example.com' }));
});

test('answer email template sends the complete reply to the registered questioner', async () => {
  let saved: Prisma.AnswerEmailDeliveryCreateInput | undefined;
  const tx = {
    reviewContribution: {
      findUniqueOrThrow: async () => ({
        id: 'answer-id',
        reply: '완성된 답변\n두 번째 문단',
        post: { requesterEmail: 'questioner@example.com', question: '질문 원문' },
        expert: { name: '김전문' },
      }),
    },
    answerEmailDelivery: {
      create: async ({ data }: { data: Prisma.AnswerEmailDeliveryCreateInput }) => {
        saved = data;
      },
    },
  } as unknown as Prisma.TransactionClient;
  await enqueueAnswerEmail(tx, 'post-id', 'expert-id', 'https://search.aiqaver.com');
  assert.ok(saved);
  assert.equal(saved.recipient, 'questioner@example.com');
  assert.ok(saved.body.includes('완성된 답변\n두 번째 문단'));
  assert.ok(saved.body.includes('질문 원문'));
  assert.ok(saved.body.includes('김전문'));
  const token = /https:\/\/search.aiqaver.com\/#answer=([a-f0-9]{64})/.exec(saved.body)![1]!;
  assert.equal(saved.linkTokenHash, tokenHash(token));
});
