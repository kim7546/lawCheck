import { readPort, type ServerConfig } from './server.runtime.js';

export function localServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return { host: '127.0.0.1', port: readPort(env.PORT) };
}
