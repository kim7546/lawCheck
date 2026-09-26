import assert from 'node:assert/strict';
import { randomUUID, scryptSync } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from './app.js';
import { ChatStorage } from './chat-storage.js';
import { officeSignupPolicy } from './signup-policy.js';
import { bootstrapAdmin } from './admin-bootstrap.js';

test(
  'platform admin: isolated auth, live metrics, dual roles, users, codes and BO menus',
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
            url: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?connection_limit=1&sslmode=disable`,
          },
        },
      });
      const salt = 'a'.repeat(32);
      const password = 'test-password-123';
      const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
      const adminUser = await db.expertAccount.create({
        data: {
          email: 'admin@example.com',
          username: 'admin',
          name: '운영 관리자',
          passwordHash,
          adminProfile: { create: {} },
        },
      });
      const dualUser = await db.expertAccount.create({
        data: {
          email: 'dual@example.com',
          username: 'dual',
          name: '겸임 관리자',
          passwordHash,
          expertGroup: 'LAWYER',
          lawyerProfile: { create: { officeName: '테스트 사무소' } },
          adminProfile: { create: {} },
        },
      });
      const expertUser = await db.expertAccount.create({
        data: {
          email: 'expert@example.com',
          username: 'expert',
          name: '전문가',
          passwordHash,
          expertGroup: 'LAWYER',
          lawyerProfile: { create: {} },
          canManageCodes: true,
        },
      });
      await db.lawOffice.create({ data: { code: 'LAW001', name: 'Test' } });
      const app = createApp(
        'Test',
        async () => ({ answer: '검증 대상 답변', isLegalQuestion: true }),
        { db, storage: new ChatStorage(db) },
      );
      const admin = request.agent(app);
      const dual = request.agent(app);
      const expert = request.agent(app);
      const reader = request.agent(app);
      for (const path of ['/me', '/summary', '/users', '/menus', '/code-groups'])
        await request(app).get(`/api/v1/admin${path}`).expect(401);
      await request(app).post(`/api/v1/admin/users/${expertUser.id}`).send({}).expect(401);
      await request(app).post('/api/v1/admin/menus/community').send({}).expect(401);
      await expert.post('/api/v1/bo/login').send({ identifier: 'expert', password }).expect(200);
      await expert.get('/api/v1/admin/users').expect(401);
      await expert.post('/api/v1/admin/login').send({ identifier: 'expert', password }).expect(401);
      await admin
        .post('/api/v1/admin/login')
        .send({ identifier: 'admin', password: 'wrong-password-123' })
        .expect(401);
      await admin
        .post('/api/v1/admin/login')
        .set('Sec-Fetch-Site', 'cross-site')
        .send({ identifier: 'admin', password })
        .expect(403);
      const login = await admin
        .post('/api/v1/admin/login')
        .send({ identifier: 'ADMIN', password })
        .expect(200);
      const cookies = login.headers['set-cookie'] as unknown as string[];
      assert.ok(cookies[0]?.includes('Path=/api/v1/admin'));
      assert.ok(cookies[0]?.includes('HttpOnly'));
      assert.ok(cookies[0]?.includes('SameSite=Strict'));
      assert.equal(login.body.data.passwordHash, undefined);
      await admin.get('/api/v1/bo/me').expect(401);
      await dual.post('/api/v1/bo/login').send({ identifier: 'dual', password }).expect(200);
      await dual
        .post('/api/v1/admin/login')
        .send({ identifier: 'dual@example.com', password })
        .expect(200);
      await dual.get('/api/v1/bo/me').expect(200);
      await dual.get('/api/v1/admin/me').expect(200);
      const empty = (await admin.get('/api/v1/admin/summary?days=7').expect(200)).body.data;
      assert.equal(empty.completionRate, null);
      assert.equal(empty.averageHours, null);
      assert.equal(empty.daily.length, 7);
      await admin.get('/api/v1/admin/summary?days=31').expect(400);

      await reader.post('/api/v1/chat').send({ question: '첫 질문' }).expect(200);
      await reader.post('/api/v1/chat').send({ question: '두 번째 질문' }).expect(200);
      const ago = (hours: number) => new Date(Date.now() - hours * 3600000);
      const makePost = (hours: number) =>
        db!.reviewBoardPost.create({
          data: {
            sessionId: randomUUID(),
            answerMessageId: randomUUID(),
            question: '통계 테스트',
            aiAnswer: '답변',
            requesterEmail: 'reader@example.com',
            createdAt: ago(hours),
          },
        });
      const done = await makePost(60);
      await makePost(72);
      const working = await makePost(96);
      const old = await makePost(24 * 100);
      const answer = await db.reviewContribution.create({
        data: {
          postId: done.id,
          expertId: dualUser.id,
          status: 'COMPLETED',
          reply: '완료 답변 1',
          createdAt: ago(59),
          completedAt: new Date(done.createdAt.getTime() + 2 * 3600000),
        },
      });
      await db.reviewContribution.create({
        data: {
          postId: done.id,
          expertId: expertUser.id,
          status: 'COMPLETED',
          reply: '완료 답변 2',
          createdAt: ago(59),
          completedAt: new Date(done.createdAt.getTime() + 5 * 3600000),
        },
      });
      await db.reviewContribution.create({ data: { postId: done.id, expertId: adminUser.id } });
      await db.reviewContribution.create({ data: { postId: working.id, expertId: expertUser.id } });
      await db.reviewContribution.create({
        data: {
          postId: old.id,
          expertId: expertUser.id,
          status: 'COMPLETED',
          reply: '이전 기간',
          completedAt: ago(24 * 99),
        },
      });
      await db.reviewChoice.create({ data: { postId: done.id, contributionId: answer.id } });
      const summary = (await admin.get('/api/v1/admin/summary?days=7').expect(200)).body.data;
      assert.deepEqual(
        [
          summary.questions,
          summary.requests,
          summary.verified,
          summary.waiting,
          summary.reviewing,
          summary.overdue,
          summary.completedAnswers,
          summary.selectedAnswers,
        ],
        [2, 3, 1, 1, 1, 2, 2, 1],
      );
      assert.equal(summary.completionRate, 33.3);
      assert.equal(summary.selectionRate, 100);
      assert.equal(summary.averageHours, 2);
      assert.equal(summary.activeExperts, 3);
      assert.equal(
        summary.daily.reduce((n: number, d: { questions: number }) => n + d.questions, 0),
        2,
      );
      assert.equal(
        summary.daily.reduce((n: number, d: { verified: number }) => n + d.verified, 0),
        1,
      );
      assert.equal(summary.experts.find((u: { id: string }) => u.id === dualUser.id).selected, 1);
      assert.equal((await admin.get('/api/v1/admin/summary?days=90')).body.data.daily.length, 90);

      const list = await admin
        .get('/api/v1/admin/users?search=DUAL&group=LAWYER&role=admin')
        .expect(200);
      assert.equal(list.headers['cache-control'], 'no-store');
      assert.equal(list.body.data.total, 1);
      assert.equal(list.body.data.items[0].passwordHash, undefined);
      assert.equal(list.body.data.items[0].lawyerProfile.officeName, '테스트 사무소');
      await admin.get('/api/v1/admin/users?page=-1').expect(400);
      const payload = {
        name: expertUser.name,
        plan: 'PRO',
        isActive: true,
        isAdmin: true,
        updatedAt: expertUser.updatedAt.toISOString(),
      };
      await admin
        .post(`/api/v1/admin/users/${expertUser.id}`)
        .set('Sec-Fetch-Site', 'cross-site')
        .send(payload)
        .expect(403);
      await admin
        .post(`/api/v1/admin/users/${expertUser.id}`)
        .send({ ...payload, plan: 'MISSING' })
        .expect(400);
      const promoted = (
        await admin.post(`/api/v1/admin/users/${expertUser.id}`).send(payload).expect(200)
      ).body.data;
      assert.equal(promoted.expertGroup, 'LAWYER');
      assert.equal(promoted.adminProfile.isActive, true);
      assert.ok(await db.expertLawyerProfile.findUnique({ where: { accountId: expertUser.id } }));
      await admin.post(`/api/v1/admin/users/${expertUser.id}`).send(payload).expect(409);
      await expert.post('/api/v1/admin/login').send({ identifier: 'expert', password }).expect(200);
      const revoked = (
        await admin
          .post(`/api/v1/admin/users/${expertUser.id}`)
          .send({ ...payload, isAdmin: false, updatedAt: promoted.updatedAt })
          .expect(200)
      ).body.data;
      await expert.get('/api/v1/admin/users').expect(401);
      await expert.get('/api/v1/bo/me').expect(200);
      await admin
        .post(`/api/v1/admin/users/${expertUser.id}`)
        .send({ ...payload, isActive: false, isAdmin: false, updatedAt: revoked.updatedAt })
        .expect(200);
      await expert.get('/api/v1/bo/me').expect(401);
      await expert.post('/api/v1/bo/login').send({ identifier: 'expert', password }).expect(401);
      await admin
        .post(`/api/v1/admin/users/${adminUser.id}`)
        .send({ ...payload, isAdmin: false, updatedAt: adminUser.updatedAt.toISOString() })
        .expect(409);

      const group = (
        await admin
          .post('/api/v1/admin/code-groups')
          .send({
            code: 'ADMIN_TEST',
            name: '테스트',
            description: '',
            sortOrder: 0,
            isActive: true,
          })
          .expect(201)
      ).body.data;
      await admin
        .post('/api/v1/admin/code-groups/ADMIN_TEST')
        .send({ ...group, name: '수정 그룹' })
        .expect(200);
      const menus = (await admin.get('/api/v1/admin/menus').expect(200)).body.data;
      const community = menus.find((m: { key: string }) => m.key === 'community');
      const home = menus.find((m: { key: string }) => m.key === 'dashboard');
      await admin
        .post('/api/v1/admin/menus/dashboard')
        .send({ ...home, isActive: false })
        .expect(400);
      await admin
        .post('/api/v1/admin/menus/community')
        .send({ ...community, isActive: false })
        .expect(200);
      await admin
        .post('/api/v1/admin/menus/community')
        .send({ ...community, label: '오래된 수정' })
        .expect(409);
      await admin
        .post('/api/v1/admin/menus/reviews')
        .send({
          ...menus.find((m: { key: string }) => m.key === 'reviews'),
          label: '전문가 검증',
          sortOrder: 1,
        })
        .expect(200);
      const shown = (await dual.get('/api/v1/bo/menus').expect(200)).body.data;
      assert.deepEqual(
        shown.map((m: { key: string }) => m.key),
        ['reviews', 'dashboard'],
      );
      assert.equal(shown[0].label, '전문가 검증');

      const forged = await request(app)
        .post('/api/v1/bo/signup')
        .send({
          name: '일반회원',
          email: 'new@example.com',
          username: 'new_user',
          betaSignupCode: '1004',
          password,
          passwordConfirmation: password,
          expertGroup: 'LAWYER',
          consents: officeSignupPolicy.agreements.map(({ kind, version }) => ({
            kind,
            version,
            accepted: true,
          })),
          isAdmin: true,
          adminProfile: { create: { isActive: true } },
        })
        .expect(201);
      assert.equal(
        await db.expertAdminProfile.count({ where: { accountId: forged.body.data.id } }),
        0,
      );
      await db.expertAdminProfile.update({
        where: { accountId: dualUser.id },
        data: { isActive: false },
      });
      await dual.get('/api/v1/admin/summary').expect(403);
      await dual.get('/api/v1/bo/me').expect(200);
      await db.adminLoginSession.updateMany({
        where: { accountId: adminUser.id },
        data: { expiresAt: ago(1) },
      });
      await admin.get('/api/v1/admin/me').expect(401);
      await admin.post('/api/v1/admin/login').send({ identifier: 'admin', password }).expect(200);
      await admin.post('/api/v1/admin/logout').expect(200);
      await admin.get('/api/v1/admin/me').expect(401);
      for (let i = 0; i < 10; i++)
        await request(app).post('/api/v1/admin/login').send({ identifier: 'missing', password });
      await request(app)
        .post('/api/v1/admin/login')
        .send({ identifier: 'missing', password })
        .expect(429);
      const beforeBootstrap = await db.expertAccount.findUniqueOrThrow({
        where: { id: forged.body.data.id },
        include: { lawyerProfile: true },
      });
      const accountCount = await db.expertAccount.count();
      const adminCount = await db.expertAdminProfile.count();
      await bootstrapAdmin(db, undefined);
      await bootstrapAdmin(db, '   ');
      await assert.rejects(bootstrapAdmin(db, 'invalid-email'), /valid existing BO email/);
      await assert.rejects(bootstrapAdmin(db, 'missing@example.com'), /no existing BO account/);
      await assert.rejects(bootstrapAdmin(db, expertUser.email), /inactive BO account/);
      await assert.rejects(bootstrapAdmin(db, dualUser.email), /revoked admin/);
      assert.equal(await db.expertAccount.count(), accountCount);
      assert.equal(await db.expertAdminProfile.count(), adminCount);
      await bootstrapAdmin(db, '  NEW@EXAMPLE.COM  ');
      const linked = await db.expertAccount.findUniqueOrThrow({
        where: { id: forged.body.data.id },
        include: { lawyerProfile: true },
      });
      assert.deepEqual({ ...linked, updatedAt: beforeBootstrap.updatedAt }, beforeBootstrap);
      const profile = await db.expertAdminProfile.findUniqueOrThrow({
        where: { accountId: linked.id },
      });
      assert.equal(profile.isActive, true);
      await bootstrapAdmin(db, linked.email);
      assert.deepEqual(
        await db.expertAdminProfile.findUniqueOrThrow({ where: { accountId: linked.id } }),
        profile,
      );
      assert.equal(await db.expertAccount.count(), accountCount);
      const linkedLogin = request.agent(createApp('Test', undefined, { db }));
      await linkedLogin
        .post('/api/v1/admin/login')
        .send({ identifier: linked.username, password })
        .expect(200);

      const runNode = async (args: string[], env: Record<string, string> = {}) => {
        // The isolated socket server allows one client at a time.
        await db!.$disconnect();
        await pg.exec('DEALLOCATE ALL');
        try {
          return await promisify(execFile)(process.execPath, args, {
            timeout: 10000,
            env: {
              ...process.env,
              NODE_ENV: 'production',
              DATABASE_URL: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?connection_limit=1&sslmode=disable`,
              ADMIN_EMAIL: 'cli@example.com',
              // Legacy values must never create a user or overwrite their credentials.
              ADMIN_USERNAME: 'must_not_replace',
              ADMIN_PASSWORD: password,
              ADMIN_NAME: 'must_not_replace',
              ...env,
            },
          });
        } finally {
          await pg.exec('DEALLOCATE ALL');
        }
      };
      const provision = (args: string[], env?: Record<string, string>) =>
        runNode(
          [fileURLToPath(new URL('../prisma/admin-account.mjs', import.meta.url)), ...args],
          env,
        );
      await assert.rejects(provision(['create']), /New accounts cannot be created here/);
      await assert.rejects(provision(['grant']), /Existing BO account not found/);
      await assert.rejects(
        provision(['grant', 'missing@example.com']),
        /Existing BO account not found/,
      );
      await assert.rejects(
        provision(['grant'], { ADMIN_EMAIL: 'invalid-email' }),
        /valid existing BO email/,
      );
      await assert.rejects(provision(['grant', expertUser.email]), /Activate the account/);
      // A deployment must exit with an error before listening when ADMIN_EMAIL is not a BO member.
      await assert.rejects(
        runNode(['--import', 'tsx', fileURLToPath(new URL('./server.deploy.ts', import.meta.url))]),
        (error: unknown) => {
          const failure = error as { code?: number; stderr?: string; stdout?: string };
          assert.equal(failure.code, 1);
          assert.match(failure.stderr ?? '', /ADMIN_EMAIL has no existing BO account/);
          assert.ok(!failure.stdout?.includes('LawCheck API:'));
          assert.ok(!failure.stderr?.includes(password));
          return true;
        },
      );
      assert.equal(await db.expertAccount.count(), accountCount);
      assert.equal(
        await db.expertAccount.findUnique({ where: { email: 'cli@example.com' } }),
        null,
      );
      await provision(['revoke', linked.email]);
      await assert.rejects(bootstrapAdmin(db, linked.email), /revoked admin/);
      assert.equal(
        (await db.expertAdminProfile.findUniqueOrThrow({ where: { accountId: linked.id } }))
          .isActive,
        false,
      );
      await assert.rejects(provision(['revoke', 'admin@example.com']));
      const granted = await provision(['grant'], { ADMIN_EMAIL: '  NEW@EXAMPLE.COM  ' });
      assert.ok(!granted.stdout.includes(password));
      await provision(['grant', linked.email]);
      assert.equal(
        (await db.expertAdminProfile.findUniqueOrThrow({ where: { accountId: linked.id } }))
          .isActive,
        true,
      );
      const afterGrant = await db.expertAccount.findUniqueOrThrow({
        where: { id: linked.id },
        include: { lawyerProfile: true },
      });
      assert.deepEqual({ ...afterGrant, updatedAt: beforeBootstrap.updatedAt }, beforeBootstrap);
    } finally {
      await db?.$disconnect();
      await socket.stop();
      await pg.close();
    }
  },
);
