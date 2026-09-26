import { Router, type Request, type ErrorRequestHandler } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import { ChatError } from './chat.js';

const fail = (status: number, message: string) =>
  new ChatError(status, 'COMMON_CODE_ERROR', message);
function code(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Z][A-Z0-9_]{0,49}$/.test(value))
    throw fail(400, '코드는 영문 대문자로 시작하는 대문자·숫자·밑줄 1~50자입니다.');
  return value;
}
function fields(body: Record<string, unknown> | undefined) {
  const { name, description = '', sortOrder, isActive } = body ?? {};
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 100 ||
    typeof description !== 'string' ||
    description.length > 500 ||
    !Number.isInteger(sortOrder) ||
    Number(sortOrder) < 0 ||
    Number(sortOrder) > 99999 ||
    typeof isActive !== 'boolean'
  )
    throw fail(
      400,
      '코드명(1~100자), 설명(500자 이하), 정렬순서(0~99999), 사용 여부를 확인해 주세요.',
    );
  return {
    name: name.trim(),
    description: description.trim(),
    sortOrder: Number(sortOrder),
    isActive,
  };
}
function version(value: unknown) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw fail(400, '수정할 데이터 버전이 필요합니다.');
  return new Date(value);
}
export function commonCodesRouter(
  db: PrismaClient,
  account: (req: Request) => Promise<{ canManageCodes: boolean }>,
  base = '/bo/code-groups',
) {
  const router = Router();
  router.use(base, async (req, _res, next) => {
    const user = await account(req);
    if (!user.canManageCodes) throw fail(403, '공통 코드 관리 권한이 필요합니다.');
    next();
  });
  router.get(base, async (_req, res) => {
    res.json({
      success: true,
      data: await db.commonCodeGroup.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
    });
  });
  router.post(base, async (req, res) => {
    res.status(201).json({
      success: true,
      data: await db.$transaction((tx) =>
        tx.commonCodeGroup.create({
          data: { code: code(req.body?.code), ...fields(req.body) },
        }),
      ),
    });
  });
  router.post(`${base}/:group`, async (req, res) => {
    const group = code(req.params.group);
    if (req.body?.code !== undefined && req.body.code !== group)
      throw fail(400, '기존 코드 값은 변경할 수 없습니다.');
    const previous = version(req.body?.updatedAt);
    const changed = await db.commonCodeGroup.updateMany({
      where: { code: group, updatedAt: previous },
      data: {
        ...fields(req.body),
        updatedAt: new Date(Math.max(Date.now(), previous.getTime() + 1)),
      },
    });
    if (!changed.count)
      throw fail(409, '다른 관리자가 수정했거나 존재하지 않는 그룹입니다. 새로고침해 주세요.');
    res.json({
      success: true,
      data: await db.commonCodeGroup.findUniqueOrThrow({ where: { code: group } }),
    });
  });
  router.get(`${base}/:group/details`, async (req, res) => {
    const group = code(req.params.group);
    if (!(await db.commonCodeGroup.findUnique({ where: { code: group }, select: { code: true } })))
      throw fail(404, '그룹을 찾을 수 없습니다.');
    res.json({
      success: true,
      data: await db.commonCodeDetail.findMany({
        where: { groupCode: group },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      }),
    });
  });
  router.post(`${base}/:group/details`, async (req, res) => {
    res.status(201).json({
      success: true,
      data: await db.$transaction((tx) =>
        tx.commonCodeDetail.create({
          data: {
            groupCode: code(req.params.group),
            code: code(req.body?.code),
            ...fields(req.body),
          },
        }),
      ),
    });
  });
  router.post(`${base}/:group/details/:detail`, async (req, res) => {
    const groupCode = code(req.params.group);
    const detailCode = code(req.params.detail);
    if (
      (req.body?.code !== undefined && req.body.code !== detailCode) ||
      (req.body?.groupCode !== undefined && req.body.groupCode !== groupCode)
    )
      throw fail(400, '기존 코드 값과 소속 그룹은 변경할 수 없습니다.');
    const previous = version(req.body?.updatedAt);
    const changed = await db.commonCodeDetail.updateMany({
      where: { groupCode, code: detailCode, updatedAt: previous },
      data: {
        ...fields(req.body),
        updatedAt: new Date(Math.max(Date.now(), previous.getTime() + 1)),
      },
    });
    if (!changed.count)
      throw fail(409, '다른 관리자가 수정했거나 존재하지 않는 코드입니다. 새로고침해 주세요.');
    res.json({
      success: true,
      data: await db.commonCodeDetail.findUniqueOrThrow({
        where: { groupCode_code: { groupCode, code: detailCode } },
      }),
    });
  });
  const handleError: ErrorRequestHandler = (error: unknown, _req, _res, next) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') return next(fail(409, '이미 등록된 코드입니다.'));
      if (error.code === 'P2003' || error.code === 'P2025')
        return next(fail(404, '그룹 또는 코드를 찾을 수 없습니다.'));
    }
    next(error);
  };
  router.use(handleError);
  return router;
}
