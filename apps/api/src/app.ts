import express from 'express';
import helmet from 'helmet';
import type { HealthResponse, PublicConfig } from '@lawcheck/contracts';

export function createApp(officeName = '법률사무소 이음') {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/v1/health', (_req, res) => {
    const body: HealthResponse = {
      success: true,
      data: { service: 'lawcheck-api', status: 'ok', mode: 'prototype' },
    };
    res.json(body);
  });
  app.get('/api/v1/config', (_req, res) => {
    const data: PublicConfig = { officeName, mode: 'prototype', maxQuestions: 5 };
    res.json({ success: true, data });
  });
  // No public BO data or fake submission endpoints are exposed by the prototype.
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: '아직 제공되지 않는 기능입니다.' },
    });
  });
  return app;
}
