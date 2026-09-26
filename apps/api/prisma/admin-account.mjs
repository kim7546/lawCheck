import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV !== 'production')
  dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const [action, inputEmail, ...extra] = process.argv.slice(2);
if (!['grant', 'revoke'].includes(action) || extra.length || (action === 'revoke' && !inputEmail)) {
  console.error(
    'Usage: npm run admin:account -- grant [existing-email@example.com] (defaults to ADMIN_EMAIL)\n       npm run admin:account -- revoke existing-email@example.com\nNew accounts cannot be created here. Complete BO signup first.',
  );
  process.exit(1);
}
const db = new PrismaClient();
try {
  const email = (inputEmail ?? process.env.ADMIN_EMAIL)?.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('CONFIG: Provide a valid existing BO email or set ADMIN_EMAIL.');
  await db.$transaction(async (tx) => {
    // Serialize provisioning with the admin UI so the final active admin cannot be revoked.
    await tx.$queryRaw`SELECT account_id FROM expert_admin_profiles ORDER BY account_id FOR UPDATE`;
    const user = await tx.expertAccount.findUnique({
      where: { email },
      include: { adminProfile: true },
    });
    if (!user) throw new Error('CONFIG: Existing BO account not found. Complete BO signup first.');
    if (action === 'grant' && !user.isActive)
      throw new Error('CONFIG: Activate the account before granting admin access.');
    if (
      action === 'revoke' &&
      user.isActive &&
      user.adminProfile?.isActive &&
      (await tx.expertAdminProfile.count({
        where: { isActive: true, account: { isActive: true } },
      })) <= 1
    )
      throw new Error(
        'CONFIG: The final active admin cannot be revoked. Grant another account first.',
      );
    if (action === 'grant')
      await tx.expertAdminProfile.upsert({
        where: { accountId: user.id },
        create: { accountId: user.id },
        update: { isActive: true },
      });
    else {
      await tx.expertAdminProfile.updateMany({
        where: { accountId: user.id },
        data: { isActive: false },
      });
      await tx.adminLoginSession.deleteMany({ where: { accountId: user.id } });
    }
    await tx.expertAccount.update({ where: { id: user.id }, data: { updatedAt: new Date() } });
  });
  console.log(
    `Admin permission ${action === 'grant' ? 'granted' : 'revoked'}. Expert profile and BO membership are preserved.`,
  );
} catch (error) {
  console.error(
    error instanceof Error && error.message.startsWith('CONFIG:')
      ? error.message
      : `Admin setup failed (${error?.code ?? error?.errorCode ?? error?.name ?? 'unknown'}). Check database connectivity and migrations.`,
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
