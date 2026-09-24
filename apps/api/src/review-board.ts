import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { ChatStorage } from './chat-storage.js';
import { ChatError } from './chat.js';

const derive = promisify(scrypt);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const COOKIE = 'qaver_reviewer';
const TTL = 7 * 24 * 60 * 60 * 1000;
const cookieOptions = { httpOnly: true, sameSite: 'strict' as const, path: '/api/v1/bo' };
const publicAccount = { id: true, name: true, email: true } as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, message: string) => new ChatError(status, 'REVIEW_ERROR', message);
const tokenFrom = (req: Request) =>
  req.headers.cookie
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);

export function reviewBoardRouter(db: PrismaClient, storage: ChatStorage) {
  const router = Router();
  const attempts = new Map<string, { count: number; expires: number }>();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use((req, _res, next) => {
    if (req.method !== 'GET' && req.headers['sec-fetch-site'] === 'cross-site')
      throw fail(403, '다른 사이트에서 요청할 수 없습니다.');
    next();
  });
  async function account(req: Request) {
    const token = tokenFrom(req);
    const session =
      token && /^[a-f0-9]{64}$/.test(token)
        ? await db.reviewerLoginSession.findUnique({
            where: { tokenHash: hash(token) },
            include: { account: { select: publicAccount } },
          })
        : null;
    if (!session || session.expiresAt <= new Date()) throw fail(401, '로그인이 필요합니다.');
    return session.account;
  }
  async function login(req: Request, res: Response, accountId: string) {
    const token = randomBytes(32).toString('hex');
    const old = tokenFrom(req);
    await db.$transaction(async (tx) => {
      if (old) await tx.reviewerLoginSession.deleteMany({ where: { tokenHash: hash(old) } });
      await tx.reviewerLoginSession.create({
        data: { accountId, tokenHash: hash(token), expiresAt: new Date(Date.now() + TTL) },
      });
    });
    res.cookie(COOKIE, token, {
      ...cookieOptions,
      secure: req.secure || process.env.NODE_ENV === 'production',
      maxAge: TTL,
    });
  }
  router.post(['/bo/signup', '/bo/login'], async (req, res) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
    const key = req.ip ?? 'unknown';
    const limit = attempts.get(key) ?? { count: 0, expires: now + 60000 };
    attempts.set(key, limit);
    if (++limit.count > 15) throw fail(429, '요청이 많습니다. 1분 후 다시 시도해 주세요.');
    const { email, password, name } = req.body ?? {};
    if (
      typeof email !== 'string' ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== 'string' ||
      password.length < 10 ||
      password.length > 128
    )
      throw fail(400, '이메일과 비밀번호(10~128자)를 확인해 주세요.');
    const normalized = email.trim().toLowerCase();
    if (req.path === '/bo/signup') {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 100)
        throw fail(400, '이름을 1~100자로 입력해 주세요.');
      const salt = randomBytes(16).toString('hex');
      const passwordHash = `${salt}:${((await derive(password, salt, 64)) as Buffer).toString('hex')}`;
      try {
        const user = await db.$transaction((tx) =>
          tx.reviewerAccount.create({
            data: { email: normalized, name: name.trim(), passwordHash },
            select: publicAccount,
          }),
        );
        await login(req, res, user.id);
        res.status(201).json({ success: true, data: user });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw fail(409, '이미 가입된 이메일입니다.');
        throw error;
      }
    } else {
      const user = await db.reviewerAccount.findUnique({ where: { email: normalized } });
      const [salt, expected] = user?.passwordHash.split(':') ?? ['0'.repeat(32), '0'.repeat(128)];
      const actual = (await derive(password, salt!, 64)) as Buffer;
      if (!user || !expected || !timingSafeEqual(actual, Buffer.from(expected, 'hex')))
        throw fail(401, '이메일 또는 비밀번호가 올바르지 않습니다.');
      await login(req, res, user.id);
      res.json({ success: true, data: { id: user.id, name: user.name, email: user.email } });
    }
  });
  router.get('/bo/me', async (req, res) => {
    res.json({ success: true, data: await account(req) });
  });
  router.post('/bo/logout', async (req, res) => {
    const token = tokenFrom(req);
    if (token) await db.reviewerLoginSession.deleteMany({ where: { tokenHash: hash(token) } });
    res.clearCookie(COOKIE, cookieOptions).json({ success: true });
  });
  router.get('/bo/reviews', async (req, res) => {
    const user = await account(req);
    const page = Number(req.query.page ?? 1);
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100000 ||
      !['', 'REQUESTED', 'REVIEWING', 'COMPLETED'].includes(status)
    )
      throw fail(400, '조회 조건을 확인해 주세요.');
    const where: Prisma.ReviewBoardPostWhereInput =
      status === 'REQUESTED'
        ? { contributions: { none: { reviewerId: user.id } } }
        : status
          ? { contributions: { some: { reviewerId: user.id, status } } }
          : {};
    const [items, total] = await Promise.all([
      db.reviewBoardPost.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 20,
        take: 20,
        select: {
          id: true,
          question: true,
          createdAt: true,
          contributions: { where: { reviewerId: user.id }, select: { status: true } },
        },
      }),
      db.reviewBoardPost.count({ where }),
    ]);
    res.json({
      success: true,
      data: {
        items: items.map(({ contributions, ...post }) => ({
          ...post,
          status: contributions[0]?.status ?? 'REQUESTED',
        })),
        total,
        page,
      },
    });
  });
  router.get('/bo/reviews/:id', async (req, res) => {
    const user = await account(req);
    if (!uuid.test(String(req.params.id))) throw fail(404, '요청을 찾을 수 없습니다.');
    const post = await db.reviewBoardPost.findUnique({
      where: { id: String(req.params.id) },
      select: {
        id: true,
        question: true,
        aiAnswer: true,
        createdAt: true,
        contributions: {
          where: { reviewerId: user.id },
          select: { status: true, reply: true, completedAt: true },
        },
      },
    });
    if (!post) throw fail(404, '요청을 찾을 수 없습니다.');
    const { contributions, ...question } = post;
    res.json({
      success: true,
      data: {
        ...question,
        status: contributions[0]?.status ?? 'REQUESTED',
        reply: contributions[0]?.reply ?? null,
        completedAt: contributions[0]?.completedAt ?? null,
      },
    });
  });
  router.post('/bo/reviews/:id/:action', async (req, res) => {
    const user = await account(req);
    const id = String(req.params.id);
    if (!uuid.test(id)) throw fail(404, '요청을 찾을 수 없습니다.');
    const action = req.params.action;
    if (action !== 'claim' && action !== 'complete') throw fail(404, '요청을 찾을 수 없습니다.');
    const reply = req.body?.reply;
    if (
      action === 'complete' &&
      (typeof reply !== 'string' || !reply.trim() || reply.length > 20000)
    )
      throw fail(400, '검증 답변을 1~20,000자로 입력해 주세요.');
    if (!(await db.reviewBoardPost.findUnique({ where: { id }, select: { id: true } })))
      throw fail(404, '요청을 찾을 수 없습니다.');
    const changed =
      action === 'claim'
        ? await db.reviewContribution.createMany({
            data: { postId: id, reviewerId: user.id },
            skipDuplicates: true,
          })
        : await db.reviewContribution.updateMany({
            where: { postId: id, reviewerId: user.id, status: 'REVIEWING' },
            data: { status: 'COMPLETED', reply: reply.trim(), completedAt: new Date() },
          });
    if (!changed.count)
      throw fail(
        409,
        '이미 검증을 시작했거나 완료한 질문입니다. 검증 시작 후 질문당 한 번만 답변할 수 있습니다.',
      );
    res.json({ success: true });
  });
  router.post('/reviews', async (req, res) => {
    const { answerMessageId, email, consent } = req.body ?? {};
    if (
      typeof answerMessageId !== 'string' ||
      !uuid.test(answerMessageId) ||
      typeof email !== 'string' ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      consent !== true
    )
      throw fail(400, '검증 대상, 이메일과 정보 제공 동의를 확인해 주세요.');
    await storage.session(req, res, false);
    const { ids: ownedIds } = await storage.browserHistory.sessionIds(req, res);
    const answer = await db.chatMessage.findFirst({
      where: {
        id: answerMessageId,
        sessionId: { in: ownedIds },
        role: 'ASSISTANT',
        processingStatus: 'COMPLETED',
      },
      include: { parent: true },
    });
    if (!answer?.parent) throw fail(404, '현재 대화에서 검증할 답변을 찾을 수 없습니다.');
    const post = await db.reviewBoardPost.upsert({
      where: { answerMessageId },
      update: {},
      create: {
        sessionId: answer.sessionId,
        answerMessageId,
        question: answer.parent.content,
        aiAnswer: answer.content,
        requesterEmail: email.trim().toLowerCase(),
      },
    });
    res.status(201).json({ success: true, data: { id: post.id } });
  });
  router.get('/reviews', async (req, res) => {
    await storage.session(req, res, false);
    const { browserId, ids } = await storage.browserHistory.sessionIds(req, res);
    const items = await db.reviewBoardPost.findMany({
      where: { sessionId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        answerMessageId: true,
        question: true,
        sessionId: true,
        contributions: {
          where: { status: 'COMPLETED' },
          orderBy: [{ completedAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            reply: true,
            completedAt: true,
            reviewer: { select: { name: true } },
            reads: { where: { browserId }, select: { readAt: true } },
          },
        },
        choice: { select: { contributionId: true } },
      },
    });
    res.json({
      success: true,
      data: items.map(({ contributions, choice, ...post }) => ({
        ...post,
        answers: contributions.map(({ reads, ...answer }) => ({
          ...answer,
          unread: reads.length === 0,
        })),
        selectedAnswerId: choice?.contributionId ?? null,
      })),
    });
  });
  router.post('/reviews/:id/selection', async (req, res) => {
    const id = String(req.params.id);
    const answerId = req.body?.answerId;
    if (!uuid.test(id) || typeof answerId !== 'string' || !uuid.test(answerId))
      throw fail(400, '선택할 검증 답변을 확인해 주세요.');
    const { ids } = await storage.browserHistory.sessionIds(req, res);
    const answer = await db.reviewContribution.findFirst({
      where: { id: answerId, postId: id, status: 'COMPLETED', post: { sessionId: { in: ids } } },
      select: { id: true },
    });
    if (!answer) throw fail(404, '현재 대화에서 선택할 검증 답변을 찾을 수 없습니다.');
    const choice = await db.reviewChoice.upsert({
      where: { postId: id },
      create: { postId: id, contributionId: answer.id },
      update: { contributionId: answer.id, selectedAt: new Date() },
    });
    res.json({ success: true, data: { selectedAnswerId: choice.contributionId } });
  });
  router.post('/reviews/:id/read', async (req, res) => {
    const id = String(req.params.id);
    const answerIds = req.body?.answerIds;
    if (
      !uuid.test(id) ||
      !Array.isArray(answerIds) ||
      answerIds.length > 1000 ||
      answerIds.some((v) => typeof v !== 'string' || !uuid.test(v))
    )
      throw fail(400, '확인할 답변을 확인해 주세요.');
    const { browserId, ids } = await storage.browserHistory.sessionIds(req, res);
    const post = await db.reviewBoardPost.findFirst({
      where: { id, sessionId: { in: ids } },
      select: { id: true },
    });
    if (!post) throw fail(404, '검증 요청을 찾을 수 없습니다.');
    const answers = await db.reviewContribution.findMany({
      where: { postId: id, id: { in: answerIds }, status: 'COMPLETED' },
      select: { id: true },
    });
    await db.foReviewRead.createMany({
      data: answers.map((answer) => ({ browserId, contributionId: answer.id })),
      skipDuplicates: true,
    });
    res.json({ success: true });
  });
  return router;
}
