import { Router, type Request } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { AdminQuestion, QuestionTopic } from '@lawcheck/contracts';
import { ChatError } from './chat.js';

const invalid = (message: string) => new ChatError(400, 'ADMIN_ERROR', message);
const day = 86400000;
function parseDate(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw invalid('날짜는 YYYY-MM-DD 형식으로 입력해 주세요.');
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value)
    throw invalid('존재하는 날짜를 입력해 주세요.');
  return timestamp;
}
function period(query: Request['query']) {
  let startDate: string;
  let endDate: string;
  if (query.startDate !== undefined || query.endDate !== undefined) {
    if (query.year !== undefined) throw invalid('연도 또는 일자 중 하나로 조회해 주세요.');
    parseDate(query.startDate);
    parseDate(query.endDate);
    startDate = query.startDate as string;
    endDate = query.endDate as string;
  } else {
    const year = query.year ?? String(new Date(Date.now() + 9 * 3600000).getUTCFullYear());
    if (typeof year !== 'string' || !/^\d{4}$/.test(year) || Number(year) < 1900)
      throw invalid('조회 연도는 1900~9999년으로 입력해 주세요.');
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
  }
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (start > end) throw invalid('시작일은 종료일보다 늦을 수 없습니다.');
  // Dates are inclusive in Korea; use an exclusive next-day boundary in the database.
  return {
    startDate,
    endDate,
    from: new Date(start - 9 * 3600000),
    until: new Date(end + day - 9 * 3600000),
  };
}

// Existing messages have no topic field. Apply the same deterministic rules to listing
// and aggregation, including historical records. First match wins; no external AI call.
const rules: { topic: QuestionTopic; pattern: string }[] = [
  {
    topic: 'realEstate',
    pattern:
      '부동산|임대차|임대인|임차인|전세|월세|보증금|집주인|세입자|명도|등기|재개발|재건축|분양',
  },
  {
    topic: 'labor',
    pattern: '근로|노동|직장|임금|급여|퇴직|퇴사|해고|산재|연차|실업급여|부당해고|체불',
  },
  { topic: 'family', pattern: '이혼|상속|양육|친권|혼인|유언|유류분|가족|가정폭력|재산분할|입양' },
  {
    topic: 'criminal',
    pattern: '사기|횡령|배임|폭행|협박|고소|고발|형사|범죄|절도|명예훼손|성범죄|스토킹|음주운전',
  },
  {
    topic: 'business',
    pattern: '사업|법인|세금|세무|부가세|소득세|법인세|상표|특허|저작권|창업|주주|동업',
  },
  {
    topic: 'money',
    pattern: '대여금|채권|채무|돈|대출|이자|손해배상|민사|지급명령|가압류|회생|파산|환불|계약|금전',
  },
];
const topicSql = Prisma.sql`CASE
  WHEN EXISTS (SELECT 1 FROM chat_messages a WHERE a.law_office_id=q.law_office_id
    AND a.session_id=q.session_id AND a.parent_message_id=q.id
    AND a.role='ASSISTANT' AND a.message_type='NON_LEGAL_NOTICE') THEN 'nonLegal'
  ${Prisma.join(
    rules.map(({ topic, pattern }) => Prisma.sql`WHEN q.content ~* ${pattern} THEN ${topic}`),
    ' ',
  )}
  ELSE 'other' END`;

export function adminQuestionsRouter(db: PrismaClient) {
  const router = Router();
  router.get('/questions', async (req, res) => {
    const { startDate, endDate, from, until } = period(req.query);
    const pageInput = req.query.page ?? '1';
    if (typeof pageInput !== 'string' || !/^[1-9]\d{0,5}$/.test(pageInput))
      throw invalid('페이지 번호를 확인해 주세요.');
    const page = Number(pageInput);
    const pageSize = 20;
    const where = Prisma.sql`q.role='USER' AND q.message_type='USER_QUESTION'
      AND q.created_at >= ${from} AND q.created_at < ${until}`;
    const data = await db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          (Omit<AdminQuestion, 'answers' | 'createdAt'> & {
            createdAt: Date;
            lawOfficeId: string;
            sessionId: string;
          })[]
        >`
        SELECT q.id, q.content, q.law_office_id AS "lawOfficeId", q.session_id AS "sessionId",
          q.created_at AS "createdAt", q.processing_status AS "processingStatus",
          ${topicSql} AS topic FROM chat_messages q WHERE ${where}
        ORDER BY q.created_at DESC, q.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
        const [count] = await tx.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS total FROM chat_messages q WHERE ${where}`;
        const answers = await tx.chatMessage.findMany({
          where: {
            OR: rows.map((row) => ({
              lawOfficeId: row.lawOfficeId,
              sessionId: row.sessionId,
              parentMessageId: row.id,
            })),
            role: 'ASSISTANT',
          },
          select: {
            id: true,
            parentMessageId: true,
            content: true,
            messageType: true,
            createdAt: true,
          },
          orderBy: [{ sequenceNo: 'asc' }, { id: 'asc' }],
        });
        const reviews = await tx.reviewBoardPost.findMany({
          where: { answerMessageId: { in: answers.map((answer) => answer.id) } },
          select: {
            answerMessageId: true,
            contributions: {
              where: { status: 'COMPLETED', reply: { not: null } },
              select: {
                id: true,
                reply: true,
                completedAt: true,
                createdAt: true,
                expert: { select: { name: true } },
              },
              orderBy: [{ completedAt: 'asc' }, { id: 'asc' }],
            },
          },
        });
        const items: AdminQuestion[] = rows.map((row) => ({
          id: row.id,
          content: row.content,
          topic: row.topic,
          processingStatus: row.processingStatus,
          createdAt: row.createdAt.toISOString(),
          answers: answers
            .filter((answer) => answer.parentMessageId === row.id)
            .flatMap((answer) => [
              {
                id: answer.id,
                content: answer.content,
                createdAt: answer.createdAt.toISOString(),
                kind:
                  answer.messageType === 'NON_LEGAL_NOTICE' ? ('NOTICE' as const) : ('AI' as const),
                author: 'AI QAVER',
              },
              ...(
                reviews.find((review) => review.answerMessageId === answer.id)?.contributions ?? []
              ).map((reply) => ({
                id: reply.id,
                content: reply.reply!,
                createdAt: (reply.completedAt ?? reply.createdAt).toISOString(),
                kind: 'EXPERT' as const,
                author: reply.expert.name,
              })),
            ]),
        }));
        return { items, total: count?.total ?? 0, page, pageSize, startDate, endDate };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    res.json({ success: true, data });
  });
  router.get('/question-statistics', async (req, res) => {
    const { startDate, endDate, from, until } = period(req.query);
    const counts = await db.$queryRaw<{ topic: QuestionTopic; count: number }[]>`
      SELECT ${topicSql} AS topic, count(*)::int AS count FROM chat_messages q
      WHERE q.role='USER' AND q.message_type='USER_QUESTION'
        AND q.created_at >= ${from} AND q.created_at < ${until}
      GROUP BY 1`;
    const total = counts.reduce((sum, row) => sum + row.count, 0);
    const topicCodes: QuestionTopic[] = [...rules.map(({ topic }) => topic), 'other', 'nonLegal'];
    const topics = topicCodes
      .map((topic) => {
        const count = counts.find((row) => row.topic === topic)?.count ?? 0;
        return {
          topic,
          count,
          percentage: total ? Math.round((count / total) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.count - a.count);
    res.json({ success: true, data: { startDate, endDate, total, topics } });
  });
  return router;
}
