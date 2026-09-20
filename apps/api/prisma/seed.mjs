import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
}
const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (Boolean(adminEmail) !== Boolean(adminPassword))
  throw new Error('Set both bootstrap admin email and password, or neither.');
if (adminEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || adminEmail.length > 254))
  throw new Error('Invalid bootstrap admin email.');
if (adminPassword && adminPassword.length < 12)
  throw new Error('Bootstrap admin password must have at least 12 characters.');
const db = new PrismaClient();
try {
  const office = await db.lawOffice.upsert({
    where: { code: process.env.LAW_OFFICE_CODE ?? 'LAW001' },
    update: {},
    create: {
      code: process.env.LAW_OFFICE_CODE ?? 'LAW001',
      name: process.env.LAW_OFFICE_NAME ?? '법률사무소 IBS',
    },
  });
  if (adminEmail && adminPassword) {
    const existing = await db.staffAccount.findFirst({
      where: { lawOfficeId: office.id, email: { equals: adminEmail, mode: 'insensitive' } },
    });
    if (!existing) {
      const salt = randomBytes(16).toString('hex');
      const hash = await promisify(scrypt)(adminPassword, salt, 64);
      await db.staffAccount.upsert({
        where: { lawOfficeId_email: { lawOfficeId: office.id, email: adminEmail } },
        update: {},
        create: {
          lawOfficeId: office.id,
          email: adminEmail,
          passwordHash: `scrypt$16384$8$1$${salt}$${hash.toString('hex')}`,
          role: 'OFFICE_ADMIN',
        },
      });
    }
  }
  console.log('Office seed complete. Existing records and passwords were preserved.');
} finally {
  await db.$disconnect();
}
