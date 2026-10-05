import { createHash, randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { EmailTransportError, type EmailProvider } from './email-provider.js';
import { renderAnswerEmail } from './email-template.js';

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function answerOrigin(env: NodeJS.ProcessEnv = process.env) {
  const url = new URL(
    env.FO_PUBLIC_URL ??
      (env.NODE_ENV === 'production' ? 'https://search.aiqaver.com' : 'http://localhost:5173'),
  );
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (env.NODE_ENV === 'production' && url.protocol !== 'https:')
  )
    throw new Error('CONFIG: FO_PUBLIC_URL must be a public HTTPS URL');
  return url.origin;
}
export async function enqueueAnswerEmail(
  tx: Prisma.TransactionClient,
  postId: string,
  expertId: string,
  origin: string,
) {
  const answer = await tx.reviewContribution.findUniqueOrThrow({
    where: { postId_expertId: { postId, expertId } },
    include: { post: true, expert: true },
  });
  const token = randomBytes(32).toString('hex');
  const link = `${origin}/#answer=${token}`;
  await tx.answerEmailDelivery.create({
    data: {
      contributionId: answer.id,
      recipient: answer.post.requesterEmail,
      subject: '[AI QAVER] 질문에 전문가 답변이 등록되었습니다',
      body: `등록하신 질문에 ${answer.expert.name}님이 답변했습니다.\n\n질문\n${answer.post.question}\n\n답변\n${answer.reply}\n\n답변 확인 링크 (30일간 유효)\n${link}\n\n이 링크를 가진 사람은 질문 대화를 복원하고 이어서 질문할 수 있으므로 공유에 주의해 주세요.`,
      linkTokenHash: tokenHash(token),
      linkExpiresAt: new Date(Date.now() + 30 * 86400000),
    },
  });
}

export function renewAnswerLink(body: string) {
  const token = randomBytes(32).toString('hex');
  const index = body.lastIndexOf('#answer=');
  if (index < 0 || !/^[a-f0-9]{64}$/.test(body.slice(index + 8, index + 72)))
    throw new Error('Invalid stored answer link');
  return {
    body: body.slice(0, index + 8) + token + body.slice(index + 72),
    linkTokenHash: tokenHash(token),
    linkExpiresAt: new Date(Date.now() + 30 * 86400000),
  };
}

// Claim under a database row lock; network IO is always outside the transaction.
export async function processAnswerEmail(
  db: PrismaClient,
  provider?: EmailProvider,
): Promise<boolean> {
  if (!provider) return false;
  const job = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM answer_email_deliveries
      WHERE (status IN ('QUEUED','RETRY') AND next_attempt_at <= now())
        OR (status='SENDING' AND lease_until <= now())
      ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (!rows[0]) return null;
    const old = await tx.answerEmailDelivery.findUniqueOrThrow({ where: { id: rows[0].id } });
    if (old.status === 'SENDING') {
      await tx.answerEmailAttempt.updateMany({
        where: { deliveryId: old.id, status: 'SENDING' },
        data: { status: 'FAILED', errorCode: 'LEASE_EXPIRED', finishedAt: new Date() },
      });
    }
    if (old.retryCount >= 5) {
      await tx.answerEmailDelivery.update({
        where: { id: old.id },
        data: {
          status: 'FAILED',
          leaseUntil: null,
          lastErrorCode: 'LEASE_EXPIRED',
          version: { increment: 1 },
        },
      });
      return null;
    }
    const renewed = old.linkExpiresAt <= new Date() ? renewAnswerLink(old.body) : {};
    const delivery = await tx.answerEmailDelivery.update({
      where: { id: old.id },
      data: {
        ...renewed,
        status: 'SENDING',
        attemptCount: { increment: 1 },
        retryCount: { increment: 1 },
        leaseUntil: new Date(Date.now() + 5 * 60000),
        version: { increment: 1 },
      },
    });
    const attempt = await tx.answerEmailAttempt.create({
      data: { deliveryId: old.id, attemptNo: delivery.attemptCount },
    });
    return { delivery, attempt };
  });
  if (!job) return false;
  let errorCode: string | null = null;
  try {
    await provider.send({
      recipient: job.delivery.recipient,
      subject: job.delivery.subject,
      text: job.delivery.body,
      html: renderAnswerEmail(job.delivery.body),
      messageKey: job.attempt.id,
    });
  } catch (error) {
    errorCode = error instanceof EmailTransportError ? error.code : 'DELIVERY_ERROR';
  }
  await db.$transaction(async (tx) => {
    const status = errorCode ? (job.delivery.retryCount >= 5 ? 'FAILED' : 'RETRY') : 'SENT';
    const updated = await tx.answerEmailDelivery.updateMany({
      where: { id: job.delivery.id, status: 'SENDING', version: job.delivery.version },
      data: {
        status,
        leaseUntil: null,
        lastErrorCode: errorCode,
        sentAt: errorCode ? null : new Date(),
        nextAttemptAt: new Date(Date.now() + 30000 * 2 ** (job.delivery.retryCount - 1)),
        version: { increment: 1 },
      },
    });
    if (updated.count)
      await tx.answerEmailAttempt.update({
        where: { id: job.attempt.id },
        data: {
          status: errorCode ? 'FAILED' : 'SENT',
          errorCode,
          finishedAt: new Date(),
        },
      });
  });
  return true;
}
export function startAnswerEmailWorker(db: PrismaClient, provider?: EmailProvider) {
  let stopped = false;
  let running: Promise<void> | undefined;
  const tick = () => {
    if (stopped || running || !provider) return;
    running = (async () => {
      for (let i = 0; i < 20 && !stopped; i++) if (!(await processAnswerEmail(db, provider))) break;
    })()
      .catch(() => console.error('[lawCheck email] Queue processing failed; will retry.'))
      .finally(() => {
        running = undefined;
      });
  };
  const timer = setInterval(tick, 5000);
  timer.unref();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await running;
  };
}
