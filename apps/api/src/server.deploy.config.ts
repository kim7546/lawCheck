import { readPort, type ServerConfig } from './server.runtime.js';

// Deployment reads runtime variables only; never load the developer's .env.
export function deploymentServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return { host: '0.0.0.0', port: readPort(env.PORT) };
}
