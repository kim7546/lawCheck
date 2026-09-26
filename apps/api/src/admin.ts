import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Router, type Request } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { AdminSummary } from '@lawcheck/contracts';
import { ChatError } from './chat.js';
import { commonCodesRouter } from './common-codes.js';
import { adminQuestionsRouter } from './admin-questions.js';

const derive = promisify(scrypt);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const COOKIE = 'qaver_admin';
const TTL = 8 * 60 * 60 * 1000;
const cookieOptions = { httpOnly: true, sameSite: 'strict' as const, path: '/api/v1/admin' };
const identity = { id: true, name: true, email: true, username: true } as const;
const userSelection = {
  ...identity,
  expertGroup: true,
  expertCode: { select: { name: true } },
  plan: true,
  planCode: { select: { name: true } },
  isActive: true,
  createdAt: true,
  updatedAt: true,
  adminProfile: { select: { isActive: true } },
  lawyerProfile: { select: { officeName: true } },
} as const;
const fail = (status: number, message: string) => new ChatError(status, 'ADMIN_ERROR', message);
const tokenFrom = (req: Request) =>
  req.headers.cookie
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
const ratio = (part: number, total: number) =>
  total ? Math.round((part / total) * 1000) / 10 : null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function version(value: unknown) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw fail(400, '수정할 데이터 버전이 필요합니다.');
  return new Date(value);
}

