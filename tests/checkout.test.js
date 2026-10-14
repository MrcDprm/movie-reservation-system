import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import Stripe from 'stripe';
import request from 'supertest';

import { seed } from '../prisma/seed.js';
import { createApp } from '../server/app.js';
import { createSession } from '../server/auth/tokens.js';
import { loadConfig } from '../server/config.js';
import { hasTestDatabase, testPrisma, wipeDatabase } from './helpers/db.js';

const WEBHOOK_SECRET = 'whsec_test_secret';

// Stripe API calls are faked; signatures are checked by the real Stripe library.
function fakePayments() {
  const fake = {
    created: [],
    expired: [],
    refunds: [],
    sessions: new Map(),
    async createCheckout(args) {
      const id = `cs_test_${fake.created.length + 1}`;
      fake.created.push({ id, ...args });
      fake.sessions.set(id, 'open');
      return { id, url: `https://checkout.stripe.test/${id}` };
    },
    async getCheckout(id) {
      return { id, url: `https://checkout.stripe.test/${id}`, status: fake.sessions.get(id) };
    },
    async expireCheckout(id) {
      fake.expired.push(id);
      fake.sessions.set(id, 'expired');
    },
    async refund(paymentIntent, key) {
      fake.refunds.push({ paymentIntent, key });
    },
    verifyEvent: (raw, signature) => Stripe.webhooks.constructEvent(raw, signature, WEBHOOK_SECRET),
  };
  return fake;
}

