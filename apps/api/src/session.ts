import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

export const MAX_QUESTIONS = 3;
const COOKIE = 'lawcheck_session';
const TTL = 24 * 60 * 60 * 1000;

// Prototype-only store: counters expire after 24 hours or an API restart.
// Conversation text and credentials are not retained in this store.
export function createSessionStore() {
  const sessions = new Map<string, { used: number; pending: boolean; expires: number }>();
  return (req: Request, res: Response, reset = false) => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (session.expires < now && !session.pending) sessions.delete(id);
    }
    const id = req.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    const existing = id ? sessions.get(id) : undefined;
    if (existing && !reset) return existing;
    if (id && reset) sessions.delete(id);
    const token = randomBytes(32).toString('hex');
    const session = { used: 0, pending: false, expires: now + TTL };
    sessions.set(token, session);
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure,
      path: '/api/v1',
    });
    return session;
  };
}
