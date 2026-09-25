import { Prisma, PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
}
const db = new PrismaClient();
try {
  await db.$queryRaw`SELECT 1`;
  const modelTables = Prisma.dmmf.datamodel.models.map((model) => model.dbName ?? model.name);
  const tables = await db.$queryRaw`SELECT count(*)::int AS count FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN (${Prisma.join(modelTables)})`;
  if (tables[0].count !== modelTables.length)
    throw new Error('Schema incomplete. Run npm run db:migrate first.');
  const undocumented = await db.$queryRaw`
    SELECT c.relname, a.attname FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE n.nspname='public' AND c.relkind='r'
      AND (coalesce(obj_description(c.oid,'pg_class'),'') !~ '[가-힣]'
        OR coalesce(col_description(c.oid,a.attnum),'') !~ '[가-힣]')`;
  if (undocumented.length) throw new Error('Korean logical schema comments are missing.');
  const obsolete = await db.$queryRaw`SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND left(table_name,9)='reviewer_'`;
  if (obsolete.length) throw new Error('Obsolete account tables remain.');
  const office = await db.lawOffice.findUnique({
    where: { code: process.env.LAW_OFFICE_CODE ?? 'LAW001' },
  });
  if (!office) throw new Error('Office not initialized. Run npm run db:seed first.');
  console.log(
    `PostgreSQL connection OK; all ${modelTables.length} tables, Korean logical schema comments and configured office are ready. No obsolete account tables remain.`,
  );
} catch (error) {
  // Do not print datasource URLs or SQL parameters.
  console.error('Database check failed:', error.code ?? error.name);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
