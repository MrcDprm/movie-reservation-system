// Account endpoints under /api/auth.
//
// No endpoint reveals whether an e-mail is registered: register, resend and forgot always
// answer 202 "check your e-mail". The owner of an existing address gets a notice instead.
// Sign-up asks only for the address. Name and password are chosen on the page the link opens,
// so only the person holding the inbox can set them (no one can pre-register someone else's
// address with a password of their own). Opening that page confirms the address and logs in.
import { Router } from 'express';
import { z } from 'zod';

import { AppError } from '../errors.js';
import { buildEmail } from '../mail.js';
import { clientIp, enforce } from '../rateLimit.js';
import { publicUser, requireUser } from './middleware.js';
import { burnPasswordCheck, hashPassword, passwordProblem, verifyPassword } from './password.js';
import {
  SESSION_COOKIE,
  consumeEmailToken,
  createEmailToken,
  createSession,
  findEmailToken,
  hashToken,
  sessionCookieOptions,
} from './tokens.js';

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const lang = z.enum(['tr', 'en']).default('tr');
const token = z.string().min(20).max(100);

const schemas = {
  register: z.object({ email, lang }),
  login: z.object({ email, password: z.string().max(200) }),
  emailOnly: z.object({ email, lang }),
  verify: z.object({ token, name: z.string().trim().min(1).max(60), password: z.string().max(200) }),
  reset: z.object({ token, password: z.string().max(200) }),
};

function parse(schema, body) {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw new AppError(400, 'invalid_input', { fields: [...new Set(result.error.issues.map((i) => i.path[0]))] });
  }
  return result.data;
}

const MINUTE = 60;
const HOUR = 3600;

