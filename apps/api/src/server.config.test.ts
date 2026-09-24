import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { localServerConfig } from './server.config.js';
import { deploymentServerConfig } from './server.deploy.config.js';

test('deployment binds all interfaces on the injected Railway port; local remains loopback', () => {
  assert.deepEqual(deploymentServerConfig({ PORT: '8123' }), { host: '0.0.0.0', port: 8123 });
  assert.deepEqual(localServerConfig({ PORT: '4123' }), { host: '127.0.0.1', port: 4123 });
  assert.deepEqual(deploymentServerConfig({}), { host: '0.0.0.0', port: 4000 });
});

test('both entry points reject invalid ports before opening a listener', () => {
  for (const PORT of ['', '0', '-1', '65536', 'abc', '3.5']) {
    assert.throws(() => deploymentServerConfig({ PORT }), /PORT must be a valid port/);
    assert.throws(() => localServerConfig({ PORT }), /PORT must be a valid port/);
  }
});
