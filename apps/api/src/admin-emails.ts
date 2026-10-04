import { Router } from 'express';
import type { AnswerEmailStatus, Prisma, PrismaClient } from '@prisma/client';
import { ChatError } from './chat.js';
const fail = (status: number, message: string) => new ChatError(status, 'ADMIN_ERROR', message);
const statuses = ['QUEUED', 'SENDING', 'RETRY', 'SENT', 'FAILED'];
const selection = {
  id: true,
  contributionId: true,
  recipient: true,
  subject: true,
  status: true,
  attemptCount: true,
  version: true,
  lastErrorCode: true,
  sentAt: true,
  createdAt: true,
  nextAttemptAt: true,
} as const;
function date(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw fail(400, '조회 날짜를 확인해 주세요.');
  return new Date(`${value}T00:00:00+09:00`);
}
export function adminEmailsRouter(db: PrismaClient) {
  const router = Router();
  router.get('/emails', async (req, res) => {
    const { q, status, from, to } = req.query;
    const pageInput = req.query.page ?? '1';
    if (
      typeof pageInput !== 'string' ||
      !/^[1-9]\d{0,5}$/.test(pageInput) ||
      (q !== undefined && (typeof q !== 'string' || q.length > 254)) ||
      (status !== undefined && (typeof status !== 'string' || !statuses.includes(status)))
    )
      throw fail(400, '조회 조건을 확인해 주세요.');
    const gte = from === undefined ? undefined : date(from);
    const end = to === undefined ? undefined : date(to);
    if (gte && end && gte > end) throw fail(400, '시작일은 종료일보다 늦을 수 없습니다.');
    const where: Prisma.AnswerEmailDeliveryWhereInput = {
      ...(q
        ? {
            OR: [
              { recipient: { contains: q as string, mode: 'insensitive' } },
              { subject: { contains: q as string, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(status ? { status: status as AnswerEmailStatus } : {}),
      ...(gte || end
        ? { createdAt: { gte, lt: end ? new Date(end.getTime() + 86400000) : undefined } }
        : {}),
    };
    const page = Number(pageInput),
      pageSize = 20;
    const [items, total] = await db.$transaction([
      db.answerEmailDelivery.findMany({
        where,
        select: selection,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.answerEmailDelivery.count({ where }),
    ]);
    res.json({ success: true, data: { items, total, page, pageSize } });
  });
  router.use('/emails/:id', (req, _res, next) => {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(req.params.id))
    )
      throw fail(404, '발송 이력을 찾을 수 없습니다.');
    next();
  });
  router.get('/emails/:id', async (req, res) => {
    const item = await db.answerEmailDelivery.findUnique({
      where: { id: String(req.params.id) },
      select: {
        ...selection,
        body: true,
        linkExpiresAt: true,
        attempts: { orderBy: { attemptNo: 'asc' } },
      },
    });
    if (!item) throw fail(404, '발송 이력을 찾을 수 없습니다.');
    res.json({ success: true, data: item });
  });
  router.post('/emails/:id/retry', async (req, res) => {
    const version = req.body?.version;
    if (!Number.isInteger(version) || version < 1) throw fail(400, '발송 이력 버전이 필요합니다.');
    const changed = await db.answerEmailDelivery.updateMany({
      where: { id: String(req.params.id), status: 'FAILED', version },
      data: {
        status: 'QUEUED',
        retryCount: 0,
        nextAttemptAt: new Date(),
        leaseUntil: null,
        lastErrorCode: null,
        version: { increment: 1 },
      },
    });
    if (!changed.count)
      throw fail(409, '실패한 최신 발송 이력만 재발송할 수 있습니다. 새로고침해 주세요.');
    res.json({ success: true });
  });
  return router;
}
