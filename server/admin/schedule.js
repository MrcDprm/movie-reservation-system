// Showtimes as the admin sees them: the week with sales, adding a show, deleting an unsold one.
import { AppError } from '../errors.js';

export const CLEANING_MIN = 20; // the hall needs a short break between two films
const DAY = 24 * 60 * 60 * 1000;

// Istanbul has no daylight saving time since 2016, so a day there always starts at 21:00 UTC.
const istanbulDayStart = (day) => new Date(`${day}T00:00:00+03:00`);
const todayInIstanbul = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

// Bookings that keep a show alive: paid ones, refund records, and holds still running
// (a hold whose time is up is just leftover and is freed anyway).
export const liveBookings = (now = new Date()) => ({
  OR: [{ status: { in: ['PAID', 'CANCELLED'] } }, { status: 'HOLD', holdExpiresAt: { gt: now } }],
});

// Does a film of `runtimeMin` starting at `startsAt` overlap another show in the hall?
// Cleaning break included on both sides. The longest film bounds how far back a clashing show
// can start, so only a small window of the timetable is read.
export async function findClash(db, { hallId, startsAt, runtimeMin, ignoreId }) {
  const longest = Math.max(runtimeMin, (await db.movie.aggregate({ _max: { runtimeMin: true } }))._max.runtimeMin ?? 0);
  const start = startsAt.getTime();
  const end = start + (runtimeMin + CLEANING_MIN) * 60_000;
  const nearby = await db.showtime.findMany({
    where: {
      hallId,
      id: ignoreId ? { not: ignoreId } : undefined,
      startsAt: { gt: new Date(start - (longest + CLEANING_MIN) * 60_000), lt: new Date(end) },
    },
    include: { movie: { select: { runtimeMin: true } } },
  });
  return nearby.find((s) => s.startsAt.getTime() + (s.movie.runtimeMin + CLEANING_MIN) * 60_000 > start) ?? null;
}

export async function listShowtimes(db, { from, days }) {
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

export async function createShowtime(db, input) {
  const startsAt = new Date(input.startsAt);
  if (startsAt.getTime() < Date.now() + 60 * 60 * 1000) throw new AppError(400, 'too_soon'); // at least an hour ahead
  if (startsAt.getTime() > Date.now() + 90 * DAY) throw new AppError(400, 'too_far');

  const [movie, hall] = await Promise.all([
    db.movie.findUnique({ where: { id: input.movieId }, select: { runtimeMin: true } }),
    db.hall.findUnique({ where: { id: input.hallId }, select: { id: true } }),
  ]);
  if (!movie || !hall) throw new AppError(400, 'invalid_input');
  if (await findClash(db, { hallId: hall.id, startsAt, runtimeMin: movie.runtimeMin })) throw new AppError(409, 'hall_busy');

  try {
    return await db.showtime.create({ data: { movieId: input.movieId, hallId: hall.id, startsAt, priceCents: input.priceCents } });
  } catch (err) {
    if (err?.code === 'P2002') throw new AppError(409, 'hall_busy'); // same hall, same minute, created just now
    throw err;
  }
}

export async function deleteShowtime(db, showtimeId) {
  // Inside a transaction, so a hold made at the same moment cannot slip through.
  return db.$transaction(async (tx) => {
    const showtime = await tx.showtime.findUnique({ where: { id: showtimeId }, select: { id: true } });
    if (!showtime) throw new AppError(404, 'not_found');
    const active = await tx.booking.count({ where: { showtimeId, ...liveBookings() } });
    if (active > 0) throw new AppError(409, 'has_bookings'); // sold tickets and refund records are kept
    await tx.showtime.delete({ where: { id: showtimeId } }); // expired holds go with it
  });
}
