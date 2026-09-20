import express from 'express';
import helmet from 'helmet';
import type { ErrorRequestHandler } from 'express';
import type { ChatStorage } from './chat-storage.js';
import type { ChatRequest, HealthResponse, PublicConfig } from '@lawcheck/contracts';
import { ChatError, createAnswerGenerator } from './chat.js';
import { createSessionStore, MAX_QUESTIONS } from './session.js';

export function createApp(
  officeName = '법률사무소 IBS',
  generateAnswer = createAnswerGenerator({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_ANSWER_MODEL,
  }),
  {
    questionLimitEnabled = process.env.QUESTION_LIMIT_ENABLED === 'true',
    storage,
  }: { questionLimitEnabled?: boolean; storage?: ChatStorage } = {},
) {
  const app = express();
  const getSession = createSessionStore();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '128kb' }));
  app.get('/api/v1/health', (_req, res) => {
    const body: HealthResponse = {
      success: true,
      data: { service: 'lawcheck-api', status: 'ok', mode: 'prototype' },
    };
    res.json(body);
  });
  app.get('/api/v1/config', async (_req, res) => {
    const session = storage
      ? { used: (await storage.session(_req, res, questionLimitEnabled)).questionCount }
      : getSession(_req, res);
    res.set('Cache-Control', 'no-store');
    const data: PublicConfig = {
      officeName,
      mode: 'prototype',
      maxQuestions: MAX_QUESTIONS,
      questionLimitEnabled,
      remainingQuestions: questionLimitEnabled ? Math.max(0, MAX_QUESTIONS - session.used) : null,
    };
    res.json({ success: true, data });
  });
  app.post('/api/v1/chat/session', async (req, res) => {
    if (storage) await storage.session(req, res, questionLimitEnabled, true);
    else getSession(req, res, true);
    res.json({ success: true });
  });
  app.get('/api/v1/chat/history', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!storage) {
      res.json({ success: true, data: { messages: [] } });
      return;
    }
    const session = await storage.session(req, res, questionLimitEnabled);
    res.json({
      success: true,
      data: { sessionId: session.id, messages: await storage.history(session.id) },
    });
  });
  app.post('/api/v1/chat', async (req, res) => {
    const { question, history = [] } = req.body ?? {};
    if (
      typeof question !== 'string' ||
      !question.trim() ||
      question.length > 2000 ||
      !Array.isArray(history) ||
      history.some(
        (turn: ChatRequest['history'][number]) =>
          !turn ||
          typeof turn.question !== 'string' ||
          !turn.question.trim() ||
          turn.question.length > 2000 ||
          typeof turn.answer !== 'string' ||
          !turn.answer.trim() ||
          turn.answer.length > 20000,
      )
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_QUESTION',
          message: '질문과 대화 내용을 확인해 주세요. 질문은 2,000자까지 입력할 수 있어요.',
        },
      });
      return;
    }
    if (storage) {
      const session = await storage.session(req, res, questionLimitEnabled);
      const pending = await storage.begin(session.id, question.trim(), questionLimitEnabled);
      let answer;
      try {
        answer = await generateAnswer({ question: question.trim(), history: pending.history });
      } catch (error) {
        await storage.fail(session.id, pending.message.id);
        throw error instanceof ChatError
          ? error
          : new ChatError(502, 'AI_UNAVAILABLE', 'AI 답변을 받지 못했어요. 다시 시도해 주세요.');
      }
      await storage.complete(session.id, pending.message.id, answer);
      res.json({
        success: true,
        data: {
          ...answer,
          remainingQuestions: questionLimitEnabled ? Math.max(0, 3 - pending.used) : null,
        },
      });
      return;
    }
    const session = getSession(req, res);
    if (
      questionLimitEnabled &&
      (session.used >= MAX_QUESTIONS || history.length >= MAX_QUESTIONS)
    ) {
      res.status(429).json({
        success: false,
        error: {
          code: 'QUESTION_LIMIT_REACHED',
          message: '이번 대화의 질문 3회를 모두 사용했어요. 새 대화를 시작해 주세요.',
        },
      });
      return;
    }
    if (session.pending) {
      res.status(409).json({
        success: false,
        error: { code: 'QUESTION_IN_PROGRESS', message: '이전 질문의 답변을 기다려 주세요.' },
      });
      return;
    }
    session.pending = true;
    session.used += 1;
    try {
      const answer = await generateAnswer({
        question: question.trim(),
        history: history.slice(-10),
      });
      res.json({
        success: true,
        data: {
          ...answer,
          remainingQuestions: questionLimitEnabled
            ? Math.max(0, MAX_QUESTIONS - session.used)
            : null,
        },
      });
    } catch (error) {
      session.used -= 1;
      const failure =
        error instanceof ChatError
          ? error
          : new ChatError(502, 'AI_UNAVAILABLE', 'AI 답변을 받지 못했어요. 다시 시도해 주세요.');
      res
        .status(failure.status)
        .json({ success: false, error: { code: failure.code, message: failure.message } });
    } finally {
      session.pending = false;
    }
  });
  // Verification submission is still a UI-only prototype.
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: '아직 제공되지 않는 기능입니다.' },
    });
  });
  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (res.headersSent) {
      _next(error);
      return;
    }
    const failure =
      error instanceof ChatError
        ? error
        : new ChatError(
            503,
            'DATABASE_UNAVAILABLE',
            '대화 기록을 저장하거나 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
          );
    res
      .status(failure.status)
      .json({ success: false, error: { code: failure.code, message: failure.message } });
  };
  app.use(handleError);
  return app;
}
