import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from './app.js';

test('health works without database or AI credentials', async () => {
  const response = await request(createApp()).get('/api/v1/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.mode, 'prototype');
});
test('public config exposes office branding without environment secrets', async () => {
  const response = await request(createApp('테스트 사무실')).get('/api/v1/config');
  assert.deepEqual(response.body.data, {
    officeName: '테스트 사무실',
    mode: 'prototype',
    maxQuestions: 5,
  });
});
test('prototype cannot accidentally accept or send real verification requests', async () => {
  const response = await request(createApp())
    .post('/api/v1/verification-requests')
    .send({ email: 'test@example.com' });
  assert.equal(response.status, 404);
});
