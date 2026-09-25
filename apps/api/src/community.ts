import { Router, type Request } from 'express';
import type { PrismaClient } from '@prisma/client';
import { ChatError } from './chat.js';

const fail = (status: number, message: string) => new ChatError(status, 'COMMUNITY_ERROR', message);
const summary = {
  id: true,
  title: true,
  createdAt: true,
  author: { select: { id: true, name: true } },
  _count: { select: { replies: true } },
} as const;
function pageNumber(value: unknown) {
  const page = Number(value ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 100000)
    throw fail(400, '페이지를 확인해 주세요.');
  return page;
}
function content(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw fail(400, `내용을 1~${max.toLocaleString('ko-KR')}자로 입력해 주세요.`);
  return value.trim();
}
function postId(req: Request) {
  const id = String(req.params.id);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw fail(404, '게시글을 찾을 수 없습니다.');
  return id;
}
export function communityRouter(
  db: PrismaClient,
  account: (req: Request) => Promise<{ id: string }>,
) {
  const router = Router();
  router.get('/bo/dashboard', async (req, res) => {
    const user = await account(req);
    const [reviews, bestPosts, reviewCount, communityCount] = await Promise.all([
      db.reviewBoardPost.findMany({
        take: 5,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          question: true,
          createdAt: true,
          contributions: { where: { reviewerId: user.id }, select: { status: true } },
        },
      }),
      db.communityPost.findMany({
        take: 5,
        orderBy: [{ replies: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }],
        select: summary,
      }),
      db.reviewBoardPost.count(),
      db.communityPost.count(),
    ]);
    res.json({
      success: true,
      data: {
        reviewCount,
        communityCount,
        reviews: reviews.map(({ contributions, ...post }) => ({
          ...post,
          status: contributions[0]?.status ?? 'REQUESTED',
        })),
        bestPosts,
      },
    });
  });
  router.get('/bo/community', async (req, res) => {
    await account(req);
    const page = pageNumber(req.query.page);
    const [items, total] = await Promise.all([
      db.communityPost.findMany({
        skip: (page - 1) * 20,
        take: 20,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: summary,
      }),
      db.communityPost.count(),
    ]);
    res.json({ success: true, data: { items, total, page } });
  });
  router.post('/bo/community', async (req, res) => {
    const user = await account(req);
    const title = content(req.body?.title, 200);
    const body = content(req.body?.content, 20000);
    const post = await db.communityPost.create({
      data: { authorId: user.id, title, content: body },
      select: { id: true },
    });
    res.status(201).json({ success: true, data: post });
  });
  router.get('/bo/community/:id', async (req, res) => {
    await account(req);
    const id = postId(req);
    const page = pageNumber(req.query.page);
    const post = await db.communityPost.findUnique({
      where: { id },
      select: {
        ...summary,
        content: true,
        replies: {
          skip: (page - 1) * 20,
          take: 20,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!post) throw fail(404, '게시글을 찾을 수 없습니다.');
    res.json({ success: true, data: { ...post, page } });
  });
  router.post('/bo/community/:id/replies', async (req, res) => {
    const user = await account(req);
    const id = postId(req);
    const body = content(req.body?.content, 5000);
    if (!(await db.communityPost.findUnique({ where: { id }, select: { id: true } })))
      throw fail(404, '게시글을 찾을 수 없습니다.');
    const reply = await db.communityReply.create({
      data: { postId: id, authorId: user.id, content: body },
      select: { id: true },
    });
    res.status(201).json({ success: true, data: reply });
  });
  return router;
}
