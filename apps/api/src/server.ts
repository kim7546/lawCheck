import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be a valid port');
const server = createApp(process.env.LAW_OFFICE_NAME).listen(port, '127.0.0.1', () => {
  console.log(`LawCheck API: http://localhost:${port}/api/v1/health (prototype)`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close());
