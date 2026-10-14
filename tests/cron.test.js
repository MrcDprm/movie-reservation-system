import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { seed } from '../prisma/seed.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { cleanUp, topUpShowtimes } from '../server/programme.js';
import { hasTestDatabase, testPrisma, wipeDatabase } from './helpers/db.js';

const CRON_SECRET = 'a-cron-secret-that-is-32-chars-long!';

test('production refuses to start without a cron secret', () => {
  const env = { NODE_ENV: 'production', RESEND_API_KEY: 'r', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'w', TICKET_SECRET: 't'.repeat(32) };
  assert.throws(() => loadConfig(env), /CRON_SECRET/);
});

describe('daily job', { skip: !hasTestDatabase && 'no .env.test' }, () => {
  let prisma;
  let app;

  before(async () => {
    prisma = testPrisma();
    app = createApp(loadConfig({ DATABASE_URL: process.env.DATABASE_URL, CRON_SECRET }), { prisma });
  });

  beforeEach(async () => {
    await wipeDatabase(prisma);
    await prisma.rateLimitBucket.deleteMany();
    await seed(prisma);
  });

  after(async () => {
    await wipeDatabase(prisma);
  });

  test('only Vercel, with the secret, can run it', async () => {
    await request(app).get('/api/cron/daily').expect(401);
    await request(app).get('/api/cron/daily').set('Authorization', 'Bearer wrong').expect(401);
    await request(app).get('/api/cron/daily').set('Authorization', CRON_SECRET).expect(401); // no "Bearer "
    const { body } = await request(app).get('/api/cron/daily').set('Authorization', `Bearer ${CRON_SECRET}`).expect(200);
    assert.equal(body.showtimesAdded, 0); // the seed has just filled the two weeks
  });

  test('without a configured secret the job cannot be run at all', async () => {
    const open = createApp(loadConfig({ DATABASE_URL: process.env.DATABASE_URL }), { prisma });
    await request(open).get('/api/cron/daily').set('Authorization', 'Bearer ').expect(401);
    await request(open).get('/api/cron/daily').set('Authorization', 'Bearer undefined').expect(401);
  });

  test('the next day the missing day is added, and a slot taken by hand is skipped', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const before = await prisma.showtime.count();

    // The admin puts a film in the big hall at 16:30 Istanbul time on the new last day;
    // it runs into the planned 17:30 show there.
    const hall = await prisma.hall.findUnique({ where: { slug: 'buyuk-salon' } });
    const movie = await prisma.movie.findUnique({ where: { slug: 'metropolis' } }); // 153 minutes
    const lastDay = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate() + 13));
    await prisma.showtime.create({
      data: { hallId: hall.id, movieId: movie.id, startsAt: new Date(lastDay.getTime() + 13.5 * 3_600_000), priceCents: 15000 },
    });

    const added = await topUpShowtimes(prisma, tomorrow);
    assert.equal(await prisma.showtime.count(), before + 1 + added);

    const day = { gte: lastDay, lt: new Date(lastDay.getTime() + 24 * 3_600_000) };
    const big = await prisma.showtime.findMany({
      where: { hallId: hall.id, startsAt: day },
      orderBy: { startsAt: 'asc' },
      include: { movie: { select: { runtimeMin: true } } },
    });
    const hours = big.map((s) => s.startsAt.getUTCHours() + s.startsAt.getUTCMinutes() / 60);
    assert.ok(!hours.includes(14.5), 'the planned 17:30 show was skipped');
    assert.ok(hours.includes(18), 'the 21:00 show was still added');
    // Nothing in the big hall overlaps, cleaning break included.
    for (let i = 1; i < big.length; i++) {
      const prevEnd = big[i - 1].startsAt.getTime() + (big[i - 1].movie.runtimeMin + 20) * 60_000;
      assert.ok(prevEnd <= big[i].startsAt.getTime());
    }
    // The small hall gets its usual three.
    assert.equal(await prisma.showtime.count({ where: { hallId: { not: hall.id }, startsAt: day } }), 3);
    assert.equal(await topUpShowtimes(prisma, tomorrow), 0); // running twice adds nothing
  });

  test('expired leftovers are removed, live ones are kept', async () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60 * 60_000);
    await prisma.rateLimitBucket.createMany({ data: [{ key: 'old', count: 1, resetAt: past }, { key: 'live', count: 1, resetAt: future }] });
    const removed = await cleanUp(prisma);
    assert.equal(removed.rateLimitBuckets, 1);
    assert.deepEqual((await prisma.rateLimitBucket.findMany()).map((b) => b.key), ['live']);
  });
});
