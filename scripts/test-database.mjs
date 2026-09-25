import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const migrations = new URL('../apps/api/prisma/migrations/', import.meta.url);
const db = new PGlite({ extensions: { btree_gist } });
try {
  const directories = (await readdir(migrations, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const [index, directory] of directories.entries()) {
    if (directory === '202609240002_individual_reviews') {
      await db.exec(`
        INSERT INTO reviewer_accounts(id,email,name,password_hash) VALUES
          ('00000000-0000-4000-8000-000000000001','migration@example.com','Legacy reviewer','test');
        INSERT INTO review_board_posts(id,session_id,answer_message_id,question,ai_answer,requester_email,status,reviewer_id,reply,completed_at) VALUES
          ('00000000-0000-4000-8000-000000000002',gen_random_uuid(),gen_random_uuid(),'Q','AI','q@example.com','COMPLETED','00000000-0000-4000-8000-000000000001','Existing reply',now()),
          ('00000000-0000-4000-8000-000000000003',gen_random_uuid(),gen_random_uuid(),'Q2','AI2','q@example.com','REVIEWING','00000000-0000-4000-8000-000000000001',NULL,NULL);
      `);
    }
    await db.exec(await readFile(new URL(`${directory}/migration.sql`, migrations), 'utf8'));
    if (index === 0) {
      await db.exec(`INSERT INTO law_offices (id,code,name,is_active,updated_at)
        VALUES (gen_random_uuid(),'UPGRADE_TEST','Existing office',false,now())`);
    }
    console.log(`Migration passed: ${directory}`);
  }
  const { rows } = await db.query(
    "SELECT status, is_active FROM law_offices WHERE code='UPGRADE_TEST'",
  );
  assert.deepEqual(rows, [{ status: 'SUSPENDED', is_active: false }]);
  const tables = await db.query(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
  );
  assert.equal(tables.rows[0].count, 26);
  assert.deepEqual(
    (await db.query('SELECT status, reply FROM review_contributions ORDER BY post_id')).rows,
    [
      { status: 'COMPLETED', reply: 'Existing reply' },
      { status: 'REVIEWING', reply: null },
    ],
  );
  assert.equal(
    (await db.query('SELECT count(*)::int AS count FROM review_choices')).rows[0].count,
    0,
  );
  await db.exec(
    await readFile(new URL('../apps/api/prisma/tests/integrity.sql', import.meta.url), 'utf8'),
  );
  console.log(
    'Database integrity and legacy review migration tests passed (isolated PostgreSQL/PGlite, 26 tables).',
  );
} finally {
  await db.close();
}
