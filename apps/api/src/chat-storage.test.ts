import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient, type Prisma, type ExpertLawyerProfile } from '@prisma/client';
import request from 'supertest';
import { createApp } from './app.js';
import { ChatStorage } from './chat-storage.js';
import { ChatError } from './chat.js';
import { officeSignupPolicy } from './signup-policy.js';

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
      const expert = request.agent(reviewApp);
      const otherExpert = request.agent(reviewApp);
      const signupFields = {
        betaSignupCode: '1004',
        username: 'expert_1',
        passwordConfirmation: 'test-password-123',
        lawyerProfile: {
          mobilePhone: '010-1234-5678',
          registrationNumber: '001234',
          issueNumber: 'ISSUE-2026-001',
          officeName: '테스트 법률사무소',
          address: '서울특별시 테스트로 1, 2층',
          officePhone: '02-1234-5678',
        },
        expertGroup: 'LAWYER',
        consents: officeSignupPolicy.agreements.map(({ kind, version }) => ({
          kind,
          version,
          accepted: true,
        })),
      };
      const publicPolicy = await request(reviewApp).get('/api/v1/bo/signup-policy').expect(200);
      assert.equal(publicPolicy.headers['cache-control'], 'no-store');
      assert.deepEqual(
        publicPolicy.body.data.groups
          .filter((group: { signupEnabled: boolean }) => group.signupEnabled)
          .map((group: { code: string }) => group.code),
        ['LAWYER'],
      );
      assert.equal(publicPolicy.body.data.groups.length, 4);
      await request(reviewApp).get('/api/v1/bo/reviews').expect(401);
      await expert
        .post('/api/v1/bo/signup')
        .send({ email: 'review@example.com', password: 'short', name: '답변자' })
        .expect(400);
      const signup = await expert
        .post('/api/v1/bo/signup')
        .send({
          email: 'Review@example.com',
          password: 'test-password-123',
          name: '답변자',
          ...signupFields,
        })
        .expect(201);
      assert.equal(signup.body.data.email, 'review@example.com');
      assert.equal(signup.body.data.passwordHash, undefined);
      assert.ok(
        (signup.headers['set-cookie'] as unknown as string[]).some(
          (value) => value.startsWith('qaver_expert=') && value.includes('HttpOnly'),
        ),
      );
      assert.equal(signup.body.data.expertGroup, 'LAWYER');
      assert.equal(signup.body.data.username, signupFields.username);
      assert.equal(signup.body.data.lawyerProfile, undefined);
      const lawyerProfile = await db.expertLawyerProfile.findUniqueOrThrow({
        where: { accountId: signup.body.data.id },
      });
      assert.equal(lawyerProfile.registrationNumber, '001234');
      assert.equal(lawyerProfile.issueNumber, 'ISSUE-2026-001');
      assert.equal(lawyerProfile.mobilePhone, '01012345678');
      assert.equal(lawyerProfile.officePhone, '0212345678');
      assert.equal(lawyerProfile.officeName, signupFields.lawyerProfile.officeName);
      assert.equal(lawyerProfile.address, signupFields.lawyerProfile.address);
      const savedConsents = await db.expertConsent.findMany({
        where: { accountId: signup.body.data.id },
      });
      assert.equal(savedConsents.length, 3);
      for (const document of officeSignupPolicy.agreements) {
        const saved = savedConsents.find((item) => item.kind === document.kind)!;
        assert.equal(saved.version, document.version);
        assert.deepEqual(saved.document, {
          title: document.title,
          paragraphs: document.paragraphs,
        });
        assert.ok(saved.acceptedAt.getTime() <= Date.now());
      }
      assert.ok(
        (await db.expertAccount.findUniqueOrThrow({ where: { id: signup.body.data.id } }))
          .passwordHash !== 'test-password-123',
      );
      await request(reviewApp)
        .post('/api/v1/bo/signup')
        .send({
          email: 'review@example.com',
          password: 'test-password-123',
          name: '중복',
          ...signupFields,
        })
        .expect(409);
      await expert.get('/api/v1/bo/me').expect(200);
      await expert.post('/api/v1/bo/logout').expect(200);
      await expert.get('/api/v1/bo/me').expect(401);
      await expert
        .post('/api/v1/bo/login')
        .send({ email: 'review@example.com', password: 'wrong-password' })
        .expect(401);
      await expert
        .post('/api/v1/bo/login')
        .send({ email: 'review@example.com', password: 'test-password-123' })
        .expect(200);
      await otherExpert
        .post('/api/v1/bo/signup')
        .send({
          email: 'other@example.com',
          password: 'test-password-456',
          name: '다른 답변자',
          ...signupFields,
          username: 'expert_2',
          passwordConfirmation: 'test-password-456',
        })
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
      const listing = await expert.get('/api/v1/bo/reviews').expect(200);
      assert.equal(listing.body.data.total, 1);
      const detail = await expert.get(`/api/v1/bo/reviews/${postId}`).expect(200);
      assert.equal(detail.body.data.question, '검증을 요청할 질문');
      assert.equal(detail.body.data.aiAnswer, '검증할 AI 답변');
      assert.equal(detail.body.data.requesterEmail, undefined);
      await expert
        .post(`/api/v1/bo/reviews/${postId}/complete`)
        .send({ reply: '검증 전 완료 불가' })
        .expect(409);
      await expert
        .post(`/api/v1/bo/reviews/${postId}/claim`)
        .set('Sec-Fetch-Site', 'cross-site')
        .expect(403);
      const claims = await Promise.all([
        expert.post(`/api/v1/bo/reviews/${postId}/claim`),
        expert.post(`/api/v1/bo/reviews/${postId}/claim`),
      ]);
      assert.deepEqual(claims.map((r) => r.status).sort(), [200, 409]);
      await otherExpert
        .post(`/api/v1/bo/reviews/${postId}/complete`)
        .send({ reply: '검증 시작 전' })
        .expect(409);
      await expert.post(`/api/v1/bo/reviews/${postId}/complete`).send({ reply: ' ' }).expect(400);
      const completed = await Promise.all([
        expert.post(`/api/v1/bo/reviews/${postId}/complete`).send({ reply: 'A의 검증 답변' }),
        expert.post(`/api/v1/bo/reviews/${postId}/complete`).send({ reply: 'A의 검증 답변' }),
      ]);
      assert.deepEqual(completed.map((r) => r.status).sort(), [200, 409]);
      await expert
        .post(`/api/v1/bo/reviews/${postId}/complete`)
        .send({ reply: '재전송' })
        .expect(409);
      await expert.post(`/api/v1/bo/reviews/${postId}/claim`).expect(409);
      // B sees exactly the same detail and list as before A participated.
      const otherDetail = await otherExpert.get(`/api/v1/bo/reviews/${postId}`).expect(200);
      assert.deepEqual(otherDetail.body.data, detail.body.data);
      assert.deepEqual(
        (await otherExpert.get('/api/v1/bo/reviews').expect(200)).body.data,
        listing.body.data,
      );
      assert.equal(
        (await otherExpert.get('/api/v1/bo/reviews?status=REQUESTED').expect(200)).body.data.total,
        1,
      );
      assert.equal(
        (await otherExpert.get('/api/v1/bo/reviews?status=COMPLETED').expect(200)).body.data.total,
        0,
      );
      assert.equal(
        (await expert.get('/api/v1/bo/reviews?status=REQUESTED').expect(200)).body.data.total,
        0,
      );
      await otherExpert.post(`/api/v1/bo/reviews/${postId}/claim`).expect(200);
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
      await otherExpert
        .post(`/api/v1/bo/reviews/${postId}/complete`)
        .send({ reply: 'B의 검증 답변', expertId: signup.body.data.id })
        .expect(200);
      assert.equal(
        (await expert.get(`/api/v1/bo/reviews/${postId}`).expect(200)).body.data.reply,
        'A의 검증 답변',
      );
      assert.equal(
        (await otherExpert.get(`/api/v1/bo/reviews/${postId}`).expect(200)).body.data.reply,
        'B의 검증 답변',
      );
      const result = await requester.get('/api/v1/reviews').expect(200);
      assert.equal(result.body.data[0].answers[0].expert.name, signup.body.data.name);
      assert.equal(Object.hasOwn(result.body.data[0].answers[0], 'reviewer'), false);
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
      // Selection never exposes any new metadata to other experts.
      assert.deepEqual(
        Object.keys(
          (await expert.get(`/api/v1/bo/reviews/${postId}`).expect(200)).body.data,
        ).sort(),
        ['id', 'question', 'aiAnswer', 'createdAt', 'status', 'reply', 'completedAt'].sort(),
      );
      assert.deepEqual((await request(reviewApp).get('/api/v1/reviews').expect(200)).body.data, []);
      assert.equal(
        (await expert.get('/api/v1/bo/reviews?status=COMPLETED').expect(200)).body.data.total,
        1,
      );
      await expert.get('/api/v1/bo/reviews?page=-1').expect(400);
      // Free community persists across clients and uses server-owned authorship.
      assert.equal((await expert.get('/api/v1/bo/me')).body.data.plan, 'FREE');
      await request(reviewApp).get('/api/v1/bo/dashboard').expect(401);
      await request(reviewApp).get('/api/v1/bo/community').expect(401);
      await request(reviewApp)
        .post('/api/v1/bo/community')
        .send({ title: 'x', content: 'y' })
        .expect(401);
      await expert.post('/api/v1/bo/community').send({ title: ' ', content: 'body' }).expect(400);
      await expert
        .post('/api/v1/bo/community')
        .send({ title: 'x'.repeat(201), content: 'body' })
        .expect(400);
      await expert
        .post('/api/v1/bo/community')
        .send({ title: 'valid', content: 'x'.repeat(20001) })
        .expect(400);
      await expert
        .post('/api/v1/bo/community')
        .set('Sec-Fetch-Site', 'cross-site')
        .send({ title: 'x', content: 'y' })
        .expect(403);
      const community = await expert
        .post('/api/v1/bo/community')
        .send({ title: ' Community title ', content: ' Persistent content ', authorId: 'forged' })
        .expect(201);
      const communityId = community.body.data.id;
      const shared = await otherExpert.get(`/api/v1/bo/community/${communityId}`).expect(200);
      assert.equal(shared.body.data.title, 'Community title');
      assert.equal(shared.body.data.author.id, signup.body.data.id);
      assert.equal(shared.body.data.content, 'Persistent content');
      assert.equal(shared.body.data.author.email, undefined);
      await expert.get('/api/v1/bo/community?page=0').expect(400);
      await expert.get('/api/v1/bo/community/invalid').expect(404);
      await expert.get(`/api/v1/bo/community/${communityId}?page=1.5`).expect(400);
      await request(reviewApp)
        .post(`/api/v1/bo/community/${communityId}/replies`)
        .send({ content: 'reply' })
        .expect(401);
      await expert
        .post(`/api/v1/bo/community/${communityId}/replies`)
        .send({ content: ' ' })
        .expect(400);
      await expert
        .post(`/api/v1/bo/community/${communityId}/replies`)
        .send({ content: 'x'.repeat(5001) })
        .expect(400);
      await expert
        .post('/api/v1/bo/community/00000000-0000-4000-8000-000000000000/replies')
        .send({ content: 'reply' })
        .expect(404);
      await otherExpert
        .post(`/api/v1/bo/community/${communityId}/replies`)
        .send({ content: ' Reply from another user ', authorId: signup.body.data.id })
        .expect(201);
      const replied = (await expert.get(`/api/v1/bo/community/${communityId}`).expect(200)).body
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
        (await expert.get(`/api/v1/bo/community/${communityId}`)).body.data.replies.length,
        20,
      );
      assert.equal(
        (await expert.get(`/api/v1/bo/community/${communityId}?page=2`)).body.data.replies.length,
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
      assert.equal((await expert.get('/api/v1/bo/community')).body.data.items.length, 20);
      assert.equal((await expert.get('/api/v1/bo/community?page=2')).body.data.items.length, 2);
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
      const dashboard = (await expert.get('/api/v1/bo/dashboard').expect(200)).body.data;
      assert.equal(dashboard.reviews.length, 5);
      assert.deepEqual(
        dashboard.reviews.map((item: { question: string }) => item.question),
        ['latest 5', 'latest 4', 'latest 3', 'latest 2', 'latest 1'],
      );
      assert.equal(dashboard.bestPosts.length, 5);
      assert.equal(dashboard.bestPosts[0].id, communityId);
      assert.equal(dashboard.bestPosts[1].title, 'post 20');
      assert.equal(dashboard.reviews[0].requesterEmail, undefined);
      // The legacy login path never backfills an asserted profession or fabricated consent.
      const accountBefore = await db.expertAccount.findUniqueOrThrow({
        where: { id: signup.body.data.id },
      });
      const legacy = await db.expertAccount.create({
        data: {
          email: 'legacy@example.com',
          name: 'Legacy',
          passwordHash: accountBefore.passwordHash,
        },
      });
      const legacyClient = request.agent(reviewApp);
      const legacyLogin = await legacyClient
        .post('/api/v1/bo/login')
        .send({ email: legacy.email, password: 'test-password-123' })
        .expect(200);
      assert.equal(legacyLogin.body.data.expertGroup, null);
      assert.equal(legacyLogin.body.data.username, null);
      assert.equal(await db.expertLawyerProfile.count({ where: { accountId: legacy.id } }), 0);
      await legacyClient.get('/api/v1/bo/dashboard').expect(200);
      assert.deepEqual(await db.expertAccount.findUnique({ where: { id: legacy.id } }), legacy);
      assert.equal(await db.expertConsent.count({ where: { accountId: legacy.id } }), 0);
      // A separate app isolates signup rate limiting from the preceding scenario.
      const signupApp = createApp('Test', async () => ({ answer: '', isLegalQuestion: true }), {
        storage,
        db,
      });
      const invalidBase = {
        email: 'invalid@example.com',
        password: 'test-password-123',
        name: 'Invalid',
        ...signupFields,
        username: 'invalid_user',
      };
      for (const expertGroup of [
        undefined,
        'LABOR_ATTORNEY',
        'PATENT_ATTORNEY',
        'TAX_ACCOUNTANT',
        'UNKNOWN',
      ]) {
        const invalid = await request(signupApp)
          .post('/api/v1/bo/signup')
          .send({ ...invalidBase, expertGroup })
          .expect(400);
        assert.equal(invalid.body.error.code, 'INVALID_EXPERT_GROUP');
      }
      for (const consents of [
        undefined,
        [],
        signupFields.consents.slice(1),
        signupFields.consents.map((item) => ({ ...item, accepted: 'true' })),
        signupFields.consents.map((item) => ({ ...item, version: 'old' })),
        Array(3).fill(signupFields.consents[0]),
      ]) {
        const invalid = await request(signupApp)
          .post('/api/v1/bo/signup')
          .send({ ...invalidBase, consents })
          .expect(400);
        assert.equal(invalid.body.error.code, 'CONSENT_REQUIRED');
      }
      assert.equal(await db.expertAccount.count({ where: { email: invalidBase.email } }), 0);
      const consentCount = await db.expertConsent.count();
      const profileCount = await db.expertLawyerProfile.count();
      // A failed consent write must also roll back the newly created account.
      await pg.exec(`CREATE FUNCTION reject_test_consent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test consent failure'; END $$;
        CREATE TRIGGER test_consent BEFORE INSERT ON expert_consents FOR EACH ROW EXECUTE FUNCTION reject_test_consent();`);
      await request(signupApp).post('/api/v1/bo/signup').send(invalidBase).expect(503);
      await request(signupApp)
        .post('/api/v1/bo/signup')
        .send({ ...invalidBase, lawyerProfile: undefined })
        .expect(503);
      assert.equal(await db.expertAccount.count({ where: { email: invalidBase.email } }), 0);
      assert.equal(await db.expertConsent.count(), consentCount);
      assert.equal(await db.expertLawyerProfile.count(), profileCount);
      await pg.exec(
        'DROP TRIGGER test_consent ON expert_consents; DROP FUNCTION reject_test_consent();',
      );
      // Common-code management is explicitly privileged, with no signup privilege escalation.
      const codeFlowApp = createApp('Test', async () => ({ answer: '', isLegalQuestion: true }), {
        storage,
        db,
      });
      const forged = await request(codeFlowApp)
        .post('/api/v1/bo/signup')
        .send({
          ...invalidBase,
          email: 'no-admin@example.com',
          canManageCodes: true,
          plan: 'BUSINESS',
        })
        .expect(201);
      assert.equal(forged.body.data.canManageCodes, false);
      assert.equal(forged.body.data.plan, 'FREE');
      await request(reviewApp).get('/api/v1/bo/code-groups').expect(401);
      await request(reviewApp).post('/api/v1/bo/code-groups').send({}).expect(401);
      await otherExpert.get('/api/v1/bo/code-groups').expect(403);
      await otherExpert
        .post('/api/v1/bo/code-groups/EXPERT_GROUP/details/LAWYER')
        .send({})
        .expect(403);
      await db.expertAccount.update({
        where: { id: signup.body.data.id },
        data: { canManageCodes: true },
      });
      const groupList = await expert.get('/api/v1/bo/code-groups').expect(200);
      assert.deepEqual(
        groupList.body.data.map((item: { code: string }) => item.code),
        ['EXPERT_GROUP', 'PLAN'],
      );
      const newGroup = {
        code: 'TEST_GROUP',
        name: 'Test group',
        description: 'Description',
        sortOrder: 30,
        isActive: true,
      };
      const createdGroup = (await expert.post('/api/v1/bo/code-groups').send(newGroup).expect(201))
        .body.data;
      await expert.post('/api/v1/bo/code-groups').send(newGroup).expect(409);
      await expert
        .post('/api/v1/bo/code-groups')
        .send({ ...newGroup, code: 'invalid-code' })
        .expect(400);
      await expert
        .post('/api/v1/bo/code-groups')
        .set('Sec-Fetch-Site', 'cross-site')
        .send(newGroup)
        .expect(403);
      const newDetail = {
        code: 'FIRST',
        name: 'First',
        description: '',
        sortOrder: 10,
        isActive: true,
      };
      const createdDetail = (
        await expert.post('/api/v1/bo/code-groups/TEST_GROUP/details').send(newDetail).expect(201)
      ).body.data;
      await expert.post('/api/v1/bo/code-groups/TEST_GROUP/details').send(newDetail).expect(409);
      await expert.post('/api/v1/bo/code-groups/MISSING/details').send(newDetail).expect(404);
      await expert
        .post('/api/v1/bo/code-groups/TEST_GROUP/details/FIRST')
        .send({ ...createdDetail, isActive: 'false' })
        .expect(400);
      await expert
        .post('/api/v1/bo/code-groups/TEST_GROUP/details/FIRST')
        .send({ ...createdDetail, code: 'RENAMED' })
        .expect(400);
      await expert
        .post('/api/v1/bo/code-groups/TEST_GROUP/details/FIRST')
        .send({ ...createdDetail, isActive: false })
        .expect(200);
      await expert
        .post('/api/v1/bo/code-groups/TEST_GROUP/details/FIRST')
        .send({ ...createdDetail, name: 'Stale' })
        .expect(409);
      assert.equal(
        (await expert.get('/api/v1/bo/code-groups/TEST_GROUP/details')).body.data[0].isActive,
        false,
      );
      await expert
        .post('/api/v1/bo/code-groups/TEST_GROUP')
        .send({ ...createdGroup, name: 'Renamed group' })
        .expect(200);
      await expert
        .post('/api/v1/bo/code-groups/TEST_GROUP')
        .send({ ...createdGroup, name: 'Stale group' })
        .expect(409);
      const experts = (await expert.get('/api/v1/bo/code-groups/EXPERT_GROUP/details')).body.data;
      const lawyerCode = experts.find((item: { code: string }) => item.code === 'LAWYER');
      const updatedLawyer = (
        await expert
          .post('/api/v1/bo/code-groups/EXPERT_GROUP/details/LAWYER')
          .send({ ...lawyerCode, name: '변호사 그룹', sortOrder: 99, isActive: false })
          .expect(200)
      ).body.data;
      const changedPolicy = (await request(reviewApp).get('/api/v1/bo/signup-policy')).body.data;
      assert.equal(changedPolicy.groups.at(-1).name, '변호사 그룹');
      assert.equal(changedPolicy.groups.at(-1).signupEnabled, false);
      await request(codeFlowApp).post('/api/v1/bo/signup').send(invalidBase).expect(400);
      await expert
        .post('/api/v1/bo/code-groups/EXPERT_GROUP/details/LAWYER')
        .send({ ...updatedLawyer, isActive: true })
        .expect(200);
      const expertGroup = groupList.body.data.find(
        (item: { code: string }) => item.code === 'EXPERT_GROUP',
      );
      const inactiveGroup = (
        await expert
          .post('/api/v1/bo/code-groups/EXPERT_GROUP')
          .send({ ...expertGroup, isActive: false })
          .expect(200)
      ).body.data;
      assert.equal(
        (await request(reviewApp).get('/api/v1/bo/signup-policy')).body.data.groups.some(
          (item: { signupEnabled: boolean }) => item.signupEnabled,
        ),
        false,
      );
      await request(codeFlowApp).post('/api/v1/bo/signup').send(invalidBase).expect(400);
      await expert
        .post('/api/v1/bo/code-groups/EXPERT_GROUP')
        .send({ ...inactiveGroup, isActive: true })
        .expect(200);
      const taxCode = experts.find((item: { code: string }) => item.code === 'TAX_ACCOUNTANT');
      await expert
        .post('/api/v1/bo/code-groups/EXPERT_GROUP/details/TAX_ACCOUNTANT')
        .send({ ...taxCode, isActive: true })
        .expect(200);
      await request(codeFlowApp)
        .post('/api/v1/bo/signup')
        .send({ ...invalidBase, expertGroup: 'TAX_ACCOUNTANT' })
        .expect(400);
      const plans = (await expert.get('/api/v1/bo/code-groups/PLAN/details')).body.data;
      const freePlan = plans.find((item: { code: string }) => item.code === 'FREE');
      const disabledFree = (
        await expert
          .post('/api/v1/bo/code-groups/PLAN/details/FREE')
          .send({ ...freePlan, name: '무료', isActive: false })
          .expect(200)
      ).body.data;
      await request(codeFlowApp).post('/api/v1/bo/signup').send(invalidBase).expect(503);
      assert.equal((await expert.get('/api/v1/bo/me')).body.data.planCode.name, '무료');
      await expert
        .post('/api/v1/bo/code-groups/PLAN/details/FREE')
        .send({ ...disabledFree, isActive: true })
        .expect(200);
      await db.expertAccount.update({
        where: { id: signup.body.data.id },
        data: { canManageCodes: false },
      });
      await expert.get('/api/v1/bo/code-groups').expect(403);
      const lawyerApp = createApp('Test', async () => ({ answer: '', isLegalQuestion: true }), {
        storage,
        db,
      });
      const byUsername = request.agent(lawyerApp);
      await byUsername
        .post('/api/v1/bo/login')
        .send({ identifier: ' EXPERT_1 ', password: 'test-password-123' })
        .expect(200);
      assert.equal((await byUsername.get('/api/v1/bo/me')).body.data.id, signup.body.data.id);
      await byUsername
        .post('/api/v1/bo/login')
        .send({ identifier: 'expert_1', password: 'wrong-password' })
        .expect(401);
      const lawyerBase = {
        ...invalidBase,
        username: 'new_lawyer',
        email: 'new-lawyer@example.com',
      };
      for (const changes of [
        { passwordConfirmation: 'not-the-password' },
        { passwordConfirmation: undefined },
        { username: 'bad@id' },
        { lawyerProfile: [] },
        { lawyerProfile: { ...signupFields.lawyerProfile, mobilePhone: '1234' } },
        { lawyerProfile: { ...signupFields.lawyerProfile, officePhone: 'abc' } },
        { lawyerProfile: { ...signupFields.lawyerProfile, registrationNumber: 'x'.repeat(51) } },
        { lawyerProfile: { ...signupFields.lawyerProfile, issueNumber: 'x'.repeat(101) } },
        { lawyerProfile: { ...signupFields.lawyerProfile, officeName: 'x'.repeat(201) } },
        { lawyerProfile: { ...signupFields.lawyerProfile, address: 'x'.repeat(501) } },
        { lawyerIdImage: 'unsupported-upload' },
      ]) {
        await request(lawyerApp)
          .post('/api/v1/bo/signup')
          .send({ ...lawyerBase, ...changes })
          .expect(400);
      }
      await request(lawyerApp)
        .post('/api/v1/bo/signup')
        .send({ ...lawyerBase, username: 'EXPERT_1' })
        .expect(409);
      assert.equal(await db.expertAccount.count({ where: { email: lawyerBase.email } }), 0);
      // Beta signup requires a valid server-checked code and never writes rejected accounts.
      const betaApp = createApp('Test', undefined, { storage, db });
      const beforeRejectedBeta = {
        accounts: await db.expertAccount.count(),
        sessions: await db.expertLoginSession.count(),
        profiles: await db.expertLawyerProfile.count(),
        consents: await db.expertConsent.count(),
      };
      for (const betaSignupCode of [
        undefined,
        null,
        '',
        ' ',
        '1003',
        '01004',
        '10040',
        '1004x',
        1004,
        {},
        ['1004'],
        'x'.repeat(101),
      ]) {
        const rejected = await request(betaApp)
          .post('/api/v1/bo/signup')
          .send({ ...lawyerBase, betaSignupCode })
          .expect(400);
        assert.equal(rejected.body.error.code, 'INVALID_BETA_SIGNUP_CODE');
        assert.equal(rejected.headers['set-cookie'], undefined);
      }
      assert.deepEqual(
        {
          accounts: await db.expertAccount.count(),
          sessions: await db.expertLoginSession.count(),
          profiles: await db.expertLawyerProfile.count(),
          consents: await db.expertConsent.count(),
        },
        beforeRejectedBeta,
      );
      // With the beta code, the five basic account fields suffice; lawyer details remain optional.
      const optionalApp = createApp('Test', undefined, { storage, db });
      for (const field of ['name', 'username', 'email', 'password', 'passwordConfirmation']) {
        await request(optionalApp)
          .post('/api/v1/bo/signup')
          .send({ ...lawyerBase, lawyerProfile: undefined, [field]: undefined })
          .expect(400);
      }
      const profiles = [
        undefined,
        null,
        {},
        {
          mobilePhone: '',
          registrationNumber: ' ',
          issueNumber: '',
          officeName: '',
          address: '',
          officePhone: '',
        },
        { registrationNumber: '001234' },
      ];
      for (const [index, profile] of profiles.entries()) {
        const minimalClient = request.agent(optionalApp);
        const minimal = await minimalClient
          .post('/api/v1/bo/signup')
          .send({
            ...lawyerBase,
            username: `minimal_${index}`,
            email: `minimal-${index}@example.com`,
            lawyerProfile: profile,
            betaSignupCode: index === 0 ? ' 1004 ' : '1004',
          })
          .expect(201);
        const saved: Prisma.ExpertAccountGetPayload<{ include: { lawyerProfile: true } }> =
          await db.expertAccount.findUniqueOrThrow({
            where: { id: minimal.body.data.id },
            include: { lawyerProfile: true },
          });
        assert.equal(saved.betaSignupCode, '1004');
        assert.equal(minimal.body.data.betaSignupCode, undefined);
        assert.equal(
          (await minimalClient.get('/api/v1/bo/me').expect(200)).body.data.betaSignupCode,
          undefined,
        );
        assert.ok(saved.lawyerProfile);
        assert.equal(saved.lawyerProfile.accountId, saved.id);
        assert.deepEqual(
          {
            mobilePhone: saved.lawyerProfile.mobilePhone,
            registrationNumber: saved.lawyerProfile.registrationNumber,
            issueNumber: saved.lawyerProfile.issueNumber,
            officeName: saved.lawyerProfile.officeName,
            address: saved.lawyerProfile.address,
            officePhone: saved.lawyerProfile.officePhone,
          },
          {
            mobilePhone: null,
            registrationNumber: index === profiles.length - 1 ? '001234' : null,
            issueNumber: null,
            officeName: null,
            address: null,
            officePhone: null,
          },
        );
        assert.equal(await db.expertLawyerProfile.count({ where: { accountId: saved.id } }), 1);
        if (index === 0) {
          const completedProfile: ExpertLawyerProfile = await db.expertLawyerProfile.update({
            where: { accountId: saved.id },
            data: { registrationNumber: '001234', officeName: 'Updated office' },
          });
          assert.equal(completedProfile.accountId, saved.id);
          assert.equal(completedProfile.registrationNumber, '001234');
          assert.equal(await db.expertLawyerProfile.count({ where: { accountId: saved.id } }), 1);
        }
      }
      for (const identifier of ['minimal_0', 'minimal-0@example.com']) {
        const loggedIn = await request(optionalApp)
          .post('/api/v1/bo/login')
          .send({ identifier, password: lawyerBase.password })
          .expect(200);
        assert.equal(loggedIn.body.data.betaSignupCode, undefined);
      }
      // The prelaunch cleanup accepts only the expert cookie; logout revokes its session.
      const newToken = 'b'.repeat(64);
      const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
      const expiresAt = new Date(Date.now() + 60000);
      await db.expertLoginSession.create({
        data: { accountId: signup.body.data.id, tokenHash: tokenHash(newToken), expiresAt },
      });
      await request(reviewApp)
        .get('/api/v1/bo/me')
        .set('Cookie', `qaver_reviewer=${newToken}`)
        .expect(401);
      await request(reviewApp)
        .get('/api/v1/bo/dashboard')
        .set('Cookie', `qaver_expert=${newToken}`)
        .expect(200);
      const loggedOut = await request(reviewApp)
        .post('/api/v1/bo/logout')
        .set('Cookie', `qaver_expert=${newToken}`)
        .expect(200);
      assert.ok(
        (loggedOut.headers['set-cookie'] as unknown as string[]).some((value) =>
          value.startsWith('qaver_expert=;'),
        ),
      );
      assert.equal(
        await db.expertLoginSession.count({
          where: { tokenHash: tokenHash(newToken) },
        }),
        0,
      );
      await request(reviewApp)
        .get('/api/v1/bo/me')
        .set('Cookie', `qaver_expert=${newToken}`)
        .expect(401);
      await db.expertLoginSession.updateMany({ data: { expiresAt: new Date(0) } });
      await expert.get('/api/v1/bo/me').expect(401);
      await expert.get('/api/v1/bo/dashboard').expect(401);
      await expert
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
