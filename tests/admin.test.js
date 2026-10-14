import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { seed } from '../prisma/seed.js';
import { createApp } from '../server/app.js';
import { createSession } from '../server/auth/tokens.js';
import { loadConfig } from '../server/config.js';
import { hasTestDatabase, testPrisma, wipeDatabase } from './helpers/db.js';

const HOUR = 60 * 60 * 1000;

// "2026-10-20T19:30:00+03:00": how the admin page sends a time picked in Istanbul.
const istanbul = (date) => `${new Date(date.getTime() + 3 * HOUR).toISOString().slice(0, 19)}+03:00`;
// Whole minutes, a few days ahead, away from the seeded 11:00 / 14:30 / 18:00 UTC shows.
const freeSlot = (daysAhead, hourUtc = 7) => {
  const d = new Date(Date.now() + daysAhead * 24 * HOUR);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
};

describe('admin', { skip: !hasTestDatabase && 'no .env.test' }, () => {
  let prisma;
  let app;
  let admin;
  let options;

  async function agentFor(role) {
    const user = await prisma.user.create({
      data: { email: `${role.toLowerCase()}@test.local`, name: role, passwordHash: 'x', role, emailVerifiedAt: new Date() },
    });
    const agent = request.agent(app);
    agent.set('Cookie', `sid=${await createSession(prisma, user.id)}`);
    return { user, agent };
  }

  const create = (body) => admin.agent.post('/api/admin/showtimes').send(body);
  const body = (startsAt, extra = {}) => ({
    movieId: options.movies[0].id,
    hallId: options.halls[0].id,
    startsAt: istanbul(startsAt),
    priceCents: 16000,
    ...extra,
  });

  before(async () => {
    prisma = testPrisma();
    app = createApp(loadConfig({ DATABASE_URL: process.env.DATABASE_URL }), { prisma });
  });

  beforeEach(async () => {
    await wipeDatabase(prisma);
    await seed(prisma);
    admin = await agentFor('ADMIN');
    options = (await admin.agent.get('/api/admin/options').expect(200)).body;
  });

  after(async () => {
    await wipeDatabase(prisma);
  });

  test('only admins get in: customers and staff are refused, guests must log in', async () => {
    const customer = await agentFor('CUSTOMER');
    const staff = await agentFor('STAFF');
    await customer.agent.get('/api/admin/showtimes').expect(403);
    await staff.agent.get('/api/admin/showtimes').expect(403);
    await request(app).get('/api/admin/options').expect(401);
    assert.equal(options.halls.length, 2);
    assert.ok(options.halls.every((h) => h.capacity > 0));
  });

  test('a new show appears in the list and on the public programme', async () => {
    const startsAt = freeSlot(3);
    const { body: created } = await create(body(startsAt)).expect(201);
    const { body: list } = await admin.agent.get(`/api/admin/showtimes?from=${istanbul(startsAt).slice(0, 10)}&days=1`).expect(200);
    const show = list.showtimes.find((s) => s.id === created.showtime.id);
    assert.equal(new Date(show.startsAt).getTime(), startsAt.getTime());
    assert.deepEqual([show.sold, show.revenueCents, show.hasBookings], [0, 0, false]);
    await request(app).get(`/api/showtimes/${created.showtime.id}/seats`).expect(200);
  });

  test('two films cannot overlap in one hall, cleaning break included', async () => {
    const startsAt = freeSlot(3);
    await create(body(startsAt)).expect(201);
    const runtime = options.movies[0].runtimeMin;
    // Starts before the first one ends (+ 20 min cleaning).
    const clash = new Date(startsAt.getTime() + (runtime + 10) * 60_000);
    assert.equal((await create(body(clash)).expect(409)).body.error, 'hall_busy');
    // Same minute, same hall.
    await create(body(startsAt)).expect(409);
    // The other hall is free.
    await create(body(clash, { hallId: options.halls[1].id })).expect(201);
    // Starting before, but running into the first one.
    const before = new Date(startsAt.getTime() - 30 * 60_000);
    await create(body(before)).expect(409);
  });

  test('bad input is refused', async () => {
    const soon = new Date(Date.now() + 30 * 60_000);
    assert.equal((await create(body(soon)).expect(400)).body.error, 'too_soon');
    assert.equal((await create(body(freeSlot(120))).expect(400)).body.error, 'too_far');
    for (const bad of [
      { priceCents: 5 },
      { priceCents: 15000.5 },
      { movieId: 'nope' },
      { hallId: '../x' },
      { startsAt: 'tomorrow evening' },
      { startsAt: '2026-12-01T19:00:00' }, // no time zone: ambiguous
    ]) {
      await create(body(freeSlot(3), bad)).expect(400);
    }
  });

  test('sales are counted, and a show with tickets cannot be deleted', async () => {
    const startsAt = freeSlot(4);
    const { body: created } = await create(body(startsAt)).expect(201);
    const showtimeId = created.showtime.id;
    const hallSeats = await prisma.hallSeat.findMany({ where: { hallId: options.halls[0].id }, take: 3 });
    await prisma.booking.create({
      data: {
        userId: admin.user.id,
        showtimeId,
        status: 'PAID',
        holdExpiresAt: new Date(),
        paidAt: new Date(),
        totalCents: 32000,
        seats: { create: hallSeats.slice(0, 2).map((s) => ({ showtimeId, hallSeatId: s.id })) },
      },
    });
    // A hold that ran out long ago does not count.
    await prisma.booking.create({
      data: {
        userId: admin.user.id,
        showtimeId,
        status: 'HOLD',
        holdExpiresAt: new Date(Date.now() - HOUR),
        totalCents: 16000,
        seats: { create: [{ showtimeId, hallSeatId: hallSeats[2].id }] },
      },
    });

    const { body: list } = await admin.agent.get(`/api/admin/showtimes?from=${istanbul(startsAt).slice(0, 10)}&days=1`).expect(200);
    const show = list.showtimes.find((s) => s.id === showtimeId);
    assert.deepEqual([show.sold, show.revenueCents, show.hasBookings], [2, 32000, true]);

    assert.equal((await admin.agent.delete(`/api/admin/showtimes/${showtimeId}`).expect(409)).body.error, 'has_bookings');
    await prisma.booking.deleteMany({ where: { showtimeId, status: 'PAID' } });
    await admin.agent.delete(`/api/admin/showtimes/${showtimeId}`).expect(204); // the stale hold goes with it
    assert.equal(await prisma.showtime.count({ where: { id: showtimeId } }), 0);
    await admin.agent.delete(`/api/admin/showtimes/${showtimeId}`).expect(404);
  });

  // --- Films ---

  const film = (extra = {}) => ({
    titleTr: 'Cadılık',
    titleEn: 'Häxan: Witchcraft Through the Ages',
    originalTitle: 'Häxan',
    year: 1922,
    director: 'Benjamin Christensen',
    runtimeMin: 91,
    summaryTr: 'Orta Çağ cadı avlarını canlandıran belgesel-kurgu.',
    summaryEn: 'A docu-fiction on medieval witch hunts.',
    posterInk: '#F2E6D0',
    posterPaper: '#1d1a24',
    ...extra,
  });

  test('a film is added, shown publicly, edited and deleted', async () => {
    const { body: created } = await admin.agent.post('/api/admin/movies').send(film({ slug: 'hacked', id: 'x' })).expect(201);
    assert.equal(created.movie.slug, 'haxan-witchcraft-through-the-ages-1922'); // made by the server, not taken from the body
    const { body: pub } = await request(app).get(`/api/movies/${created.movie.slug}`).expect(200);
    assert.equal(pub.movie.titleTr, 'Cadılık');

    // The same title and year again gets its own address.
    const { body: twin } = await admin.agent.post('/api/admin/movies').send(film()).expect(201);
    assert.equal(twin.movie.slug, 'haxan-witchcraft-through-the-ages-1922-2');

    await admin.agent.put(`/api/admin/movies/${created.movie.id}`).send(film({ titleTr: 'Cadılar', posterInk: '#ffffff' })).expect(200);
    const saved = await prisma.movie.findUnique({ where: { id: created.movie.id } });
    assert.equal(saved.titleTr, 'Cadılar');
    assert.equal(saved.posterInk, '#ffffff');
    assert.equal(saved.slug, created.movie.slug); // the address never changes

    const { body: list } = await admin.agent.get('/api/admin/movies').expect(200);
    assert.ok(list.movies.some((m) => m.id === created.movie.id && m.upcomingShows === 0));

    await admin.agent.delete(`/api/admin/movies/${created.movie.id}`).expect(204);
    await request(app).get(`/api/movies/${created.movie.slug}`).expect(404);
    await admin.agent.put(`/api/admin/movies/${created.movie.id}`).send(film()).expect(404);
  });

  test('film input is checked field by field', async () => {
    for (const bad of [
      { titleTr: '' },
      { titleTr: '   ' },
      { titleEn: 'x'.repeat(121) },
      { director: 'Bad\u0000Name' },
      { year: 1700 },
      { year: '1922' },
      { runtimeMin: 0 },
      { runtimeMin: 999 },
      { posterInk: 'red' },
      { posterPaper: '#12345' },
      { summaryEn: undefined },
    ]) {
      await admin.agent.post('/api/admin/movies').send(film(bad)).expect(400);
    }
    // Unreadable poster: grey on grey.
    assert.equal((await admin.agent.post('/api/admin/movies').send(film({ posterInk: '#777777', posterPaper: '#888888' })).expect(400)).body.error, 'low_contrast');
    const customer = await agentFor('CUSTOMER');
    await customer.agent.post('/api/admin/movies').send(film()).expect(403);
  });

  test('a film with tickets cannot be deleted, and a longer runtime cannot crash into the next show', async () => {
    const { body: created } = await admin.agent.post('/api/admin/movies').send(film({ runtimeMin: 60 })).expect(201);
    const movieId = created.movie.id;
    const first = freeSlot(5, 5); // 05:00 UTC
    const { body: show } = await create(body(first, { movieId })).expect(201);
    // Another film in the same hall 90 minutes later: fine for a 60-minute film.
    await create(body(new Date(first.getTime() + 90 * 60_000))).expect(201);

    const longer = await admin.agent.put(`/api/admin/movies/${movieId}`).send(film({ runtimeMin: 80 })).expect(409);
    assert.equal(longer.body.error, 'runtime_clash');
    await admin.agent.put(`/api/admin/movies/${movieId}`).send(film({ runtimeMin: 70 })).expect(200); // 70 + 20 cleaning still fits

    const seatRow = await prisma.hallSeat.findFirst({ where: { hallId: options.halls[0].id } });
    await prisma.booking.create({
      data: {
        userId: admin.user.id,
        showtimeId: show.showtime.id,
        status: 'PAID',
        holdExpiresAt: new Date(),
        paidAt: new Date(),
        totalCents: 16000,
        seats: { create: [{ showtimeId: show.showtime.id, hallSeatId: seatRow.id }] },
      },
    });
    assert.equal((await admin.agent.delete(`/api/admin/movies/${movieId}`).expect(409)).body.error, 'movie_has_bookings');
  });
});
