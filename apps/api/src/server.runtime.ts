import { createApp } from './app.js';
import { PrismaClient } from '@prisma/client';
import { ChatStorage } from './chat-storage.js';

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

export function startServer(config: ServerConfig) {
  const db = new PrismaClient();
  const storage = new ChatStorage(db, process.env.LAW_OFFICE_CODE ?? 'LAW001');
  const server = createApp(process.env.LAW_OFFICE_NAME, undefined, { storage }).listen(
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
