// Admin: plan showtimes and see how they sell. Everything here needs the ADMIN role.
import { Router } from 'express';
import { z } from 'zod';

import { requireRole } from '../auth/middleware.js';
import { AppError } from '../errors.js';

const CLEANING_MIN = 20; // the hall needs a short break between two films
const DAY = 24 * 60 * 60 * 1000;

const id = z.string().min(1).max(40).regex(/^[a-z0-9]+$/i);
const listQuery = z.object({
  from: z.iso.date().optional(), // "2026-10-14", an Istanbul calendar day
  days: z.coerce.number().int().min(1).max(31).default(7),
});
const showtimeBody = z.object({
  movieId: id,
  hallId: id,
  startsAt: z.iso.datetime({ offset: true }), // the page sends Istanbul time with "+03:00"
  priceCents: z.number().int().min(1000).max(100000), // 10 to 1,000 TL
});

// Istanbul has no daylight saving time since 2016, so a day there always starts at 21:00 UTC.
const istanbulDayStart = (day) => new Date(`${day}T00:00:00+03:00`);
const todayInIstanbul = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

// Bookings that keep a show alive: paid ones, refund records, and holds still running
// (a hold whose time is up is just leftover and is freed anyway).
const liveBookings = (now = new Date()) => ({
  OR: [{ status: { in: ['PAID', 'CANCELLED'] } }, { status: 'HOLD', holdExpiresAt: { gt: now } }],
});

const parse = (schema, value) => {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError(400, 'invalid_input');
  return result.data;
};

async function listShowtimes(db, { from, days }) {
  const start = istanbulDayStart(from ?? todayInIstanbul());
  const showtimes = await db.showtime.findMany({
    where: { startsAt: { gte: start, lt: new Date(start.getTime() + days * DAY) } },
    orderBy: { startsAt: 'asc' },
    include: {
      movie: { select: { titleTr: true, titleEn: true, runtimeMin: true } },
      hall: { select: { name: true, _count: { select: { seats: true } } } },
      bookings: { where: { status: 'PAID' }, select: { totalCents: true, _count: { select: { seats: true } } } },
      _count: { select: { bookings: { where: liveBookings() } } },
    },
  });
  return showtimes.map((s) => ({
    id: s.id,
    startsAt: s.startsAt,
    priceCents: s.priceCents,
    movie: { titleTr: s.movie.titleTr, titleEn: s.movie.titleEn, runtimeMin: s.movie.runtimeMin },
    hall: s.hall.name,
    capacity: s.hall._count.seats,
    sold: s.bookings.reduce((sum, b) => sum + b._count.seats, 0),
    revenueCents: s.bookings.reduce((sum, b) => sum + b.totalCents, 0),
    // Sold, refunded or currently held: such a show cannot simply be deleted.
    hasBookings: s._count.bookings > 0,
  }));
}

async function createShowtime(db, input) {
  const startsAt = new Date(input.startsAt);
  if (startsAt.getTime() < Date.now() + 60 * 60 * 1000) throw new AppError(400, 'too_soon'); // at least an hour ahead
  if (startsAt.getTime() > Date.now() + 90 * DAY) throw new AppError(400, 'too_far');

  const [movie, hall] = await Promise.all([
    db.movie.findUnique({ where: { id: input.movieId }, select: { runtimeMin: true } }),
    db.hall.findUnique({ where: { id: input.hallId }, select: { id: true } }),
  ]);
  if (!movie || !hall) throw new AppError(400, 'invalid_input');

  // No overlap with another film in the same hall, cleaning break included. The longest film
  // bounds how far back a clashing show can start.
  const longest = (await db.movie.aggregate({ _max: { runtimeMin: true } }))._max.runtimeMin ?? 0;
  const end = startsAt.getTime() + (movie.runtimeMin + CLEANING_MIN) * 60_000;
  const nearby = await db.showtime.findMany({
    where: {
      hallId: hall.id,
      startsAt: { gt: new Date(startsAt.getTime() - (longest + CLEANING_MIN) * 60_000), lt: new Date(end) },
    },
    include: { movie: { select: { runtimeMin: true } } },
  });
  const clash = nearby.some((s) => s.startsAt.getTime() + (s.movie.runtimeMin + CLEANING_MIN) * 60_000 > startsAt.getTime());
  if (clash) throw new AppError(409, 'hall_busy');

  try {
    return await db.showtime.create({ data: { movieId: input.movieId, hallId: hall.id, startsAt, priceCents: input.priceCents } });
  } catch (err) {
    if (err?.code === 'P2002') throw new AppError(409, 'hall_busy'); // same hall, same minute, created just now
    throw err;
  }
}

async function deleteShowtime(db, showtimeId) {
  // Inside a transaction, so a hold made at the same moment cannot slip through.
  return db.$transaction(async (tx) => {
    const showtime = await tx.showtime.findUnique({ where: { id: showtimeId }, select: { id: true } });
    if (!showtime) throw new AppError(404, 'not_found');
    const active = await tx.booking.count({ where: { showtimeId, ...liveBookings() } });
    if (active > 0) throw new AppError(409, 'has_bookings'); // sold tickets and refund records are kept
    await tx.showtime.delete({ where: { id: showtimeId } }); // expired holds go with it
  });
}

export function createAdminRouter({ db }) {
  const router = Router();
  router.use(requireRole('ADMIN'));

  // What the new-showtime form can choose from.
  router.get('/options', async (req, res) => {
    const [movies, halls] = await Promise.all([
      db().movie.findMany({ select: { id: true, titleTr: true, titleEn: true, runtimeMin: true }, orderBy: { titleTr: 'asc' } }),
      db().hall.findMany({ select: { id: true, name: true, _count: { select: { seats: true } } }, orderBy: { name: 'asc' } }),
    ]);
    res.json({ movies, halls: halls.map((h) => ({ id: h.id, name: h.name, capacity: h._count.seats })) });
  });

  router.get('/showtimes', async (req, res) => {
    res.json({ showtimes: await listShowtimes(db(), parse(listQuery, req.query)) });
  });

  router.post('/showtimes', async (req, res) => {
    const showtime = await createShowtime(db(), parse(showtimeBody, req.body));
    res.status(201).json({ showtime: { id: showtime.id } });
  });

  router.delete('/showtimes/:id', async (req, res) => {
    if (!id.safeParse(req.params.id).success) throw new AppError(404, 'not_found');
    await deleteShowtime(db(), req.params.id);
    res.status(204).end();
  });

  return router;
}
