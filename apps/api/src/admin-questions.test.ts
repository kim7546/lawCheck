import assert from 'node:assert/strict';
import { randomUUID, scryptSync } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { AdminQuestionsPage, AdminQuestionStatistics } from '@lawcheck/contracts';
import { createApp } from './app.js';
import { ChatStorage } from './chat-storage.js';

test(
  'admin questions: authorization, Korea date boundaries, all answers, pagination and topic totals',
  { timeout: 60000 },
  async () => {
    const pg = new PGlite({ extensions: { btree_gist } });
    const socket = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 0 });
    let db: PrismaClient | undefined;
    try {
      const base = new URL('../prisma/migrations/', import.meta.url);
      for (const entry of (await readdir(base, { withFileTypes: true }))
        .filter((item) => item.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name)))
        await pg.exec(await readFile(new URL(`${entry.name}/migration.sql`, base), 'utf8'));
      await socket.start();
      db = new PrismaClient({
        datasources: {
          db: {
            url: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?connection_limit=1&sslmode=disable`,
          },
        },
      });
      const salt = 'a'.repeat(32);
      const password = 'test-password-123';
      const adminUser = await db.expertAccount.create({
        data: {
          email: 'questions-admin@example.com',
          name: '관리자',
          username: 'questions_admin',
          passwordHash: `${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
          adminProfile: { create: {} },
        },
      });
      const secondExpert = await db.expertAccount.create({
        data: {
          email: 'questions-expert@example.com',
          name: '두 번째 전문가',
          passwordHash: adminUser.passwordHash,
        },
      });
      const office = await db.lawOffice.create({
        data: { code: 'QUESTIONS', name: '질문 테스트' },
      });
      const session = await db.chatSession.create({
        data: {
          lawOfficeId: office.id,
          sessionTokenHash: 'b'.repeat(64),
          expiresAt: new Date('2030-01-01'),
        },
      });
      let sequenceNo = 0;
      const makeQuestion = (
        content: string,
        createdAt = '2026-01-01T01:00:00Z',
        processingStatus: 'COMPLETED' | 'FAILED' | 'PROCESSING' = 'COMPLETED',
      ) =>
        db!.chatMessage.create({
          data: {
            lawOfficeId: office.id,
            sessionId: session.id,
            sequenceNo: ++sequenceNo,
            role: 'USER',
            messageType: 'USER_QUESTION',
            content,
            createdAt: new Date(createdAt),
            processingStatus,
          },
        });
      const makeAnswer = (parentMessageId: string, content: string, notice = false) =>
        db!.chatMessage.create({
          data: {
            lawOfficeId: office.id,
            sessionId: session.id,
            sequenceNo: ++sequenceNo,
            role: 'ASSISTANT',
            messageType: notice ? 'NON_LEGAL_NOTICE' : 'AI_ANSWER',
            parentMessageId,
            content,
            processingStatus: 'COMPLETED',
            createdAt: new Date('2026-01-03T00:00:00Z'),
          },
        });
      const before = await makeQuestion('전세 범위 이전', '2025-12-31T14:59:59.999Z');
      const estate = await makeQuestion(
        '집주인이 보증금을 돌려주지 않아요.\n계약이 끝났습니다.',
        '2025-12-31T15:00:00Z',
      );
      const ai = await makeAnswer(estate.id, 'AI 전체 답변\n두 번째 줄');
      const anotherAi = await makeAnswer(estate.id, '추가 AI 답변');
      await makeQuestion('퇴사 후 급여 체불');
      const nonLegal = await makeQuestion('임대차라는 단어로 노래를 지어 줘');
      await makeAnswer(nonLegal.id, '법률 질문을 입력해 주세요.', true);
      const failed = await makeQuestion('답변이 실패한 질문', undefined, 'FAILED');
      await makeQuestion('가족 간 상속 분쟁');
      await makeQuestion('사기 고소를 하려 합니다');
      await makeQuestion('사업자 부가세 신고');
      await makeQuestion('빌려준 돈을 받는 지급명령');
      const unknown = await makeQuestion('그 다음에는 어떻게 하나요?', undefined, 'PROCESSING');
      for (let i = 0; i < 12; i++) await makeQuestion(`추가 문의 ${i}`);
      const nextDay = await makeQuestion('부동산 다음 날 질문', '2026-01-01T15:00:00Z');
      const yearEnd = await makeQuestion('올해 마지막 질문', '2026-12-31T14:59:59.999Z');
      const nextYear = await makeQuestion('다음 해 질문', '2026-12-31T15:00:00Z');
      const post = await db.reviewBoardPost.create({
        data: {
          sessionId: session.id,
          answerMessageId: ai.id,
          question: estate.content,
          aiAnswer: ai.content,
          requesterEmail: 'private@example.com',
        },
      });
      await db.reviewContribution.create({
        data: {
          postId: post.id,
          expertId: adminUser.id,
          status: 'COMPLETED',
          reply: '전문가 답변 하나',
          completedAt: new Date('2026-02-01'),
        },
      });
      await db.reviewContribution.create({
        data: {
          postId: post.id,
          expertId: secondExpert.id,
          status: 'COMPLETED',
          reply: '전문가 답변 둘',
          completedAt: new Date('2026-02-02'),
        },
      });
      const unrelated = await db.reviewBoardPost.create({
        data: {
          sessionId: randomUUID(),
          answerMessageId: randomUUID(),
          question: '관계없는 질문',
          aiAnswer: '다른 답변',
          requesterEmail: 'another@example.com',
        },
      });
      await db.reviewContribution.create({
        data: {
          postId: unrelated.id,
          expertId: adminUser.id,
          status: 'COMPLETED',
          reply: '연결되면 안 되는 답변',
          completedAt: new Date('2026-02-01'),
        },
      });

      const app = createApp('Test', undefined, { db, storage: new ChatStorage(db, 'QUESTIONS') });
      const admin = request.agent(app);
      const range = 'startDate=2026-01-01&endDate=2026-01-01';
      for (const path of ['/questions', '/question-statistics']) {
        await request(app).get(`/api/v1/admin${path}?${range}`).expect(401);
      }
      const expert = request.agent(app);
      await expert
        .post('/api/v1/bo/login')
        .send({ identifier: secondExpert.email, password })
        .expect(200);
      await expert.get('/api/v1/admin/questions').expect(401);
      await expert.get('/api/v1/admin/question-statistics').expect(401);
      await admin
        .post('/api/v1/admin/login')
        .send({ identifier: adminUser.email, password })
        .expect(200);
      const response = await admin.get(`/api/v1/admin/questions?${range}`).expect(200);
      assert.equal(response.headers['cache-control'], 'no-store');
      const first = response.body.data as AdminQuestionsPage;
      const second = (await admin.get(`/api/v1/admin/questions?${range}&page=2`).expect(200)).body
        .data as AdminQuestionsPage;
      assert.equal(first.total, 21);
      assert.equal(first.items.length, 20);
      assert.equal(second.items.length, 1);
      const all = [...first.items, ...second.items];
      assert.equal(new Set(all.map((item) => item.id)).size, 21);
      assert.ok(
        !all.some((item) => [before.id, nextDay.id, yearEnd.id, nextYear.id].includes(item.id)),
      );
      assert.equal(first.startDate, '2026-01-01');
      assert.equal(first.endDate, '2026-01-01');
      const saved = all.find((item) => item.id === estate.id)!;
      assert.equal(saved.content, estate.content);
      assert.equal(saved.topic, 'realEstate');
      assert.deepEqual(
        saved.answers.map((item) => item.content),
        ['AI 전체 답변\n두 번째 줄', '전문가 답변 하나', '전문가 답변 둘', '추가 AI 답변'],
      );
      assert.ok(saved.answers.some((item) => item.id === anotherAi.id));
      assert.equal(all.find((item) => item.id === failed.id)?.answers.length, 0);
      assert.equal(all.find((item) => item.id === unknown.id)?.processingStatus, 'PROCESSING');
      assert.equal(all.find((item) => item.id === nonLegal.id)?.topic, 'nonLegal');
      assert.ok(!JSON.stringify(first).includes('requesterEmail'));
      const stats = (await admin.get(`/api/v1/admin/question-statistics?${range}`).expect(200)).body
        .data as AdminQuestionStatistics;
      assert.equal(stats.total, 21);
      assert.equal(
        stats.topics.reduce((sum, item) => sum + item.count, 0),
        21,
      );
      for (const item of stats.topics) {
        assert.equal(item.count, all.filter((question) => question.topic === item.topic).length);
        assert.equal(item.percentage, Math.round((item.count / 21) * 1000) / 10);
      }
      assert.equal(stats.topics.find((item) => item.topic === 'other')?.count, 14);
      const annual = (await admin.get('/api/v1/admin/question-statistics?year=2026').expect(200))
        .body.data;
      assert.equal(annual.total, 23);
      const crossYear = (
        await admin
          .get('/api/v1/admin/questions?startDate=2025-12-31&endDate=2026-01-01')
          .expect(200)
      ).body.data;
      assert.equal(crossYear.total, 22);
      const empty = (await admin.get('/api/v1/admin/question-statistics?year=2024').expect(200))
        .body.data as AdminQuestionStatistics;
      assert.equal(empty.total, 0);
      assert.ok(empty.topics.every((item) => item.count === 0 && item.percentage === 0));
      const emptyList = (await admin.get('/api/v1/admin/questions?year=2024').expect(200)).body
        .data;
      assert.equal(emptyList.total, 0);
      assert.deepEqual(emptyList.items, []);
      for (const invalid of [
        'year=bad',
        'year=2026&year=2025',
        'startDate=2026-02-30&endDate=2026-03-01',
        'startDate=2026-02-01',
        'startDate=2026-02-01&endDate=2026-01-01',
        `${range}&year=2026`,
      ]) {
        await admin.get(`/api/v1/admin/questions?${invalid}`).expect(400);
        await admin.get(`/api/v1/admin/question-statistics?${invalid}`).expect(400);
      }
      await admin.get(`/api/v1/admin/questions?${range}&page=0`).expect(400);
      await admin.get(`/api/v1/admin/questions?${range}&page=1.5`).expect(400);
      await db.expertAdminProfile.update({
        where: { accountId: adminUser.id },
        data: { isActive: false },
      });
      await admin.get('/api/v1/admin/questions').expect(403);
      await admin.get('/api/v1/admin/question-statistics').expect(403);
    } finally {
      await db?.$disconnect();
      await socket.stop();
      await pg.close();
    }
  },
);
