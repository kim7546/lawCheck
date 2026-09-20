import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import type { ChatAnswer, ChatRequest } from '@lawcheck/contracts';
import { ChatError } from './chat.js';

const COOKIE = 'lawcheck_session';
const TTL = 24 * 60 * 60 * 1000;
export class ChatStorage {
  constructor(
    private db: PrismaClient,
    private officeCode = 'LAW001',
  ) {}

  async session(req: Request, res: Response, limited: boolean, reset = false) {
    const office = await this.db.lawOffice.findUnique({ where: { code: this.officeCode } });
    if (!office?.isActive)
      throw new ChatError(503, 'OFFICE_UNAVAILABLE', '사무실 설정을 확인해 주세요.');
    const token = req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const existing =
      token && /^[a-f0-9]{64}$/.test(token)
        ? await this.db.chatSession.findFirst({
            where: {
              sessionTokenHash: hash(token),
              lawOfficeId: office.id,
              expiresAt: { gt: new Date() },
            },
          })
        : null;
    if (existing && !reset) return existing;
    const newToken = randomBytes(32).toString('hex');
    const session = await this.db.$transaction(async (tx) => {
      if (existing && reset)
        await tx.chatSession.update({
          where: { id: existing.id },
          data: { expiresAt: new Date() },
        });
      return tx.chatSession.create({
        data: {
          lawOfficeId: office.id,
          sessionTokenHash: hash(newToken),
          maxQuestionCount: limited ? 3 : null,
          expiresAt: new Date(Date.now() + TTL),
        },
      });
    });
    res.cookie(COOKIE, newToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production' || req.secure,
      path: '/api/v1',
      maxAge: TTL,
    });
    return session;
  }

  async begin(sessionId: string, question: string, limited: boolean) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM chat_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
      const session = await tx.chatSession.findUniqueOrThrow({ where: { id: sessionId } });
      if (session.expiresAt <= new Date())
        throw new ChatError(401, 'SESSION_EXPIRED', '대화 세션이 만료됐어요. 새로고침해 주세요.');
      // A process can stop while calling the model. Release abandoned requests after
      // two minutes (the upstream timeout is 60 seconds), retaining their history.
      const stale = await tx.chatMessage.updateMany({
        where: {
          sessionId,
          messageType: 'USER_QUESTION',
          processingStatus: 'PROCESSING',
          createdAt: { lt: new Date(Date.now() - 120000) },
        },
        data: { processingStatus: 'FAILED' },
      });
      const used = Math.max(0, session.questionCount - stale.count);
      if (await tx.chatMessage.count({ where: { sessionId, processingStatus: 'PROCESSING' } }))
        throw new ChatError(409, 'QUESTION_IN_PROGRESS', '이전 질문의 답변을 기다려 주세요.');
      if (limited && used >= 3)
        throw new ChatError(
          429,
          'QUESTION_LIMIT_REACHED',
          '이번 대화의 질문 3회를 모두 사용했어요. 새 대화를 시작해 주세요.',
        );
      const previous = await tx.chatMessage.findMany({
        where: { sessionId, role: 'ASSISTANT', processingStatus: 'COMPLETED' },
        orderBy: { sequenceNo: 'desc' },
        take: 10,
        include: { parent: true },
      });
      const history: ChatRequest['history'] = previous
        .reverse()
        .flatMap((m) => (m.parent ? [{ question: m.parent.content, answer: m.content }] : []));
      const last = await tx.chatMessage.aggregate({
        where: { sessionId },
        _max: { sequenceNo: true },
      });
      const message = await tx.chatMessage.create({
        data: {
          lawOfficeId: session.lawOfficeId,
          sessionId,
          role: 'USER',
          messageType: 'USER_QUESTION',
          content: question,
          sequenceNo: (last._max.sequenceNo ?? 0) + 1,
          processingStatus: 'PROCESSING',
        },
      });
      await tx.chatSession.update({
        where: { id: sessionId },
        data: { questionCount: used + 1, maxQuestionCount: limited ? 3 : null },
      });
      return { message, history, used: used + 1 };
    });
  }

  async complete(sessionId: string, messageId: string, answer: ChatAnswer) {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM chat_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
      const question = await tx.chatMessage.findFirstOrThrow({
        where: { id: messageId, sessionId, processingStatus: 'PROCESSING' },
      });
      await tx.chatMessage.create({
        data: {
          lawOfficeId: question.lawOfficeId,
          sessionId,
          parentMessageId: question.id,
          role: 'ASSISTANT',
          messageType: answer.isLegalQuestion ? 'AI_ANSWER' : 'NON_LEGAL_NOTICE',
          content: answer.answer,
          sequenceNo: question.sequenceNo + 1,
          processingStatus: 'COMPLETED',
        },
      });
      await tx.chatMessage.update({
        where: { id: question.id },
        data: { processingStatus: 'COMPLETED' },
      });
    });
  }

  async fail(sessionId: string, messageId: string) {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM chat_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
      const changed = await tx.chatMessage.updateMany({
        where: { id: messageId, sessionId, processingStatus: 'PROCESSING' },
        data: { processingStatus: 'FAILED' },
      });
      if (changed.count)
        await tx.chatSession.update({
          where: { id: sessionId },
          data: { questionCount: { decrement: 1 } },
        });
    });
  }

  async history(sessionId: string) {
    return this.db.chatMessage.findMany({
      where: { sessionId },
      orderBy: { sequenceNo: 'asc' },
      select: {
        id: true,
        parentMessageId: true,
        role: true,
        messageType: true,
        content: true,
        processingStatus: true,
        sequenceNo: true,
        createdAt: true,
      },
    });
  }
}