export function adminRouter(db: PrismaClient) {
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
        ? await db.adminLoginSession.findUnique({
            where: { tokenHash: hash(token) },
            include: {
              admin: { include: { account: { select: { ...identity, isActive: true } } } },
            },
          })
        : null;
    if (!session || session.expiresAt <= new Date()) throw fail(401, '관리자 로그인이 필요합니다.');
    if (!session.admin.isActive || !session.admin.account.isActive)
      throw fail(403, '활성화된 관리자 권한이 필요합니다.');
    return session.admin.account;
  }
  router.post('/login', async (req, res) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
    const key = req.ip ?? 'unknown';
    const limit = attempts.get(key) ?? { count: 0, expires: now + 60000 };
    attempts.set(key, limit);
    if (++limit.count > 10) throw fail(429, '요청이 많습니다. 1분 후 다시 시도해 주세요.');
    const { identifier, password } = req.body ?? {};
    if (
      typeof identifier !== 'string' ||
      !identifier.trim() ||
      identifier.length > 254 ||
      typeof password !== 'string' ||
      password.length < 10 ||
      password.length > 128
    )
      throw fail(400, '아이디 또는 이메일과 비밀번호(10~128자)를 확인해 주세요.');
    const normalized = identifier.trim().toLowerCase();
    const user = await db.expertAccount.findUnique({
      where: normalized.includes('@') ? { email: normalized } : { username: normalized },
      include: { adminProfile: true },
    });
    const [salt, expected] = user?.passwordHash.split(':') ?? ['0'.repeat(32), '0'.repeat(128)];
    const actual = (await derive(password, salt || '0'.repeat(32), 64)) as Buffer;
    const valid =
      typeof expected === 'string' &&
      /^[a-f0-9]{128}$/.test(expected) &&
      timingSafeEqual(actual, Buffer.from(expected, 'hex'));
    if (!user || !valid || !user.isActive || !user.adminProfile?.isActive)
      throw fail(401, '관리자 계정 또는 비밀번호를 확인해 주세요.');
    const token = randomBytes(32).toString('hex');
    const old = tokenFrom(req);
    await db.$transaction(async (tx) => {
      if (old) await tx.adminLoginSession.deleteMany({ where: { tokenHash: hash(old) } });
      await tx.adminLoginSession.deleteMany({
        where: { accountId: user.id, expiresAt: { lte: new Date() } },
      });
      await tx.adminLoginSession.create({
        data: { accountId: user.id, tokenHash: hash(token), expiresAt: new Date(now + TTL) },
      });
    });
    res.cookie(COOKIE, token, {
      ...cookieOptions,
      secure: req.secure || process.env.NODE_ENV === 'production',
      maxAge: TTL,
    });
    res.json({
      success: true,
      data: { id: user.id, name: user.name, email: user.email, username: user.username },
    });
  });
  router.post('/logout', async (req, res) => {
    const token = tokenFrom(req);
    if (token) await db.adminLoginSession.deleteMany({ where: { tokenHash: hash(token) } });
    res.clearCookie(COOKIE, cookieOptions).json({ success: true });
  });
  // Every management endpoint checks the database on each request, including revoked roles.
  router.use(async (req, res, next) => {
    res.locals.admin = await account(req);
    next();
  });
  router.get('/me', (_req, res) => {
    const { id, name, email, username } = res.locals.admin;
    res.json({ success: true, data: { id, name, email, username } });
  });
  router.use(commonCodesRouter(db, async () => ({ canManageCodes: true }), '/code-groups'));
  router.use(adminQuestionsRouter(db));
  router.get('/summary', async (req, res) => {
    const days = Number(req.query.days ?? 30);
    if (![7, 30, 90].includes(days))
      throw fail(400, '조회 기간은 7일, 30일, 90일 중 선택해 주세요.');
    const now = new Date();
    // Korea calendar days, including today. All review metrics use the request-created cohort.
    const today = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
    const since = new Date(new Date(`${today}T00:00:00+09:00`).getTime() - (days - 1) * 86400000);
    const range = { gte: since, lte: now };
    const postWhere = { createdAt: range };
    const complete = { status: 'COMPLETED' };
    const [
      questions,
      requests,
      verified,
      waiting,
      reviewing,
      overdue,
      completedAnswers,
      selectedAnswers,
      activeExperts,
      average,
      daily,
      experts,
    ] = await db.$transaction(
      [
        db.chatMessage.count({
          where: { role: 'USER', messageType: 'USER_QUESTION', createdAt: range },
        }),
        db.reviewBoardPost.count({ where: postWhere }),
        db.reviewBoardPost.count({ where: { ...postWhere, contributions: { some: complete } } }),
        db.reviewBoardPost.count({ where: { ...postWhere, contributions: { none: {} } } }),
        db.reviewBoardPost.count({
          where: { ...postWhere, contributions: { none: complete, some: { status: 'REVIEWING' } } },
        }),
        db.reviewBoardPost.count({
          where: {
            createdAt: { gte: since, lte: new Date(now.getTime() - 48 * 3600000) },
            contributions: { none: complete },
          },
        }),
        db.reviewContribution.count({ where: { ...complete, post: postWhere } }),
        db.reviewChoice.count({ where: { post: postWhere } }),
        db.expertAccount.count({
          where: { isActive: true, contributions: { some: { post: postWhere } } },
        }),
        db.$queryRaw<{ hours: number | null }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM (first_completed - created_at)) / 3600)::float8 AS hours
        FROM (SELECT p.created_at, MIN(c.completed_at) AS first_completed
          FROM review_board_posts p JOIN review_contributions c ON c.post_id=p.id AND c.status='COMPLETED'
          WHERE p.created_at >= ${since} AND p.created_at <= ${now} GROUP BY p.id) s`,
        db.$queryRaw<AdminSummary['daily']>`
        WITH dates AS (SELECT generate_series(${since}::timestamptz, ${now}::timestamptz, interval '1 day') AS day),
        q AS (SELECT (created_at AT TIME ZONE 'Asia/Seoul')::date AS day, COUNT(*)::int AS n FROM chat_messages
          WHERE role='USER' AND message_type='USER_QUESTION' AND created_at >= ${since} AND created_at <= ${now} GROUP BY 1),
        r AS (SELECT (p.created_at AT TIME ZONE 'Asia/Seoul')::date AS day, COUNT(*)::int AS n,
          COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM review_contributions c WHERE c.post_id=p.id AND c.status='COMPLETED'))::int AS verified
          FROM review_board_posts p WHERE p.created_at >= ${since} AND p.created_at <= ${now} GROUP BY 1)
        SELECT to_char(d.day AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS date, COALESCE(q.n,0) AS questions,
          COALESCE(r.n,0) AS requests, COALESCE(r.verified,0) AS verified
        FROM dates d LEFT JOIN q ON q.day=(d.day AT TIME ZONE 'Asia/Seoul')::date
          LEFT JOIN r ON r.day=(d.day AT TIME ZONE 'Asia/Seoul')::date ORDER BY d.day`,
        db.$queryRaw<AdminSummary['experts']>`
        SELECT a.id, a.name, COALESCE(g.name,'직역 미선택') AS "group",
          COUNT(*) FILTER (WHERE c.status='REVIEWING')::int AS reviewing,
          COUNT(*) FILTER (WHERE c.status='COMPLETED')::int AS completed,
          COUNT(ch.post_id)::int AS selected
        FROM review_contributions c JOIN review_board_posts p ON p.id=c.post_id
          JOIN expert_accounts a ON a.id=c.expert_id
          LEFT JOIN common_code_details g ON g.group_code='EXPERT_GROUP' AND g.code=a.expert_group
          LEFT JOIN review_choices ch ON ch.contribution_id=c.id
        WHERE p.created_at >= ${since} AND p.created_at <= ${now}
        GROUP BY a.id,g.name ORDER BY completed DESC, selected DESC,a.id LIMIT 10`,
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const data: AdminSummary = {
      days,
      since: since.toISOString(),
      generatedAt: now.toISOString(),
      questions,
      requests,
      verified,
      waiting,
      reviewing,
      overdue,
      completedAnswers,
      selectedAnswers,
      activeExperts,
      completionRate: ratio(verified, requests),
      selectionRate: ratio(selectedAnswers, verified),
      averageHours: average[0]?.hours ?? null,
      daily,
      experts,
    };
    res.json({ success: true, data });
  });
  router.get('/users', async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const search = req.query.search ?? '';
    const group = req.query.group ?? '';
    const role = req.query.role ?? '';
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100000 ||
      typeof search !== 'string' ||
      search.length > 100 ||
      typeof group !== 'string' ||
      group.length > 50 ||
      !['', 'admin', 'inactive'].includes(String(role))
    )
      throw fail(400, '사용자 조회 조건을 확인해 주세요.');
    const where: Prisma.ExpertAccountWhereInput = {
      ...(search.trim()
        ? {
            OR: ['name', 'email', 'username'].map((field) => ({
              [field]: { contains: search.trim(), mode: 'insensitive' },
            })),
          }
        : {}),
      ...(group ? { expertGroup: group === 'NONE' ? null : group } : {}),
      ...(role === 'admin'
        ? { adminProfile: { isActive: true } }
        : role === 'inactive'
          ? { isActive: false }
          : {}),
    };
    const [items, total] = await db.$transaction([
      db.expertAccount.findMany({
        where,
        select: userSelection,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      db.expertAccount.count({ where }),
    ]);
    res.json({ success: true, data: { items, total, page } });
  });
  router.post('/users/:id', async (req, res) => {
    const id = String(req.params.id);
    const { name, plan, isActive, isAdmin } = req.body ?? {};
    const previous = version(req.body?.updatedAt);
    if (
      !uuid.test(id) ||
      typeof name !== 'string' ||
      !name.trim() ||
      name.trim().length > 100 ||
      typeof plan !== 'string' ||
      plan.length > 50 ||
      typeof isActive !== 'boolean' ||
      typeof isAdmin !== 'boolean'
    )
      throw fail(400, '이름, 요금제, 계정 상태와 관리자 권한을 확인해 주세요.');
    if (id === res.locals.admin.id && (!isActive || !isAdmin))
      throw fail(409, '현재 로그인한 관리자는 자신의 계정이나 관리자 권한을 중지할 수 없습니다.');
    const user = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT account_id FROM expert_admin_profiles ORDER BY account_id FOR UPDATE`;
      // Re-check the actor after acquiring the role lock (another administrator may have revoked it).
      const actor = await tx.expertAdminProfile.findUnique({
        where: { accountId: res.locals.admin.id },
        include: { account: { select: { isActive: true } } },
      });
      if (!actor?.isActive || !actor.account.isActive)
        throw fail(403, '활성화된 관리자 권한이 필요합니다.');
      const current = await tx.expertAccount.findUnique({ where: { id }, select: { plan: true } });
      if (!current) throw fail(404, '회원을 찾을 수 없습니다.');
      if (plan !== current.plan) {
        const nextPlan = await tx.commonCodeDetail.findUnique({
          where: { groupCode_code: { groupCode: 'PLAN', code: plan } },
          include: { group: true },
        });
        if (!nextPlan?.isActive || !nextPlan.group.isActive)
          throw fail(400, '사용 중인 요금제를 선택해 주세요.');
      }
      const changed = await tx.expertAccount.updateMany({
        where: { id, updatedAt: previous },
        data: {
          name: name.trim(),
          plan,
          isActive,
          updatedAt: new Date(Math.max(Date.now(), previous.getTime() + 1)),
        },
      });
      if (!changed.count)
        throw fail(409, '다른 관리자가 수정했습니다. 새로고침 후 다시 시도해 주세요.');
      if (isAdmin)
        await tx.expertAdminProfile.upsert({
          where: { accountId: id },
          create: { accountId: id },
          update: { isActive: true },
        });
      else
        await tx.expertAdminProfile.updateMany({
          where: { accountId: id },
          data: { isActive: false },
        });
      if (!isActive || !isAdmin)
        await tx.adminLoginSession.deleteMany({ where: { accountId: id } });
      if (!isActive) await tx.expertLoginSession.deleteMany({ where: { accountId: id } });
      return tx.expertAccount.findUniqueOrThrow({ where: { id }, select: userSelection });
    });
    res.json({ success: true, data: user });
  });
  router.get('/menus', async (_req, res) => {
    res.json({
      success: true,
      data: await db.boMenu.findMany({ orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] }),
    });
  });
  router.post('/menus/:key', async (req, res) => {
    const key = String(req.params.key);
    const { label, sortOrder, isActive } = req.body ?? {};
    const previous = version(req.body?.updatedAt);
    if (
      !['dashboard', 'reviews', 'community', 'codes'].includes(key) ||
      typeof label !== 'string' ||
      !label.trim() ||
      label.trim().length > 50 ||
      !Number.isInteger(sortOrder) ||
      sortOrder < 0 ||
      sortOrder > 99999 ||
      typeof isActive !== 'boolean'
    )
      throw fail(400, '메뉴명(1~50자), 순서(0~99999), 표시 여부를 확인해 주세요.');
    if (key === 'dashboard' && !isActive)
      throw fail(400, 'BO 첫 화면인 대시보드는 항상 표시해야 합니다.');
    const changed = await db.boMenu.updateMany({
      where: { key, updatedAt: previous },
      data: {
        label: label.trim(),
        sortOrder,
        isActive,
        updatedAt: new Date(Math.max(Date.now(), previous.getTime() + 1)),
      },
    });
    if (!changed.count)
      throw fail(409, '다른 관리자가 수정했거나 존재하지 않는 메뉴입니다. 새로고침해 주세요.');
    res.json({ success: true, data: await db.boMenu.findUniqueOrThrow({ where: { key } }) });
  });
  return router;
}