describe('checkout and webhook', { skip: !hasTestDatabase && 'no .env.test' }, () => {
  let prisma;
  let payments;
  let app;
  let showtime;
  let seats;

  const seat = (label) => seats.find((s) => `${s.row}${s.number}` === label).id;

  async function customer(email = 'ayse@test.local') {
    const user = await prisma.user.create({ data: { email, name: 'Ayşe', passwordHash: 'x', emailVerifiedAt: new Date() } });
    const agent = request.agent(app);
    agent.set('Cookie', `sid=${await createSession(prisma, user.id)}`);
    return { user, agent };
  }

  async function holdAndPay(agent, labels) {
    const hold = (await agent.post(`/api/showtimes/${showtime.id}/hold`).send({ seatIds: labels.map(seat) })).body.hold;
    const checkout = await agent.post(`/api/holds/${hold.bookingId}/checkout`).send({ lang: 'tr' });
    return { hold, checkout };
  }

  function sendEvent(type, object) {
    const payload = JSON.stringify({ id: `evt_${Math.random()}`, type, data: { object } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    return request(app).post('/api/stripe/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', signature).send(payload);
  }

  const completed = (bookingId, sessionId, paymentStatus = 'paid') =>
    sendEvent('checkout.session.completed', { id: sessionId, metadata: { bookingId }, payment_status: paymentStatus, payment_intent: `pi_${sessionId}` });

  before(async () => {
    prisma = testPrisma();
    await wipeDatabase(prisma);
    await seed(prisma);
    const hall = await prisma.hall.findUnique({ where: { slug: 'kucuk-salon' } });
    showtime = await prisma.showtime.findFirst({ where: { hallId: hall.id, startsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' } });
    seats = await prisma.hallSeat.findMany({ where: { hallId: hall.id } });
  });

  beforeEach(async () => {
    await prisma.bookingSeat.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.rateLimitBucket.deleteMany();
    payments = fakePayments();
    app = createApp(loadConfig({ NODE_ENV: 'test', APP_ORIGIN: 'https://sinema.example' }), {
      prisma, payments, mailer: { send: async () => {} },
    });
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  test('checkout extends the hold to the life of the Stripe page', async () => {
    const { agent } = await customer();
    const { hold, checkout } = await holdAndPay(agent, ['C3', 'C4']);
    assert.equal(checkout.status, 200);
    assert.match(checkout.body.url, /^https:\/\/checkout\.stripe\.test\//);

    const [created] = payments.created;
    assert.equal(created.lines[0].quantity, 2);
    assert.equal(created.lines[0].unitCents, showtime.priceCents);
    assert.match(created.lines[0].description, /C3, C4/);
    const booking = await prisma.booking.findUnique({ where: { id: hold.bookingId } });
    assert.equal(booking.stripeSessionId, created.id);
    assert.ok(booking.holdExpiresAt > created.expiresAt); // outlives the page
    assert.ok((created.expiresAt - Date.now()) / 60_000 >= 30); // Stripe's minimum
  });

  test('pressing pay twice reuses the open page', async () => {
    const { agent } = await customer();
    const { hold } = await holdAndPay(agent, ['C3']);
    await agent.post(`/api/holds/${hold.bookingId}/checkout`).send({});
    assert.equal(payments.created.length, 1);
  });

  test('a paid event turns the hold into tickets; a repeated event changes nothing', async () => {
    const { agent } = await customer();
    const { hold } = await holdAndPay(agent, ['C3', 'C4']);
    const sessionId = payments.created[0].id;

    const first = await completed(hold.bookingId, sessionId);
    assert.deepEqual([first.status, first.body.result], [200, 'paid']);
    const second = await completed(hold.bookingId, sessionId);
    assert.equal(second.body.result, 'already_paid');
    assert.equal(payments.refunds.length, 0);

    const booking = (await agent.get(`/api/bookings/${hold.bookingId}`)).body.booking;
    assert.equal(booking.status, 'PAID');
    assert.deepEqual(booking.seats.map((s) => s.label), ['C3', 'C4']);
    assert.equal((await agent.get('/api/bookings')).body.bookings.length, 1);

    const map = (await request(app).get(`/api/showtimes/${showtime.id}/seats`)).body;
    assert.equal(map.seats.find((s) => s.id === seat('C3')).status, 'sold');
  });

  test('an unpaid "completed" event (bank transfer still pending) does not issue tickets', async () => {
    const { agent } = await customer();
    const { hold } = await holdAndPay(agent, ['C3']);
    const response = await completed(hold.bookingId, payments.created[0].id, 'unpaid');
    assert.equal(response.body.result, 'ignored');
    assert.equal((await prisma.booking.findUnique({ where: { id: hold.bookingId } })).status, 'HOLD');
  });

  test('an expired Stripe page frees the seats', async () => {
    const { agent } = await customer();
    const { hold } = await holdAndPay(agent, ['C3']);
    const response = await sendEvent('checkout.session.expired', { id: payments.created[0].id, metadata: { bookingId: hold.bookingId } });
    assert.equal(response.body.result, 'released');
    assert.equal((await prisma.booking.findUnique({ where: { id: hold.bookingId } })).status, 'EXPIRED');
    assert.equal(await prisma.bookingSeat.count(), 0);
  });

  test('releasing or replacing a hold closes its Stripe page; money that still arrives is refunded', async () => {
    const { agent } = await customer();
    const { hold } = await holdAndPay(agent, ['C3']);
    const sessionId = payments.created[0].id;

    // The customer goes back and picks other seats while the Stripe tab is still open.
    await agent.post(`/api/showtimes/${showtime.id}/hold`).send({ seatIds: [seat('D5')] });
    assert.deepEqual(payments.expired, [sessionId]);

    // Suppose the old tab was paid anyway (a race with closing it).
    const late = await completed(hold.bookingId, sessionId);
    assert.equal(late.body.result, 'refunded');
    assert.deepEqual(payments.refunds, [{ paymentIntent: `pi_${sessionId}`, key: `refund-${sessionId}` }]);
    assert.equal((await prisma.booking.findUnique({ where: { id: hold.bookingId } })).status, 'CANCELLED');
  });

  test('webhooks without a valid Stripe signature are refused', async () => {
    const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: {} } });
    const unsigned = await request(app).post('/api/stripe/webhook').set('Content-Type', 'application/json').send(payload);
    assert.deepEqual([unsigned.status, unsigned.body], [400, { error: 'bad_signature' }]);
    const forged = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_attacker' });
    const wrongKey = await request(app).post('/api/stripe/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', forged).send(payload);
    assert.equal(wrongKey.status, 400);
  });

  test('checkout only for my own, still valid hold', async () => {
    const { agent } = await customer();
    const other = await customer('mehmet@test.local');
    const hold = (await agent.post(`/api/showtimes/${showtime.id}/hold`).send({ seatIds: [seat('C3')] })).body.hold;

    assert.equal((await other.agent.post(`/api/holds/${hold.bookingId}/checkout`).send({})).status, 404);
    assert.equal((await other.agent.get(`/api/bookings/${hold.bookingId}`)).status, 404);

    await prisma.booking.update({ where: { id: hold.bookingId }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    const expired = await agent.post(`/api/holds/${hold.bookingId}/checkout`).send({});
    assert.deepEqual([expired.status, expired.body.error], [409, 'hold_expired']);
    assert.equal(payments.created.length, 0);
  });
});
