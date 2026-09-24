import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import type { FoBrowser, PrismaClient } from '@prisma/client';
import { ChatError } from './chat.js';

const COOKIE = 'qaver_browser';
export const HISTORY_TTL = 30 * 24 * 60 * 60 * 1000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const cookieValue = (req: Request, name: string) =>
  req.headers.cookie
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`))
    ?.slice(name.length + 1);

export class FoHistory {
  constructor(private db: PrismaClient) {}

  async browser(req: Request, res: Response): Promise<FoBrowser> {
    if (res.locals.foBrowser) return res.locals.foBrowser;
    const token = cookieValue(req, COOKIE);
    let browser =
      token && /^[a-f0-9]{64}$/.test(token)
        ? await this.db.foBrowser.findFirst({
            where: { tokenHash: hash(token), expiresAt: { gt: new Date() } },
          })
        : null;
    if (!browser) {
      const secret = randomBytes(32).toString('hex');
      browser = await this.db.foBrowser.create({
        data: { tokenHash: hash(secret), expiresAt: new Date(Date.now() + HISTORY_TTL) },
      });
      res.cookie(COOKIE, secret, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production' || req.secure,
        path: '/api/v1',
        maxAge: HISTORY_TTL,
      });
    }
    res.locals.foBrowser = browser;
    return browser;
  }

  async session(req: Request, res: Response, officeId: string, limited: boolean, reset: boolean) {
    const browser = await this.browser(req, res);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM fo_browsers WHERE id = ${browser.id}::uuid FOR UPDATE`;
      const current = await tx.foBrowser.findUniqueOrThrow({ where: { id: browser.id } });
      if (!reset && current.activeSessionId) {
        const owned = await tx.foConversation.findFirst({
          where: {
            browserId: browser.id,
            sessionId: current.activeSessionId,
            session: { lawOfficeId: officeId },
          },
          include: { session: true },
        });
        if (owned) {
          if (owned.session.expiresAt <= new Date())
            return tx.chatSession.update({
              where: { id: owned.sessionId },
              data: { expiresAt: browser.expiresAt },
            });
          return owned.session;
        }
      }
      // Adopt a valid pre-sidebar conversation on the browser's first visit.
      const legacyToken = cookieValue(req, 'lawcheck_session');
      const legacy =
        !reset && !current.activeSessionId && legacyToken && /^[a-f0-9]{64}$/.test(legacyToken)
          ? await tx.chatSession.findFirst({
              where: {
                sessionTokenHash: hash(legacyToken),
                lawOfficeId: officeId,
                expiresAt: { gt: new Date() },
                foConversation: null,
              },
            })
          : null;
      const session =
        legacy ??
        (await tx.chatSession.create({
          data: {
            lawOfficeId: officeId,
            sessionTokenHash: hash(randomBytes(32).toString('hex')),
            maxQuestionCount: limited ? 3 : null,
            expiresAt: browser.expiresAt,
          },
        }));
      await tx.foConversation.create({ data: { browserId: browser.id, sessionId: session.id } });
      await tx.foBrowser.update({
        where: { id: browser.id },
        data: { activeSessionId: session.id },
      });
      return session;
    });
  }

  async sessionIds(req: Request, res: Response) {
    const browser = await this.browser(req, res);
    const links = await this.db.foConversation.findMany({
      where: { browserId: browser.id },
      select: { sessionId: true },
    });
    return { browserId: browser.id, ids: links.map((link) => link.sessionId) };
  }

  async list(req: Request, res: Response) {
    const browser = await this.browser(req, res);
    const links = await this.db.foConversation.findMany({
      where: { browserId: browser.id, session: { messages: { some: { role: 'USER' } } } },
      orderBy: { session: { updatedAt: 'desc' } },
      include: {
        session: {
          select: {
            updatedAt: true,
            messages: {
              where: { role: 'USER' },
              orderBy: { sequenceNo: 'asc' },
              take: 1,
              select: { content: true },
            },
          },
        },
      },
    });
    return links.map((link) => ({
      id: link.sessionId,
      title: link.session.messages[0]?.content ?? '새 대화',
      updatedAt: link.session.updatedAt,
    }));
  }

  async select(req: Request, res: Response, sessionId: string) {
    await this.ownedSession(req, res, sessionId);
    const browser = await this.browser(req, res);
    await this.db.foBrowser.update({
      where: { id: browser.id },
      data: { activeSessionId: sessionId },
    });
  }

  async ownedSession(req: Request, res: Response, sessionId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(sessionId))
      throw new ChatError(404, 'NOT_FOUND', '대화를 찾을 수 없습니다.');
    const browser = await this.browser(req, res);
    const owned = await this.db.foConversation.findFirst({
      where: { browserId: browser.id, sessionId },
      include: { session: true },
    });
    if (!owned) throw new ChatError(404, 'NOT_FOUND', '대화를 찾을 수 없습니다.');
    if (owned.session.expiresAt <= new Date())
      return this.db.chatSession.update({
        where: { id: sessionId },
        data: { expiresAt: browser.expiresAt },
      });
    return owned.session;
  }
}
