import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { hasTestDatabase, testPrisma, wipeDatabase } from './helpers/db.js';

const ORIGIN = 'https://sinema.example';
const PASSWORD = 'mavi-tren-sabah-42';

describe('accounts', { skip: !hasTestDatabase && 'no .env.test' }, () => {
  let prisma;
  let outbox;
  let app;

  const makeApp = (env = {}) =>
    createApp(loadConfig({ NODE_ENV: 'test', APP_ORIGIN: ORIGIN, ...env }), {
      prisma,
      mailer: { send: async (message) => outbox.push(message) },
    });

  // The token from the last e-mail's link.
  const tokenFromMail = () => outbox.at(-1).text.match(/token=([\w-]+)/)[1];

  const register = (agent, body = {}) => agent.post('/api/auth/register').send({ email: 'ayse@example.com', ...body });

  // Opens a sign-up link: the person holding the inbox chooses the name and password.
  const complete = (agent, token, body = {}) =>
    agent.post('/api/auth/verify-email').send({ token, name: 'Ayşe', password: PASSWORD, ...body });

  async function registeredAndVerified(agent = request.agent(app)) {
    await register(agent);
    await complete(agent, tokenFromMail());
    return agent;
  }

  before(() => {
    prisma = testPrisma();
  });

  beforeEach(async () => {
    await wipeDatabase(prisma);
    await prisma.rateLimitBucket.deleteMany();
    outbox = [];
    app = makeApp();
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  test('register asks only for the address and sets nothing on the account', async () => {
    const agent = request.agent(app);
    const response = await register(agent, { email: '  Ayse@Example.COM ' });
    assert.equal(response.status, 202);
    assert.deepEqual(response.body, { status: 'check_email' });
    assert.equal(response.headers['set-cookie'], undefined); // not logged in yet

    const user = await prisma.user.findUnique({ where: { email: 'ayse@example.com' } }); // normalised
    assert.ok(user);
    assert.equal(user.passwordHash, null);
    assert.equal(user.name, '');
    assert.equal(outbox.length, 1);
    assert.match(outbox[0].text, new RegExp(`${ORIGIN}/verify-email\\?token=`));

    // No password exists yet, so no password can log in.
    const login = await agent.post('/api/auth/login').send({ email: 'ayse@example.com', password: PASSWORD });
    assert.deepEqual([login.status, login.body], [401, { error: 'invalid_credentials' }]);
  });

  test('the link sets name and password, logs in with a safe cookie, and works only once', async () => {
    const agent = request.agent(app);
    await register(agent);
    const token = tokenFromMail();

    const verified = await complete(agent, token);
    assert.equal(verified.status, 200);
    assert.equal(verified.body.user.emailVerified, true);
    assert.equal(verified.body.user.name, 'Ayşe');
    assert.equal(verified.body.user.passwordHash, undefined);
    const cookie = verified.headers['set-cookie'][0];
    assert.match(cookie, /^sid=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);

    const me = await agent.get('/api/auth/me');
    assert.equal(me.body.user.email, 'ayse@example.com');
    await request(app).post('/api/auth/login').send({ email: 'ayse@example.com', password: PASSWORD }).expect(200);

    const again = await complete(request(app), token, { password: 'baska-bir-sifre-99' });
    assert.deepEqual([again.status, again.body], [400, { error: 'invalid_or_expired_link' }]);
  });

  test('a weak password on the link page can be corrected; the link is not used up', async () => {
    await register(request(app));
    const token = tokenFromMail();
    const weak = await complete(request(app), token, { password: 'Password123' });
    assert.deepEqual([weak.status, weak.body], [400, { error: 'password_too_common' }]);
    const personal = await complete(request(app), token, { name: 'Ayşe Kaya', password: 'kaya-sabah-treni-42' });
    assert.equal(personal.body.error, 'password_contains_personal_info');
    await complete(request(app), token).expect(200);
  });

  test('cookie is Secure in production', async () => {
    app = makeApp({ NODE_ENV: 'production', RESEND_API_KEY: 'test', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', TICKET_SECRET: 'x'.repeat(32), CRON_SECRET: 'c'.repeat(32) });
    const agent = request.agent(app);
    await register(agent);
    const verified = await complete(agent, tokenFromMail());
    assert.match(verified.headers['set-cookie'][0], /Secure/);
  });

  test('registering an existing address reveals nothing', async () => {
    await registeredAndVerified();
    outbox = [];
    const second = await register(request(app));
    assert.deepEqual([second.status, second.body], [202, { status: 'check_email' }]);
    // The real owner is told, with a reset link; the password is unchanged.
    assert.equal(outbox.length, 1);
    assert.match(outbox[0].subject, /zaten bir hesabın var/);
    const login = await request(app).post('/api/auth/login').send({ email: 'ayse@example.com', password: PASSWORD });
    assert.equal(login.status, 200);
  });

  // Account pre-hijacking: someone signs up with my address before or after me. Whichever link
  // in my inbox I open, the account must get my name and my password, and theirs must not work.
  for (const order of ['attacker first', 'attacker last']) {
    test(`a sign-up with my address by someone else cannot take over my account (${order})`, async () => {
      const ATTACKER = 'kirmizi-ucak-gece-77';
      const login = (password) => request(app).post('/api/auth/login').send({ email: 'ayse@example.com', password });

      if (order === 'attacker first') await register(request(app));
      await register(request(app)); // my own sign-up
      if (order === 'attacker last') await register(request(app));
      // The newest e-mail in my inbox may be the one the attacker triggered; I open that one.
      const newest = tokenFromMail();
      const older = outbox.at(-2).text.match(/token=([\w-]+)/)[1];

      await complete(request(app), newest).expect(200);
      await login(PASSWORD).expect(200);
      assert.equal((await login(ATTACKER)).body.error, 'invalid_credentials');
      assert.equal((await prisma.user.findUnique({ where: { email: 'ayse@example.com' } })).name, 'Ayşe');
      // Once the account is set up, no other sign-up link can change it.
      const late = await complete(request(app), older, { name: 'Saldırgan', password: ATTACKER });
      assert.equal(late.status, 400);
      await login(PASSWORD).expect(200);
    });
  }

  test('a resent link also lets only the inbox owner choose the password', async () => {
    await register(request(app));
    await request(app).post('/api/auth/resend-verification').send({ email: 'ayse@example.com' }).expect(202);
    await complete(request(app), tokenFromMail()).expect(200);
    await request(app).post('/api/auth/login').send({ email: 'ayse@example.com', password: PASSWORD }).expect(200);
  });

  test('forgot-password on an unfinished sign-up sends the sign-up link, not a reset link', async () => {
    await register(request(app));
    outbox = [];
    await request(app).post('/api/auth/forgot-password').send({ email: 'ayse@example.com' }).expect(202);
    assert.equal(outbox.length, 1);
    assert.match(outbox[0].text, /\/verify-email\?token=/);
    await complete(request(app), tokenFromMail()).expect(200);
  });

  test('sign-ups are limited per address, so nobody can flood an inbox', async () => {
    for (let i = 0; i < 3; i++) await register(request(app)).expect(202);
    const fourth = await register(request(app));
    assert.equal(fourth.status, 429);
    assert.equal(outbox.length, 3);
  });

  test('logging in again replaces the old session instead of piling up sessions', async () => {
    const agent = await registeredAndVerified();
    await agent.post('/api/auth/login').send({ email: 'ayse@example.com', password: PASSWORD }).expect(200);
    await agent.post('/api/auth/login').send({ email: 'ayse@example.com', password: PASSWORD }).expect(200);
    assert.equal(await prisma.session.count(), 1);
    await agent.get('/api/auth/me').expect(200);
  });

  test('wrong password and unknown e-mail give the same answer', async () => {
    await registeredAndVerified();
    const wrong = await request(app).post('/api/auth/login').send({ email: 'ayse@example.com', password: 'yanlis-sifre-11' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'yok@example.com', password: PASSWORD });
    assert.deepEqual([wrong.status, wrong.body], [401, { error: 'invalid_credentials' }]);
    assert.deepEqual([unknown.status, unknown.body], [401, { error: 'invalid_credentials' }]);
  });

  test('bad input is refused', async () => {
    const bad = await request(app).post('/api/auth/register').send({ email: 'not-an-email' });
    assert.deepEqual([bad.status, bad.body.error, bad.body.fields], [400, 'invalid_input', ['email']]);
    assert.equal(await prisma.user.count(), 0);

    await register(request(app));
    const empty = await request(app).post('/api/auth/verify-email').send({ token: tokenFromMail(), name: '', password: 1 });
    assert.equal(empty.body.error, 'invalid_input');
    assert.deepEqual(empty.body.fields.sort(), ['name', 'password']);
  });

  test('logout ends the session on the server', async () => {
    const agent = await registeredAndVerified();
    assert.equal(await prisma.session.count(), 1);
    const out = await agent.post('/api/auth/logout');
    assert.equal(out.status, 204);
    assert.equal(await prisma.session.count(), 0);
    assert.equal((await agent.get('/api/auth/me')).status, 401);
  });

  test('a stolen cookie value is useless once hashed in the database', async () => {
    await registeredAndVerified();
    const session = await prisma.session.findFirst();
    const forged = await request(app).get('/api/auth/me').set('Cookie', `sid=${session.tokenHash}`);
    assert.equal(forged.status, 401);
  });

  test('password reset: new password works, every old session is logged out', async () => {
    const oldAgent = await registeredAndVerified();
    outbox = [];
    const forgot = await request(app).post('/api/auth/forgot-password').send({ email: 'ayse@example.com', lang: 'en' });
    assert.equal(forgot.status, 202);
    assert.equal(outbox[0].subject, 'Password reset');
    const token = tokenFromMail();

    const weak = await request(app).post('/api/auth/reset-password').send({ token, password: 'kisa' });
    assert.equal(weak.body.error, 'password_too_short'); // the link is not used up by a weak password

    const reset = await request(app).post('/api/auth/reset-password').send({ token, password: 'yeni-uzun-sifre-77' });
    assert.equal(reset.status, 200);
    assert.equal((await oldAgent.get('/api/auth/me')).status, 401);

    const oldLogin = await request(app).post('/api/auth/login').send({ email: 'ayse@example.com', password: PASSWORD });
    assert.equal(oldLogin.status, 401);
    const newLogin = await request(app).post('/api/auth/login').send({ email: 'ayse@example.com', password: 'yeni-uzun-sifre-77' });
    assert.equal(newLogin.status, 200);
  });

  test('forgot-password for an unknown address looks the same and sends nothing', async () => {
    const response = await request(app).post('/api/auth/forgot-password').send({ email: 'yok@example.com' });
    assert.deepEqual([response.status, response.body], [202, { status: 'check_email' }]);
    assert.equal(outbox.length, 0);
  });

  test('login attempts are limited per e-mail', async () => {
    await registeredAndVerified();
    const attempt = () => request(app).post('/api/auth/login').send({ email: 'ayse@example.com', password: 'yanlis-sifre-11' });
    for (let i = 0; i < 10; i++) assert.equal((await attempt()).status, 401);
    const blocked = await attempt();
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error, 'rate_limited');
    assert.ok(Number(blocked.headers['retry-after']) > 0);
  });

  test('counters are atomic under concurrent requests', async () => {
    const { enforce } = await import('../server/rateLimit.js');
    const rules = [{ key: 'race:test', limit: 5, windowSeconds: 60 }];
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => enforce(prisma, rules)));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 5);
  });
});