export function createAuthRouter({ db, mailer, config }) {
  const router = Router();
  const cookieOptions = sessionCookieOptions(config);
  const { maxAge, ...clearOptions } = cookieOptions;

  const link = (path, value) => `${config.APP_ORIGIN}${path}?token=${encodeURIComponent(value)}`;
  const mail = (user, kind, lang, url) =>
    mailer.send({ to: user.email, ...buildEmail({ kind, lang, name: user.name, link: url, appName: config.APP_NAME }) });

  // A new session every time; the one this browser had before (if any) is ended.
  const logIn = async (req, res, userId) => {
    const previous = req.cookies?.[SESSION_COOKIE];
    if (previous) await db().session.deleteMany({ where: { tokenHash: hashToken(previous) } });
    res.cookie(SESSION_COOKIE, await createSession(db(), userId), cookieOptions);
  };

  router.post('/register', async (req, res) => {
    const ip = clientIp(req);
    await enforce(db(), [{ key: `register:ip:${ip}`, limit: 10, windowSeconds: HOUR }]);
    const input = parse(schemas.register, req.body);
    // Each sign-up sends an e-mail: limit them per address too, so nobody can flood an inbox.
    await enforce(db(), [{ key: `register:email:${input.email}`, limit: 3, windowSeconds: HOUR }]);

    const existing = await db().user.findUnique({ where: { email: input.email } });
    if (existing?.emailVerifiedAt) {
      const resetToken = await createEmailToken(db(), existing.id, 'RESET_PASSWORD');
      await mail(existing, 'existing', input.lang, link('/reset-password', resetToken));
    } else {
      // Not confirmed yet (a first try, or someone else typing this address): nothing about the
      // account is set here, so a sign-up form cannot plant a name or password on it.
      const user = existing ?? (await db().user.create({ data: { email: input.email, name: '' } }));
      const verifyToken = await createEmailToken(db(), user.id, 'VERIFY_EMAIL');
      await mail(user, 'verify', input.lang, link('/verify-email', verifyToken));
    }
    res.status(202).json({ status: 'check_email' });
  });

  router.post('/verify-email', async (req, res) => {
    await enforce(db(), [{ key: `verify:ip:${clientIp(req)}`, limit: 30, windowSeconds: 10 * MINUTE }]);
    const input = parse(schemas.verify, req.body);
    const record = await findEmailToken(db(), input.token, 'VERIFY_EMAIL');
    // An address that is already confirmed is set up; a leftover sign-up link must not change it.
    if (!record || record.user.emailVerifiedAt) throw new AppError(400, 'invalid_or_expired_link');
    // Check the password before using up the link, so a weak one can be retried.
    const problem = passwordProblem(input.password, { email: record.user.email, name: input.name });
    if (problem) throw new AppError(400, problem);
    const passwordHash = await hashPassword(input.password);

    const userId = await consumeEmailToken(db(), input.token, 'VERIFY_EMAIL');
    if (!userId) throw new AppError(400, 'invalid_or_expired_link');
    const user = await db().user.update({
      where: { id: userId },
      data: { name: input.name, passwordHash, emailVerifiedAt: new Date() },
    });
    // The address is confirmed: other sign-up links for it are no longer needed.
    await db().emailToken.deleteMany({ where: { userId: user.id, type: 'VERIFY_EMAIL', usedAt: null } });
    await logIn(req, res, user.id);
    res.json({ user: publicUser(user) });
  });

  router.post('/resend-verification', async (req, res) => {
    const input = parse(schemas.emailOnly, req.body);
    await enforce(db(), [
      { key: `resend:ip:${clientIp(req)}`, limit: 10, windowSeconds: HOUR },
      { key: `resend:email:${input.email}`, limit: 3, windowSeconds: HOUR },
    ]);
    const user = await db().user.findUnique({ where: { email: input.email } });
    if (user && !user.emailVerifiedAt) {
      const verifyToken = await createEmailToken(db(), user.id, 'VERIFY_EMAIL');
      await mail(user, 'verify', input.lang, link('/verify-email', verifyToken));
    }
    res.status(202).json({ status: 'check_email' });
  });

  router.post('/login', async (req, res) => {
    const input = parse(schemas.login, req.body);
    await enforce(db(), [
      { key: `login:ip:${clientIp(req)}`, limit: 30, windowSeconds: 10 * MINUTE },
      { key: `login:email:${input.email}`, limit: 10, windowSeconds: 10 * MINUTE },
    ]);
    const user = await db().user.findUnique({ where: { email: input.email } });
    // Unknown address, or a sign-up whose link was never opened (no password yet).
    if (!user?.passwordHash) {
      await burnPasswordCheck(input.password); // same timing as a wrong password
      throw new AppError(401, 'invalid_credentials');
    }
    if (!(await verifyPassword(input.password, user.passwordHash))) {
      throw new AppError(401, 'invalid_credentials');
    }
    // Only after the right password, so this does not reveal which addresses exist.
    if (!user.emailVerifiedAt) throw new AppError(403, 'email_not_verified');
    await logIn(req, res, user.id);
    res.json({ user: publicUser(user) });
  });

  router.post('/logout', async (req, res) => {
    const value = req.cookies?.[SESSION_COOKIE];
    if (value) await db().session.deleteMany({ where: { tokenHash: hashToken(value) } });
    res.clearCookie(SESSION_COOKIE, clearOptions);
    res.status(204).end();
  });

  router.get('/me', requireUser, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  router.post('/forgot-password', async (req, res) => {
    const input = parse(schemas.emailOnly, req.body);
    await enforce(db(), [
      { key: `forgot:ip:${clientIp(req)}`, limit: 10, windowSeconds: HOUR },
      { key: `forgot:email:${input.email}`, limit: 3, windowSeconds: HOUR },
    ]);
    const user = await db().user.findUnique({ where: { email: input.email } });
    if (user?.passwordHash) {
      const resetToken = await createEmailToken(db(), user.id, 'RESET_PASSWORD');
      await mail(user, 'reset', input.lang, link('/reset-password', resetToken));
    } else if (user) {
      // A sign-up that was never finished has no password to reset: send the sign-up link again,
      // where the name is chosen too.
      const verifyToken = await createEmailToken(db(), user.id, 'VERIFY_EMAIL');
      await mail(user, 'verify', input.lang, link('/verify-email', verifyToken));
    }
    res.status(202).json({ status: 'check_email' });
  });

  router.post('/reset-password', async (req, res) => {
    await enforce(db(), [{ key: `reset:ip:${clientIp(req)}`, limit: 30, windowSeconds: 10 * MINUTE }]);
    const input = parse(schemas.reset, req.body);
    const record = await db().emailToken.findUnique({
      where: { tokenHash: hashToken(input.token) },
      include: { user: true },
    });
    // Check the new password before using up the link, so a weak password can be retried.
    if (record?.user) {
      const problem = passwordProblem(input.password, record.user);
      if (problem) throw new AppError(400, problem);
    }
    const userId = await consumeEmailToken(db(), input.token, 'RESET_PASSWORD');
    if (!userId) throw new AppError(400, 'invalid_or_expired_link');

    const user = await db().user.update({
      where: { id: userId },
      // Opening the link proved access to the inbox, so the address counts as confirmed.
      data: { passwordHash: await hashPassword(input.password), emailVerifiedAt: record.user.emailVerifiedAt ?? new Date() },
    });
    await db().session.deleteMany({ where: { userId } }); // log out everywhere else
    await logIn(req, res, userId);
    res.json({ user: publicUser(user) });
  });

  return router;
}
