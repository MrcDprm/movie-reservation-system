import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { seed } from '../prisma/seed.js';
import { createApp } from '../server/app.js';
import { createSession } from '../server/auth/tokens.js';
import { handleStripeEvent } from '../server/booking/checkout.js';
import { loadConfig } from '../server/config.js';
import { readTicketCode, ticketCode } from '../server/tickets.js';
import { hasTestDatabase, testPrisma, wipeDatabase } from './helpers/db.js';

const SECRET = 'a-test-ticket-secret-of-at-least-32-chars';

// --- The code inside the QR (no database) ---

test('a ticket code is read back only with the right secret and untouched', () => {
  const code = ticketCode('cmabc123def456', SECRET);
  assert.match(code, /^t1\.cmabc123def456\.[\w-]{22}$/);
  assert.equal(readTicketCode(code, SECRET), 'cmabc123def456');
  assert.equal(readTicketCode(code, 'another-secret-also-32-characters-long'), null);
  assert.equal(readTicketCode(code.replace('cmabc123def456', 'cmabc123def457'), SECRET), null); // other ticket, same signature
  assert.equal(readTicketCode(`${code}x`, SECRET), null);
  for (const junk of ['', 'hello', 't1..', 't2.cmabc123def456.xx', null, undefined, 42]) {
    assert.equal(readTicketCode(junk, SECRET), null);
  }
});

test('production refuses to start without a ticket secret', () => {
  const env = { NODE_ENV: 'production', RESEND_API_KEY: 'r', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'w' };
  assert.throws(() => loadConfig(env), /TICKET_SECRET/);
  assert.equal(loadConfig({ ...env, TICKET_SECRET: SECRET }).TICKET_SECRET, SECRET);
});

// --- Tickets and the door, against the test database ---

