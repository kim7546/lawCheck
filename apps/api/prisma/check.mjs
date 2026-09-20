import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
}
const db = new PrismaClient();
try {
  await db.$queryRaw`SELECT 1`;
  const tables =
    await db.$queryRaw`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('law_offices','lawyers','staff_accounts','staff_sessions','lawyer_employments','lawyer_leaves','chat_sessions','chat_messages','verification_requests','review_invitations','review_sessions','assignment_history','lawyer_replies','email_outbox','email_delivery_attempts','audit_logs')`;
  if (tables[0].count !== 16) throw new Error('Schema incomplete. Run npm run db:migrate first.');
  const office = await db.lawOffice.findUnique({
    where: { code: process.env.LAW_OFFICE_CODE ?? 'LAW001' },
  });
  if (!office) throw new Error('Office not initialized. Run npm run db:seed first.');
  console.log('PostgreSQL connection OK; all 16 tables and configured office are ready.');
} catch (error) {
  // Do not print datasource URLs or SQL parameters.
  console.error('Database check failed:', error.code ?? error.name);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
