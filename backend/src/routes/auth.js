import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import {
  clearSessionCookie, createSession, hashPassword, publicCustomer, requireCustomer,
  setSessionCookie, verifyAgainstDummy, verifyPassword
} from '../lib/auth.js';
import { loginSchema, registerSchema } from '../validators/schemas.js';

const invalid = (response, code, parsed) => {
  const reasons = [...new Set(parsed.error.issues.map((issue) => issue.message))];
  return response.status(422).json({ error: { code, message: reasons.join(' '), details: parsed.error.flatten() } });
};

export function createAuthRouter({ db = prisma, limit = 10 } = {}) {
  const router = Router();
  // Slows password guessing. Behind Caddy this needs trust proxy, or every visitor shares one bucket.
  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many sign-in attempts. Wait a few minutes and try again.' } } });

  router.post('/register', authLimiter, async (request, response, next) => {
    try {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) return invalid(response, 'INVALID_ACCOUNT', parsed);
      const { name, email, password } = parsed.data;
      const existing = await db.customer.findUnique({ where: { email } });
      if (existing) return response.status(409).json({ error: { code: 'EMAIL_IN_USE', message: 'An account with that email already exists. Sign in instead.' } });
      const customer = await db.customer.create({ data: { name, email, passwordHash: await hashPassword(password) } });
      setSessionCookie(response, await createSession(db, customer.id));
      response.status(201).json({ customer: publicCustomer(customer) });
    } catch (error) {
      if (error?.code === 'P2002') return response.status(409).json({ error: { code: 'EMAIL_IN_USE', message: 'An account with that email already exists. Sign in instead.' } });
      next(error);
    }
  });

  router.post('/login', authLimiter, async (request, response, next) => {
    try {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) return invalid(response, 'INVALID_LOGIN', parsed);
      const customer = await db.customer.findUnique({ where: { email: parsed.data.email } });
      const ok = customer ? await verifyPassword(parsed.data.password, customer.passwordHash) : await verifyAgainstDummy(parsed.data.password);
      // One message for both cases, so the response does not reveal which emails have accounts.
      if (!customer || !ok) return response.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
      setSessionCookie(response, await createSession(db, customer.id));
      response.json({ customer: publicCustomer(customer) });
    } catch (error) { next(error); }
  });

  router.post('/logout', async (request, response, next) => {
    try {
      if (request.sessionTokenHash) await db.session.deleteMany({ where: { tokenHash: request.sessionTokenHash } });
      clearSessionCookie(response);
      response.status(204).end();
    } catch (error) { next(error); }
  });

  router.get('/me', requireCustomer, (request, response) => response.json({ customer: request.customer }));

  return router;
}

export default createAuthRouter;