describe('tickets', { skip: !hasTestDatabase && 'no .env.test' }, () => {
  let prisma;
  let app;
  let outbox;
  let showtime;
  let seats;

  const seat = (label) => seats.find((s) => `${s.row}${s.number}` === label);

  async function account(email, role = 'CUSTOMER') {
    const user = await prisma.user.create({ data: { email, name: email.split('@')[0], passwordHash: 'x', role, emailVerifiedAt: new Date() } });
    const agent = request.agent(app);
    agent.set('Cookie', `sid=${await createSession(prisma, user.id)}`);
    return { user, agent };
  }

  // A paid booking made through the real webhook handler, so the ticket e-mail is sent too.
  async function paidBooking(user, labels, startsAt = showtime.startsAt) {
    const show = startsAt === showtime.startsAt ? showtime : await prisma.showtime.create({
      data: { movieId: showtime.movieId, hallId: showtime.hallId, startsAt, priceCents: 15000 },
    });
    const booking = await prisma.booking.create({
      data: {
        userId: user.id, showtimeId: show.id, holdExpiresAt: new Date(Date.now() + 600_000), totalCents: 15000 * labels.length, stripeLang: 'tr',
        seats: { create: labels.map((l) => ({ showtimeId: show.id, hallSeatId: seat(l).id })) },
      },
    });
    const event = { type: 'checkout.session.completed', data: { object: { id: `cs_${booking.id}`, metadata: { bookingId: booking.id }, payment_status: 'paid' } } };
    await handleStripeEvent(prisma, {}, event, { mailer: { send: async (m) => outbox.push(m) }, config: loadConfig({ NODE_ENV: 'test', APP_ORIGIN: 'https://sinema.example', TICKET_SECRET: SECRET }) });
    return booking;
  }

  const codesOf = async (agent, bookingId) => (await agent.get(`/api/bookings/${bookingId}`)).body.booking.seats.map((s) => s.code);
  const scan = (agent, code) => agent.post('/api/checkin').send({ code });

  before(async () => {
    prisma = testPrisma();
    await wipeDatabase(prisma);
    await seed(prisma);
    const hall = await prisma.hall.findUnique({ where: { slug: 'kucuk-salon' } });
    seats = await prisma.hallSeat.findMany({ where: { hallId: hall.id } });
    // A show starting in 30 minutes: the door is open.
    showtime = await prisma.showtime.create({
      data: { movieId: (await prisma.movie.findFirst()).id, hallId: hall.id, startsAt: new Date(Date.now() + 30 * 60_000), priceCents: 15000 },
    });
  });

  beforeEach(async () => {
    await prisma.bookingSeat.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.rateLimitBucket.deleteMany();
    await prisma.showtime.deleteMany({ where: { NOT: { id: showtime.id }, priceCents: 15000, startsAt: { lt: new Date(Date.now() + 2 * 86_400_000) }, bookings: { none: {} } } });
    outbox = [];
    app = createApp(loadConfig({ NODE_ENV: 'test', APP_ORIGIN: 'https://sinema.example', TICKET_SECRET: SECRET }), {
      prisma, mailer: { send: async (m) => outbox.push(m) }, payments: {},
    });
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  test('payment sends one e-mail with a QR image per seat', async () => {
    const { user } = await account('ayse@test.local');
    await paidBooking(user, ['B2', 'B3']);
    assert.equal(outbox.length, 1);
    assert.match(outbox[0].subject, /^Biletlerin: /);
    assert.match(outbox[0].text, /Koltuklar: B2, B3/);
    assert.deepEqual(outbox[0].attachments.map((a) => a.filename), ['bilet-B2.png', 'bilet-B3.png']);
    assert.equal(outbox[0].attachments[0].content.subarray(1, 4).toString(), 'PNG');
  });

  test('only a paid booking shows QR codes', async () => {
    const { user, agent } = await account('ayse@test.local');
    const paid = await paidBooking(user, ['B2']);
    const [code] = await codesOf(agent, paid.id);
    assert.equal(readTicketCode(code, SECRET), (await prisma.bookingSeat.findFirst({ where: { bookingId: paid.id } })).id);

    const hold = await prisma.booking.create({
      data: { userId: user.id, showtimeId: showtime.id, holdExpiresAt: new Date(Date.now() + 600_000), totalCents: 15000, seats: { create: { showtimeId: showtime.id, hallSeatId: seat('C1').id } } },
    });
    assert.deepEqual(await codesOf(agent, hold.id), [null]);
  });

  test('the door: first scan lets in, second scan says when it was used', async () => {
    const customer = await account('ayse@test.local');
    const staff = await account('kapi@test.local', 'STAFF');
    const paid = await paidBooking(customer.user, ['B2']);
    const [code] = await codesOf(customer.agent, paid.id);

    const first = await scan(staff.agent, code);
    assert.equal(first.body.result, 'ok');
    assert.equal(first.body.ticket.seat, 'B2');
    assert.equal(first.body.ticket.name, 'ayse');
    const second = await scan(staff.agent, code);
    assert.equal(second.body.result, 'already_used');
    assert.equal(second.body.ticket.checkedInAt, first.body.ticket.checkedInAt);
    assert.equal((await customer.agent.get(`/api/bookings/${paid.id}`)).body.booking.seats[0].checkedIn, true);
  });

  test('two doors scan the same QR at the same moment: one lets in', async () => {
    const customer = await account('ayse@test.local');
    const doors = await Promise.all([account('kapi1@test.local', 'STAFF'), account('kapi2@test.local', 'ADMIN')]);
    const [code] = await codesOf(customer.agent, (await paidBooking(customer.user, ['B2'])).id);
    const results = await Promise.all(doors.map((d) => scan(d.agent, code)));
    assert.deepEqual(results.map((r) => r.body.result).sort(), ['already_used', 'ok']);
  });

  test('forged, unpaid, early and finished tickets are turned away', async () => {
    const customer = await account('ayse@test.local');
    const staff = await account('kapi@test.local', 'STAFF');

    const forged = ticketCode((await prisma.hallSeat.findFirst()).id, 'not-the-server-secret-but-32-chars-long');
    assert.equal((await scan(staff.agent, forged)).body.result, 'invalid');
    assert.equal((await scan(staff.agent, 'https://evil.example')).body.result, 'invalid');

    const hold = await prisma.booking.create({
      data: { userId: customer.user.id, showtimeId: showtime.id, holdExpiresAt: new Date(Date.now() + 600_000), totalCents: 15000, seats: { create: { showtimeId: showtime.id, hallSeatId: seat('D1').id } } },
    });
    const holdSeat = await prisma.bookingSeat.findFirst({ where: { bookingId: hold.id } });
    assert.equal((await scan(staff.agent, ticketCode(holdSeat.id, SECRET))).body.result, 'not_paid');

    const tomorrow = await paidBooking(customer.user, ['E1'], new Date(Date.now() + 26 * 3_600_000));
    assert.equal((await scan(staff.agent, (await codesOf(customer.agent, tomorrow.id))[0])).body.result, 'too_early');

    const yesterday = await paidBooking(customer.user, ['E2'], new Date(Date.now() - 26 * 3_600_000));
    assert.equal((await scan(staff.agent, (await codesOf(customer.agent, yesterday.id))[0])).body.result, 'finished');
  });

  test('customers cannot use the door', async () => {
    const customer = await account('ayse@test.local');
    const [code] = await codesOf(customer.agent, (await paidBooking(customer.user, ['B2'])).id);
    assert.equal((await scan(customer.agent, code)).status, 403);
    assert.equal((await scan(request(app), code)).status, 401);
  });
});
