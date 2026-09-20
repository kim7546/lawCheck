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
  assert.equal(tables.rows[0].count, 16);
  await db.exec(
    await readFile(new URL('../apps/api/prisma/tests/integrity.sql', import.meta.url), 'utf8'),
  );
  console.log('Database integrity tests passed (isolated PostgreSQL/PGlite, 16 tables).');
} finally {
  await db.close();
}
