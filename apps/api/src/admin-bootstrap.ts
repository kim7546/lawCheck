import type { PrismaClient } from '@prisma/client';

// Deployment configuration selects an existing BO member; it never creates login credentials.
export async function bootstrapAdmin(db: PrismaClient, configuredEmail: string | undefined) {
  const email = configuredEmail?.trim().toLowerCase();
  if (!email) return;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('CONFIG: ADMIN_EMAIL must be a valid existing BO email.');
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT account_id FROM expert_admin_profiles ORDER BY account_id FOR UPDATE`;
    const user = await tx.expertAccount.findUnique({
      where: { email },
      include: { adminProfile: true },
    });
    if (!user)
      throw new Error('CONFIG: ADMIN_EMAIL has no existing BO account. Complete BO signup first.');
    if (!user.isActive) throw new Error('CONFIG: ADMIN_EMAIL refers to an inactive BO account.');
    if (user.adminProfile) {
      // Restarting a service must not undo an explicit revocation in user management.
      if (!user.adminProfile.isActive)
        throw new Error(
          'CONFIG: ADMIN_EMAIL refers to a revoked admin. Explicitly grant access or remove ADMIN_EMAIL.',
        );
      return;
    }
    await tx.expertAdminProfile.upsert({
      where: { accountId: user.id },
      create: { accountId: user.id },
      update: {},
    });
    await tx.expertAccount.update({ where: { id: user.id }, data: { updatedAt: new Date() } });
  });
}
