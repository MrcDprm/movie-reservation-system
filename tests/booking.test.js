import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { seed } from '../prisma/seed.js';
import { createApp } from '../server/app.js';
import { createSession } from '../server/auth/tokens.js';
import { holdSeats } from '../server/booking/service.js';
import { loadConfig } from '../server/config.js';
import { hasTestDatabase, testPrisma, wipeDatabase } from './helpers/db.js';

describe('seat map and holds', { skip: !hasTestDatabase && 'no .env.test' }, () => {
  let prisma;
  let app;
  let showtime; // a future showtime in the big hall
  let seats; // its hall seats, A1, A2, ...

  const seat = (label) => seats.find((s) => `${s.row}${s.number}` === label).id;

  async function userAgent(email, { verified = true } = {}) {
    const user = await prisma.user.create({
      data: { email, name: email.split('@')[0], passwordHash: 'x', emailVerifiedAt: verified ? new Date() : null },
    });
    const token = await createSession(prisma, user.id);
    const agent = request.agent(app);
    agent.set('Cookie', `sid=${token}`);
    return { user, agent };
  }

  const map = (agent) => agent.get(`/api/showtimes/${showtime.id}/seats`);
  const hold = (agent, labels) => agent.post(`/api/showtimes/${showtime.id}/hold`).send({ seatIds: labels.map(seat) });
  const statusOf = (body, label) => body.seats.find((s) => s.id === seat(label)).status;

  before(async () => {
    prisma = testPrisma();
    await wipeDatabase(prisma);
    await seed(prisma);
    app = createApp(loadConfig({ NODE_ENV: 'test', APP_ORIGIN: 'https://sinema.example' }), {
      prisma,
      mailer: { send: async () => {} },
      payments: { expireCheckout: async () => {} },
    });
    const hall = await prisma.hall.findUnique({ where: { slug: 'buyuk-salon' } });
    showtime = await prisma.showtime.findFirst({ where: { hallId: hall.id, startsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' } });
    seats = await prisma.hallSeat.findMany({ where: { hallId: hall.id } });
  });

  beforeEach(async () => {
    await prisma.bookingSeat.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.rateLimitBucket.deleteMany();
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  test('movies with their upcoming showtimes, no login needed', async () => {
    const response = await request(app).get('/api/movies');
    assert.equal(response.status, 200);
    assert.equal(response.body.movies.length, 8);
    assert.ok(response.body.movies.every((m) => m.showtimes.length > 0));
    assert.ok(response.body.movies[0].showtimes[0].hall.name);
    const one = await request(app).get('/api/movies/nosferatu');
    assert.equal(one.body.movie.director, 'F. W. Murnau');
    assert.equal((await request(app).get('/api/movies/yok-boyle-film')).status, 404);
  });

  test('seat map for a visitor: every seat free, aisles in the columns', async () => {
    const response = await request(app).get(`/api/showtimes/${showtime.id}/seats`);
    assert.equal(response.status, 200);
    assert.equal(response.body.seats.length, 140);
    assert.ok(response.body.seats.every((s) => s.status === 'free'));
    assert.equal(response.body.myHold, null);
    assert.equal(response.body.showtime.salesOpen, true);
    assert.equal((await request(app).get('/api/showtimes/../../etc/seats')).status, 404);
  });

  test('a hold shows as mine to me and as held to everyone else', async () => {
    const ayse = await userAgent('ayse@test.local');
    const mehmet = await userAgent('mehmet@test.local');
    const created = await hold(ayse.agent, ['E7', 'E8']);
    assert.equal(created.status, 201);
    assert.equal(created.body.hold.totalCents, showtime.priceCents * 2);
    const minutes = (new Date(created.body.hold.expiresAt) - Date.now()) / 60_000;
    assert.ok(minutes > 9 && minutes <= 10);

    const mine = (await map(ayse.agent)).body;
    assert.equal(statusOf(mine, 'E7'), 'mine');
    assert.deepEqual(mine.myHold.seatIds.sort(), [seat('E7'), seat('E8')].sort());
    const theirs = (await map(mehmet.agent)).body;
    assert.equal(statusOf(theirs, 'E7'), 'held');
    assert.equal(theirs.myHold, null);
  });

  test('a held seat cannot be taken by someone else', async () => {
    const ayse = await userAgent('ayse@test.local');
    const mehmet = await userAgent('mehmet@test.local');
    await hold(ayse.agent, ['E7', 'E8']);
    const clash = await hold(mehmet.agent, ['E8', 'E9']);
    assert.deepEqual([clash.status, clash.body], [409, { error: 'seat_taken' }]);
    assert.equal(statusOf((await map(mehmet.agent)).body, 'E9'), 'free'); // nothing half-done
  });

  test('a new choice replaces my old hold', async () => {
    const ayse = await userAgent('ayse@test.local');
    await hold(ayse.agent, ['A1', 'A2']);
    await hold(ayse.agent, ['C5']);
    const body = (await map(ayse.agent)).body;
    assert.equal(statusOf(body, 'A1'), 'free');
    assert.equal(statusOf(body, 'C5'), 'mine');
    assert.equal(await prisma.booking.count({ where: { status: 'HOLD' } }), 1);
  });

  test('a failed new choice keeps my old hold (one transaction)', async () => {
    const ayse = await userAgent('ayse@test.local');
    const mehmet = await userAgent('mehmet@test.local');
    await hold(ayse.agent, ['A1']);
    await hold(mehmet.agent, ['B1']);
    const clash = await hold(ayse.agent, ['B1']);
    assert.equal(clash.status, 409);
    assert.equal(statusOf((await map(ayse.agent)).body, 'A1'), 'mine');
  });

  test('a seat whose hold ran out can be taken', async () => {
    const ayse = await userAgent('ayse@test.local');
    const mehmet = await userAgent('mehmet@test.local');
    const longAgo = new Date(Date.now() - 20 * 60_000);
    const { booking: old } = await holdSeats(prisma, { showtimeId: showtime.id, userId: ayse.user.id, seatIds: [seat('D4')] }, longAgo);

    assert.equal(statusOf((await map(mehmet.agent)).body, 'D4'), 'free');
    const taken = await hold(mehmet.agent, ['D4']);
    assert.equal(taken.status, 201);
    assert.equal((await prisma.booking.findUnique({ where: { id: old.id } })).status, 'EXPIRED');
  });

  test('ten people, one seat, the same moment: exactly one hold', async () => {
    const people = await Promise.all(Array.from({ length: 10 }, (_, i) => userAgent(`p${i}@test.local`)));
    const results = await Promise.all(people.map((p) => hold(p.agent, ['F7'])));
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, ...Array(9).fill(409)]);
    assert.equal(await prisma.bookingSeat.count({ where: { hallSeatId: seat('F7') } }), 1);
  });

  test('bad requests are refused', async () => {
    const ayse = await userAgent('ayse@test.local');
    const small = await prisma.hall.findUnique({ where: { slug: 'kucuk-salon' }, include: { seats: true } });
    const otherHall = await ayse.agent.post(`/api/showtimes/${showtime.id}/hold`).send({ seatIds: [small.seats[0].id] });
    assert.deepEqual([otherHall.status, otherHall.body.error], [400, 'invalid_seats']);
    const nine = await hold(ayse.agent, ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9']);
    assert.equal(nine.status, 400);
    const twice = await hold(ayse.agent, ['A1', 'A1']);
    assert.deepEqual([twice.status, twice.body.error], [400, 'duplicate_seats']);
    const missing = await ayse.agent.post('/api/showtimes/nope123/hold').send({ seatIds: [seat('A1')] });
    assert.equal(missing.status, 404);
  });

  test('sales close when the film starts', async () => {
    const ayse = await userAgent('ayse@test.local');
    const past = await prisma.showtime.create({
      data: { movieId: showtime.movieId, hallId: showtime.hallId, startsAt: new Date(Date.now() - 3_600_000), priceCents: 15000 },
    });
    const response = await ayse.agent.post(`/api/showtimes/${past.id}/hold`).send({ seatIds: [seat('A1')] });
    assert.deepEqual([response.status, response.body.error], [409, 'sales_closed']);
    await prisma.showtime.delete({ where: { id: past.id } });
  });

  test('only logged-in users with a confirmed e-mail can hold', async () => {
    assert.equal((await hold(request(app), ['A1'])).status, 401);
    const unverified = await userAgent('new@test.local', { verified: false });
    const response = await hold(unverified.agent, ['A1']);
    assert.deepEqual([response.status, response.body.error], [403, 'email_not_verified']);
  });

  test('releasing a hold: mine yes, someone else\'s looks like it does not exist', async () => {
    const ayse = await userAgent('ayse@test.local');
    const mehmet = await userAgent('mehmet@test.local');
    const { bookingId } = (await hold(ayse.agent, ['G1'])).body.hold;
    assert.equal((await mehmet.agent.delete(`/api/holds/${bookingId}`)).status, 404);
    assert.equal((await ayse.agent.delete(`/api/holds/${bookingId}`)).status, 204);
    assert.equal(statusOf((await map(ayse.agent)).body, 'G1'), 'free');
  });
});
