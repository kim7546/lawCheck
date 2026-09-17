import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const db = new PrismaClient();
try {
  await db.lawOffice.upsert({
    where: { code: process.env.LAW_OFFICE_CODE ?? 'LAW001' },
    update: {},
    create: {
      code: process.env.LAW_OFFICE_CODE ?? 'LAW001',
      name: process.env.LAW_OFFICE_NAME ?? '법률사무소 이음',
    },
  });
  console.log('Development office seed is ready.');
} finally {
  await db.$disconnect();
}
