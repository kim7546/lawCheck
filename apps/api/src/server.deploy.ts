import { deploymentServerConfig } from './server.deploy.config.js';
import { startServer } from './server.runtime.js';

process.env.NODE_ENV ??= 'production';
await startServer(deploymentServerConfig());
