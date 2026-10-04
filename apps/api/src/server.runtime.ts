import { createApp } from './app.js';
import { PrismaClient } from '@prisma/client';
import { ChatStorage } from './chat-storage.js';
import { bootstrapAdmin } from './admin-bootstrap.js';

export interface ServerConfig {
  host: string;
  port: number;
}

export function readPort(value: string | undefined): number {
  const port = Number(value ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be a valid port');
  return port;
}

export function startupErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.startsWith('CONFIG:')) return error.message;
  const details = error as {
    code?: unknown;
    errorCode?: unknown;
    meta?: { code?: unknown };
  } | null;
  const candidate = details?.code ?? details?.errorCode;
  const code = typeof candidate === 'string' && /^P\d{4}$/.test(candidate) ? candidate : undefined;
  const label = code ? ` (${code})` : '';
  if (
    code === 'P2021' ||
    code === 'P2022' ||
    (code === 'P2010' && ['42P01', '42703'].includes(String(details?.meta?.code)))
  )
    return `Database schema is outdated${label}. Run npm run db:migrate and npm run db:generate, then restart the API.`;
  if (code === 'P1000' || code === 'P1010')
    return `Database authentication or access failed${label}. Check DATABASE_URL credentials and database permissions.`;
  if (code === 'P1001' || code === 'P1002' || code === 'P1017')
    return `Database connection failed${label}. Check DATABASE_URL and database availability. For local PostgreSQL, run npm run db:up.`;
  return `Unable to initialize configured admin${label}. Check DATABASE_URL; run npm run db:setup locally or npm run db:deploy in deployment, then restart the API.`;
}

export async function startServer(config: ServerConfig) {
  const db = new PrismaClient();
  try {
    await bootstrapAdmin(db, process.env.ADMIN_EMAIL);
  } catch (error) {
    await db.$disconnect();
    console.error('[lawCheck API] Startup failed:', startupErrorMessage(error));
    process.exitCode = 1;
    return;
  }
  const storage = new ChatStorage(db, process.env.LAW_OFFICE_CODE ?? 'LAW001');
  const server = createApp(process.env.LAW_OFFICE_NAME, undefined, { storage, db }).listen(
    config.port,
    config.host,
    () => {
      console.log(`LawCheck API: http://${config.host}:${config.port}/api/v1/health (prototype)`);
    },
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () =>
      server.close(() => {
        void db.$disconnect();
      }),
    );
  return server;
}
