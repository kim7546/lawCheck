import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from './app.js';
import { ChatStorage } from './chat-storage.js';
import { ChatError } from './chat.js';

test(
  'Prisma chat persistence: cookie isolation, restart, stored context, failure and concurrent requests',
  { timeout: 60000 },
  async () => {
    const pg = new PGlite({ extensions: { btree_gist } });
    const socket = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 0 });
    let db: PrismaClient | undefined;
    try {
      const base = new URL('../prisma/migrations/', import.meta.url);
      for (const entry of (await readdir(base, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name))) {
        await pg.exec(await readFile(new URL(`${entry.name}/migration.sql`, base), 'utf8'));
      }
      await socket.start();
      db = new PrismaClient({
        datasources: {
          db: {
            url: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?connection_limit=1&sslmode=disable`,
          },
        },
      });
      await db.lawOffice.create({ data: { code: 'LAW001', name: 'Test' } });
      const storage = new ChatStorage(db);
      let release: (() => void) | undefined;
      let entered: (() => void) | undefined;
      const app = createApp(
        'Test',
        async ({ question, history }) => {
          if (question === 'second')
            assert.deepEqual(history, [{ question: 'first', answer: 'answer:first' }]);
          if (question === 'fail') throw new ChatError(502, 'AI_UNAVAILABLE', 'test failure');
          if (question === 'wait') {
            entered?.();
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
          return { answer: `answer:${question}`, isLegalQuestion: question !== 'second' };
        },
        { storage, questionLimitEnabled: false },
      );
      const client = request.agent(app);
      const config = await client.get('/api/v1/config').expect(200);
      const setCookie = config.headers['set-cookie'];
      assert.ok(Array.isArray(setCookie), 'config must return session cookies');
      const sessionCookie = setCookie[0];
      assert.ok(sessionCookie, 'config must return a session cookie');
      const cookie = sessionCookie.split(';')[0];
      assert.ok(cookie, 'session cookie must contain a name and value');
      await client.post('/api/v1/chat').send({ question: 'first' }).expect(200);
      await client
        .post('/api/v1/chat')
        .send({ question: 'second', history: [{ question: 'forged', answer: 'forged' }] })
        .expect(200);
      const messages = await db.chatMessage.findMany({ orderBy: { sequenceNo: 'asc' } });
      assert.equal(messages.length, 4);
      const [firstQuestion, firstAnswer, secondQuestion, secondAnswer] = messages;
      assert.ok(firstQuestion && firstAnswer && secondQuestion && secondAnswer);
      assert.equal(firstAnswer.parentMessageId, firstQuestion.id);
      assert.equal(secondAnswer.messageType, 'NON_LEGAL_NOTICE');
      assert.equal(new Set(messages.map((m) => m.sessionId)).size, 1);
      const session = await db.chatSession.findUniqueOrThrow({
        where: { id: firstQuestion.sessionId },
      });
      assert.equal(session.maxQuestionCount, null);
      assert.notEqual(session.sessionTokenHash, cookie.split('=')[1]);
      const restarted = createApp('Test', undefined, { storage: new ChatStorage(db) });
      const restored = await request(restarted)
        .get('/api/v1/chat/history')
        .set('Cookie', cookie)
        .expect(200);
      assert.equal(restored.body.data.messages.length, 4);
      const stranger = await request(app).get('/api/v1/chat/history').expect(200);
      assert.equal(stranger.body.data.messages.length, 0);
      await client.post('/api/v1/chat').send({ question: 'fail' }).expect(502);
      assert.equal(
        (await db.chatSession.findUniqueOrThrow({ where: { id: session.id } })).questionCount,
        2,
      );
      assert.equal(
        await db.chatMessage.count({
          where: { sessionId: session.id, processingStatus: 'FAILED' },
        }),
        1,
      );
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const pending = client
        .post('/api/v1/chat')
        .send({ question: 'wait' })
        .then((r) => r);
      await started;
      await client.post('/api/v1/chat').send({ question: 'racing' }).expect(409);
      release?.();
      assert.equal((await pending).status, 200);
      await client.post('/api/v1/chat/session').expect(200);
      assert.equal((await client.get('/api/v1/chat/history')).body.data.messages.length, 0);
      assert.equal(await db.chatMessage.count({ where: { sessionId: session.id } }), 7);
      // Force the final transaction to fail after the answer insert. No successful
      // response or partial answer may escape when persistence fails.
      await pg.exec(`CREATE FUNCTION reject_test_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.content = 'reject-save' AND NEW.processing_status = 'COMPLETED' THEN RAISE EXCEPTION 'test storage failure'; END IF;
      RETURN NEW; END $$;
      CREATE TRIGGER test_completion BEFORE UPDATE ON chat_messages FOR EACH ROW EXECUTE FUNCTION reject_test_completion();`);
      const unsaved = await client
        .post('/api/v1/chat')
        .send({ question: 'reject-save' })
        .expect(503);
      assert.equal(unsaved.body.error.code, 'DATABASE_UNAVAILABLE');
      assert.equal(await db.chatMessage.count({ where: { content: 'answer:reject-save' } }), 0);

      // Exercise the initial BO release against the same isolated PostgreSQL database.
      const reviewApp = createApp(
        'Test',
        async () => ({ answer: '검증할 AI 답변', isLegalQuestion: true }),
        { storage, db },
      );
      const requester = request.agent(reviewApp);
      const reviewer = request.agent(reviewApp);
      const otherReviewer = request.agent(reviewApp);
      await request(reviewApp).get('/api/v1/bo/reviews').expect(401);
      await reviewer
        .post('/api/v1/bo/signup')
        .send({ email: 'review@example.com', password: 'short', name: '답변자' })
        .expect(400);
      const signup = await reviewer
        .post('/api/v1/bo/signup')
        .send({ email: 'Review@example.com', password: 'test-password-123', name: '답변자' })
        .expect(201);
      assert.equal(signup.body.data.email, 'review@example.com');
      assert.equal(signup.body.data.passwordHash, undefined);
      assert.ok(
        (await db.reviewerAccount.findUniqueOrThrow({ where: { id: signup.body.data.id } }))
          .passwordHash !== 'test-password-123',
      );
      await request(reviewApp)
        .post('/api/v1/bo/signup')
        .send({ email: 'review@example.com', password: 'test-password-123', name: '중복' })
        .expect(409);
      await reviewer.get('/api/v1/bo/me').expect(200);
      await reviewer.post('/api/v1/bo/logout').expect(200);
      await reviewer.get('/api/v1/bo/me').expect(401);
      await reviewer
        .post('/api/v1/bo/login')
        .send({ email: 'review@example.com', password: 'wrong-password' })
        .expect(401);
      await reviewer
        .post('/api/v1/bo/login')
        .send({ email: 'review@example.com', password: 'test-password-123' })
        .expect(200);
      await otherReviewer
        .post('/api/v1/bo/signup')
        .send({ email: 'other@example.com', password: 'test-password-456', name: '다른 답변자' })
        .expect(201);
      const chat = await requester
        .post('/api/v1/chat')
        .send({ question: '검증을 요청할 질문' })
        .expect(200);
      const payload = {
        answerMessageId: chat.body.data.answerMessageId,
        email: 'requester@example.com',
        consent: true,
      };
      await request(reviewApp).post('/api/v1/reviews').send(payload).expect(404);
      await requester
        .post('/api/v1/reviews')
        .send({ ...payload, consent: false })
        .expect(400);
      const submitted = await requester.post('/api/v1/reviews').send(payload).expect(201);
      const postId = submitted.body.data.id;
      assert.equal(
        (await requester.post('/api/v1/reviews').send(payload).expect(201)).body.data.id,
        postId,
      );
      const listing = await reviewer.get('/api/v1/bo/reviews').expect(200);
      assert.equal(listing.body.data.total, 1);
      const detail = await reviewer.get(`/api/v1/bo/reviews/${postId}`).expect(200);
      assert.equal(detail.body.data.question, '검증을 요청할 질문');
      assert.equal(detail.body.data.aiAnswer, '검증할 AI 답변');
      assert.equal(detail.body.data.requesterEmail, undefined);
      await reviewer
        .post(`/api/v1/bo/reviews/${postId}/complete`)
        .send({ reply: '검증 전 완료 불가' })
        .expect(409);
      await reviewer
        .post(`/api/v1/bo/reviews/${postId}/claim`)
        .set('Sec-Fetch-Site', 'cross-site')
        .expect(403);
      const claims = await Promise.all([
        reviewer.post(`/api/v1/bo/reviews/${postId}/claim`),
        reviewer.post(`/api/v1/bo/reviews/${postId}/claim`),
      ]);
      assert.deepEqual(claims.map((r) => r.status).sort(), [200, 409]);
      await otherReviewer
        .post(`/api/v1/bo/reviews/${postId}/complete`)
        .send({ reply: '검증 시작 전' })
        .expect(409);
      await reviewer.post(`/api/v1/bo/reviews/${postId}/complete`).send({ reply: ' ' }).expect(400);
      const completed = await Promise.all([
        reviewer.post(`/api/v1/bo/reviews/${postId}/complete`).send({ reply: 'A의 검증 답변' }),
        reviewer.post(`/api/v1/bo/reviews/${postId}/complete`).send({ reply: 'A의 검증 답변' }),
      ]);
      assert.deepEqual(completed.map((r) => r.status).sort(), [200, 409]);
      await reviewer
        .post(`/api/v1/bo/reviews/${postId}/complete`)
        .send({ reply: '재전송' })
        .expect(409);
      await reviewer.post(`/api/v1/bo/reviews/${postId}/claim`).expect(409);
      // B sees exactly the same detail and list as before A participated.
      const otherDetail = await otherReviewer.get(`/api/v1/bo/reviews/${postId}`).expect(200);
      assert.deepEqual(otherDetail.body.data, detail.body.data);
      assert.deepEqual(
        (await otherReviewer.get('/api/v1/bo/reviews').expect(200)).body.data,
        listing.body.data,
      );
      assert.equal(
        (await otherReviewer.get('/api/v1/bo/reviews?status=REQUESTED').expect(200)).body.data
          .total,
        1,
      );
      assert.equal(
        (await otherReviewer.get('/api/v1/bo/reviews?status=COMPLETED').expect(200)).body.data
          .total,
        0,
      );
      assert.equal(
        (await reviewer.get('/api/v1/bo/reviews?status=REQUESTED').expect(200)).body.data.total,
        0,
      );
      await otherReviewer.post(`/api/v1/bo/reviews/${postId}/claim`).expect(200);
      const pendingContribution = await db.reviewContribution.findFirstOrThrow({
        where: { postId, status: 'REVIEWING' },
      });
      await requester
        .post(`/api/v1/reviews/${postId}/selection`)
        .send({ answerId: pendingContribution.id })
        .expect(404);
      assert.equal(
        (await requester.get('/api/v1/reviews').expect(200)).body.data[0].answers.length,
        1,
      );
      await otherReviewer
        .post(`/api/v1/bo/reviews/${postId}/complete`)
        .send({ reply: 'B의 검증 답변', reviewerId: signup.body.data.id })
        .expect(200);
      assert.equal(
        (await reviewer.get(`/api/v1/bo/reviews/${postId}`).expect(200)).body.data.reply,
        'A의 검증 답변',
      );
      assert.equal(
        (await otherReviewer.get(`/api/v1/bo/reviews/${postId}`).expect(200)).body.data.reply,
        'B의 검증 답변',
      );
      const result = await requester.get('/api/v1/reviews').expect(200);
      assert.deepEqual(
        result.body.data[0].answers.map((a: { reply: string }) => a.reply),
        ['A의 검증 답변', 'B의 검증 답변'],
      );
      assert.equal(result.body.data[0].selectedAnswerId, null);
      const [answerA, answerB] = result.body.data[0].answers;
      await request(reviewApp)
        .post(`/api/v1/reviews/${postId}/selection`)
        .send({ answerId: answerA.id })
        .expect(404);
      await requester
        .post(`/api/v1/reviews/${postId}/selection`)
        .send({ answerId: answerA.id })
        .expect(200);
      assert.equal(
        (await requester.get('/api/v1/reviews').expect(200)).body.data[0].selectedAnswerId,
        answerA.id,
      );
      await requester
        .post(`/api/v1/reviews/${postId}/selection`)
        .send({ answerId: answerB.id })
        .expect(200);
      assert.equal(
        (await requester.get('/api/v1/reviews').expect(200)).body.data[0].selectedAnswerId,
        answerB.id,
      );
      assert.equal(await db.reviewChoice.count({ where: { postId } }), 1);
      assert.equal(result.body.data[0].answers[0].unread, true);
      await request(reviewApp)
        .post(`/api/v1/reviews/${postId}/read`)
        .send({ answerIds: [answerA.id] })
        .expect(404);
      await requester
        .post(`/api/v1/reviews/${postId}/read`)
        .send({ answerIds: [answerA.id] })
        .expect(200);
      const readResult = await requester.get('/api/v1/reviews').expect(200);
      assert.equal(readResult.body.data[0].answers[0].unread, false);
      assert.equal(readResult.body.data[0].answers[1].unread, true);
      await requester
        .post(`/api/v1/reviews/${postId}/read`)
        .send({ answerIds: [answerA.id] })
        .expect(200);
      assert.equal(await db.foReviewRead.count(), 1);
      const originalChatId = (await requester.get('/api/v1/chat/history').expect(200)).body.data
        .sessionId;
      const newChatId = (await requester.post('/api/v1/chat/session').expect(200)).body.data
        .sessionId;
      assert.notEqual(originalChatId, newChatId);
      assert.equal(
        (await requester.get('/api/v1/chat/history').expect(200)).body.data.messages.length,
        0,
      );
      assert.equal(
        (await requester.get('/api/v1/reviews').expect(200)).body.data[0].answers.length,
        2,
      );
      const oldChats = await requester.get('/api/v1/chat/conversations').expect(200);
      assert.equal(oldChats.body.data[0].id, originalChatId);
      await request(reviewApp)
        .post(`/api/v1/chat/conversations/${originalChatId}/select`)
        .expect(404);
      await request(reviewApp)
        .post('/api/v1/chat')
        .send({ question: '다른 사람의 대화', sessionId: originalChatId })
        .expect(404);
      await requester
        .post('/api/v1/chat')
        .send({ question: '새 탭에서도 이전 대화에 질문', sessionId: originalChatId })
        .expect(200);
      assert.equal(
        (await requester.get('/api/v1/chat/history').expect(200)).body.data.messages.length,
        0,
      );
      const reopened = await requester
        .post(`/api/v1/chat/conversations/${originalChatId}/select`)
        .expect(200);
      assert.equal(reopened.body.data.messages.length, 4);
      assert.equal(
        (await requester.get('/api/v1/reviews').expect(200)).body.data[0].answers[0].unread,
        false,
      );
      const secondChat = await requester
        .post('/api/v1/chat')
        .send({ question: '다른 검증 질문' })
        .expect(200);
      const secondPost = await requester
        .post('/api/v1/reviews')
        .send({ ...payload, answerMessageId: secondChat.body.data.answerMessageId })
        .expect(201);
      await requester
        .post(`/api/v1/reviews/${secondPost.body.data.id}/selection`)
        .send({ answerId: answerA.id })
        .expect(404);
      // Selection never exposes any new metadata to other reviewers.
      assert.deepEqual(
        Object.keys(
          (await reviewer.get(`/api/v1/bo/reviews/${postId}`).expect(200)).body.data,
        ).sort(),
        ['id', 'question', 'aiAnswer', 'createdAt', 'status', 'reply', 'completedAt'].sort(),
      );
      assert.deepEqual((await request(reviewApp).get('/api/v1/reviews').expect(200)).body.data, []);
      assert.equal(
        (await reviewer.get('/api/v1/bo/reviews?status=COMPLETED').expect(200)).body.data.total,
        1,
      );
      await reviewer.get('/api/v1/bo/reviews?page=-1').expect(400);
      // Free community persists across clients and uses server-owned authorship.
      assert.equal((await reviewer.get('/api/v1/bo/me')).body.data.plan, 'FREE');
      await request(reviewApp).get('/api/v1/bo/dashboard').expect(401);
      await request(reviewApp).get('/api/v1/bo/community').expect(401);
      await request(reviewApp)
        .post('/api/v1/bo/community')
        .send({ title: 'x', content: 'y' })
        .expect(401);
      await reviewer.post('/api/v1/bo/community').send({ title: ' ', content: 'body' }).expect(400);
      await reviewer
        .post('/api/v1/bo/community')
        .send({ title: 'x'.repeat(201), content: 'body' })
        .expect(400);
      await reviewer
        .post('/api/v1/bo/community')
        .send({ title: 'valid', content: 'x'.repeat(20001) })
        .expect(400);
      await reviewer
        .post('/api/v1/bo/community')
        .set('Sec-Fetch-Site', 'cross-site')
        .send({ title: 'x', content: 'y' })
        .expect(403);
      const community = await reviewer
        .post('/api/v1/bo/community')
        .send({ title: ' Community title ', content: ' Persistent content ', authorId: 'forged' })
        .expect(201);
      const communityId = community.body.data.id;
      const shared = await otherReviewer.get(`/api/v1/bo/community/${communityId}`).expect(200);
      assert.equal(shared.body.data.title, 'Community title');
      assert.equal(shared.body.data.author.id, signup.body.data.id);
      assert.equal(shared.body.data.content, 'Persistent content');
      assert.equal(shared.body.data.author.email, undefined);
      await reviewer.get('/api/v1/bo/community?page=0').expect(400);
      await reviewer.get('/api/v1/bo/community/invalid').expect(404);
      await reviewer.get(`/api/v1/bo/community/${communityId}?page=1.5`).expect(400);
      await request(reviewApp)
        .post(`/api/v1/bo/community/${communityId}/replies`)
        .send({ content: 'reply' })
        .expect(401);
      await reviewer
        .post(`/api/v1/bo/community/${communityId}/replies`)
        .send({ content: ' ' })
        .expect(400);
      await reviewer
        .post(`/api/v1/bo/community/${communityId}/replies`)
        .send({ content: 'x'.repeat(5001) })
        .expect(400);
      await reviewer
        .post('/api/v1/bo/community/00000000-0000-4000-8000-000000000000/replies')
        .send({ content: 'reply' })
        .expect(404);
      await otherReviewer
        .post(`/api/v1/bo/community/${communityId}/replies`)
        .send({ content: ' Reply from another user ', authorId: signup.body.data.id })
        .expect(201);
      const replied = (await reviewer.get(`/api/v1/bo/community/${communityId}`).expect(200)).body
        .data;
      assert.equal(replied.replies[0].content, 'Reply from another user');
      assert.notEqual(replied.replies[0].author.id, signup.body.data.id);
      assert.equal(replied._count.replies, 1);
      await db.communityReply.createMany({
        data: Array.from({ length: 20 }, (_, i) => ({
          postId: communityId,
          authorId: signup.body.data.id,
          content: `reply ${i}`,
        })),
      });
      assert.equal(
        (await reviewer.get(`/api/v1/bo/community/${communityId}`)).body.data.replies.length,
        20,
      );
      assert.equal(
        (await reviewer.get(`/api/v1/bo/community/${communityId}?page=2`)).body.data.replies.length,
        1,
      );
      await db.communityPost.createMany({
        data: Array.from({ length: 21 }, (_, i) => ({
          authorId: signup.body.data.id,
          title: `post ${i}`,
          content: 'body',
          createdAt: new Date(Date.now() + i * 1000),
        })),
      });
      assert.equal((await reviewer.get('/api/v1/bo/community')).body.data.items.length, 20);
      assert.equal((await reviewer.get('/api/v1/bo/community?page=2')).body.data.items.length, 2);
      await db.reviewBoardPost.createMany({
        data: Array.from({ length: 6 }, (_, i) => ({
          sessionId: originalChatId,
          answerMessageId: `00000000-0000-4000-8000-00000000000${i}`,
          question: `latest ${i}`,
          aiAnswer: 'answer',
          requesterEmail: 'private@example.com',
          createdAt: new Date(Date.now() + i * 1000),
        })),
      });
      const dashboard = (await reviewer.get('/api/v1/bo/dashboard').expect(200)).body.data;
      assert.equal(dashboard.reviews.length, 5);
      assert.deepEqual(
        dashboard.reviews.map((item: { question: string }) => item.question),
        ['latest 5', 'latest 4', 'latest 3', 'latest 2', 'latest 1'],
      );
      assert.equal(dashboard.bestPosts.length, 5);
      assert.equal(dashboard.bestPosts[0].id, communityId);
      assert.equal(dashboard.bestPosts[1].title, 'post 20');
      assert.equal(dashboard.reviews[0].requesterEmail, undefined);
      await db.reviewerLoginSession.updateMany({ data: { expiresAt: new Date(0) } });
      await reviewer.get('/api/v1/bo/me').expect(401);
      await reviewer.get('/api/v1/bo/dashboard').expect(401);
      await reviewer
        .post(`/api/v1/bo/community/${communityId}/replies`)
        .send({ content: 'expired' })
        .expect(401);
    } finally {
      await db?.$disconnect();
      await socket.stop();
      await pg.close();
    }
  },
);
