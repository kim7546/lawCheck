import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV !== 'production')
  dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const [action, inputEmail, ...extra] = process.argv.slice(2);
if (!['grant', 'revoke'].includes(action) || !inputEmail || extra.length) {
  console.error('Usage: npm run codes:admin -- grant|revoke existing-account@example.com');
  process.exit(1);
}
const db = new PrismaClient();
try {
  const user = await db.expertAccount.findUnique({
    where: { email: inputEmail.trim().toLowerCase() },
    select: { id: true },
  });
  if (!user) throw new Error('Existing BO account not found. No account was created.');
  await db.expertAccount.update({
    where: { id: user.id },
    data: { canManageCodes: action === 'grant' },
  });
  console.log(
    `Common code permission ${action === 'grant' ? 'granted' : 'revoked'}. Refresh BO to update the menu.`,
  );
} catch (error) {
  console.error(
    error instanceof Error && error.message.startsWith('Existing BO')
      ? error.message
      : 'Permission update failed. Check the database and migration.',
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
