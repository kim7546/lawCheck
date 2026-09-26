import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { localServerConfig } from './server.config.js';
import { startServer } from './server.runtime.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
await startServer(localServerConfig());
