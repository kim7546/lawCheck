import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { localServerConfig } from './server.config.js';
import { deploymentServerConfig } from './server.deploy.config.js';
import { startupErrorMessage } from './server.runtime.js';
import { bootstrapAdmin } from './admin-bootstrap.js';
import type { PrismaClient } from '@prisma/client';

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

test('startup failures identify missing migrations and connection failures without exposing secrets', () => {
  for (const error of [
    { code: 'P2021' },
    { code: 'P2022' },
    { code: 'P2010', meta: { code: '42P01' } },
    { code: 'P2010', meta: { code: '42703' } },
  ]) {
    assert.match(startupErrorMessage(error), /Database schema is outdated/);
    assert.match(startupErrorMessage(error), /npm run db:migrate/);
  }
  for (const code of ['P1001', 'P1002', 'P1017'])
    assert.match(startupErrorMessage({ errorCode: code }), /Database connection failed/);
  for (const code of ['P1000', 'P1010'])
    assert.match(startupErrorMessage({ errorCode: code }), /authentication or access failed/);
  const config = new Error(
    'CONFIG: ADMIN_EMAIL has no existing BO account. Complete BO signup first.',
  );
  assert.equal(startupErrorMessage(config), config.message);
  const secret = 'postgresql://user:secret-password@db/private';
  for (const error of [
    new Error(secret),
    { code: secret, message: secret },
    { code: 'P2010', meta: { code: secret } },
    null,
    undefined,
  ]) {
    const message = startupErrorMessage(error);
    assert.match(message, /npm run db:setup/);
    assert.ok(!message.includes(secret));
  }
});

test('configured admin rejects an outdated Prisma Client with a regeneration instruction', async () => {
  const staleClient = {} as PrismaClient;
  await bootstrapAdmin(staleClient, undefined);
  await assert.rejects(bootstrapAdmin(staleClient, 'admin@example.com'), /npm run db:generate/);
});
