import { PrismaClient } from '@prisma/client';

// Run with the target DATABASE_URL. Accept a locally derived hash, never a plaintext password.
const [username, expectedId, passwordHash, ...extra] = process.argv.slice(2);
if (
  extra.length ||
  !/^[a-z][a-z0-9_]{3,29}$/.test(username ?? '') ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(expectedId ?? '') ||
  !/^[0-9a-f]{32}:[0-9a-f]{128}$/.test(passwordHash ?? '')
) {
  console.error('Usage: node reset-office-password.mjs username expected-account-id scrypt-hash');
  process.exit(1);
}
const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    const result = await tx.expertAccount.updateMany({
      where: { id: expectedId, username, isActive: true, expertGroup: 'LAWYER' },
      data: { passwordHash },
    });
    if (result.count !== 1) throw new Error('TARGET_MISMATCH');
    await tx.expertLoginSession.deleteMany({ where: { accountId: expectedId } });
    await tx.adminLoginSession.deleteMany({ where: { accountId: expectedId } });
  });
  console.log('Office password reset complete; previous Office and Admin sessions revoked.');
} catch (error) {
  console.error(
    error?.message === 'TARGET_MISMATCH'
      ? 'Reset target did not match an active lawyer.'
      : 'Office password reset failed.',
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
