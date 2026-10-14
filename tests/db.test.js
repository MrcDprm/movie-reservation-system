import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { plannedShowtimes, seed } from '../prisma/seed.js';
import { hasTestDatabase, testPrisma, wipeDatabase } from './helpers/db.js';

// --- No database needed ---

test('planned showtimes: future only, one per hall and time, three a day', () => {
  const halls = [{ id: 'h1' }, { id: 'h2' }];
  const movies = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}` }));
  const now = new Date('2026-10-14T12:00:00Z'); // after the 14:00 (11:00 UTC) slot
  const shows = plannedShowtimes(halls, movies, now);

  assert.ok(shows.every((s) => s.startsAt > now));
  const keys = new Set(shows.map((s) => `${s.hallId}|${s.startsAt.toISOString()}`));
  assert.equal(keys.size, shows.length);
  assert.equal(shows.length, 14 * 2 * 3 - 2); // today's first slot has passed in both halls
  // Two halls never show the same film at the same time.
  const sameTime = shows.filter((s) => s.startsAt.getTime() === shows[0].startsAt.getTime());
  assert.notEqual(sameTime[0].movieId, sameTime[1].movieId);
});

// --- Against the Neon test branch ---

describe('database', { skip: !hasTestDatabase && 'no .env.test' }, () => {
  let prisma;

  before(async () => {
    prisma = testPrisma();
    await wipeDatabase(prisma);
    await seed(prisma);
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  test('seed builds both halls with their aisles and accessible seats', async () => {
    const halls = await prisma.hall.findMany({ include: { seats: true }, orderBy: { slug: 'asc' } });
    const big = halls.find((h) => h.slug === 'buyuk-salon');
    const small = halls.find((h) => h.slug === 'kucuk-salon');
    assert.equal(big.seats.length, 140);
    assert.equal(small.seats.length, 60);
    assert.deepEqual(
      big.seats.filter((s) => s.kind === 'ACCESSIBLE').map((s) => `${s.row}${s.number}`).sort(),
      ['K1', 'K13', 'K14', 'K2'],
    );
    // Aisle after seat 3: seat 4 sits one column further right.
    const a3 = big.seats.find((s) => s.row === 'A' && s.number === 3);
    const a4 = big.seats.find((s) => s.row === 'A' && s.number === 4);
    assert.equal(a4.col - a3.col, 2);
  });

  test('running the seed again adds nothing', async () => {
    const result = await seed(prisma);
    assert.equal(result.showtimesAdded, 0);
    assert.equal(await prisma.hallSeat.count(), 200);
  });

  test('the same seat cannot be booked twice, even at the same moment', async () => {
    const showtime = await prisma.showtime.findFirst({ include: { hall: { include: { seats: true } } } });
    const seat = showtime.hall.seats[0];
    const user = await prisma.user.create({
      data: { email: 'race@test.local', passwordHash: 'x', name: 'Race' },
    });
    const book = () =>
      prisma.booking.create({
        data: {
          userId: user.id,
          showtimeId: showtime.id,
          holdExpiresAt: new Date(Date.now() + 600_000),
          totalCents: showtime.priceCents,
          seats: { create: { showtimeId: showtime.id, hallSeatId: seat.id } },
        },
      });

    // Ten customers try the same seat at once.
    const results = await Promise.allSettled(Array.from({ length: 10 }, book));
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    assert.equal(won.length, 1);
    assert.equal(lost.length, 9);
    assert.ok(lost.every((r) => r.reason.code === 'P2002')); // unique constraint violation
    assert.equal(await prisma.bookingSeat.count({ where: { showtimeId: showtime.id } }), 1);
  });
});
