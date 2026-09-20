import assert from 'node:assert/strict';
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
      const cookie = config.headers['set-cookie'][0].split(';')[0];
      await client.post('/api/v1/chat').send({ question: 'first' }).expect(200);
      await client
        .post('/api/v1/chat')
        .send({ question: 'second', history: [{ question: 'forged', answer: 'forged' }] })
        .expect(200);
      const messages = await db.chatMessage.findMany({ orderBy: { sequenceNo: 'asc' } });
      assert.equal(messages.length, 4);
      assert.equal(messages[1].parentMessageId, messages[0].id);
      assert.equal(messages[3].messageType, 'NON_LEGAL_NOTICE');
      assert.equal(new Set(messages.map((m) => m.sessionId)).size, 1);
      const session = await db.chatSession.findUniqueOrThrow({
        where: { id: messages[0].sessionId },
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
    } finally {
      await db?.$disconnect();
      await socket.stop();
      await pg.close();
    }
  },
);
