// Catalogue reads, the seat map and timed seat holds.
//
// A hold is a Booking with status HOLD and a deadline. Its BookingSeat rows occupy the seats;
// the unique (showtimeId, hallSeatId) pair guarantees that a seat is in at most one booking.
// Expired holds are not cleaned by a timer (serverless has none): the seat map treats them as
// free, and the next hold that wants one of those seats deletes them in the same transaction.
import { Prisma } from '@prisma/client';

import { AppError } from '../errors.js';

export const HOLD_MINUTES = 10;
export const MAX_SEATS = 8;
const DAYS_LISTED = 14;

const movieFields = {
  slug: true, titleTr: true, titleEn: true, originalTitle: true, year: true, director: true,
  runtimeMin: true, summaryTr: true, summaryEn: true, posterInk: true, posterPaper: true,
};
const showtimeFields = { id: true, startsAt: true, priceCents: true, hall: { select: { slug: true, name: true } } };

const upcoming = (now) => ({ gte: now, lt: new Date(now.getTime() + DAYS_LISTED * 86_400_000) });

export async function listMovies(db, now = new Date()) {
  return db.movie.findMany({
    select: { ...movieFields, showtimes: { where: { startsAt: upcoming(now) }, select: showtimeFields, orderBy: { startsAt: 'asc' } } },
    orderBy: { year: 'asc' },
  });
}

export async function getMovie(db, slug, now = new Date()) {
  const movie = await db.movie.findUnique({
    where: { slug },
    select: { ...movieFields, showtimes: { where: { startsAt: upcoming(now) }, select: showtimeFields, orderBy: { startsAt: 'asc' } } },
  });
  if (!movie) throw new AppError(404, 'not_found');
  return movie;
}

// The seat map of one showtime, from the point of view of `userId` (null when logged out).
// Statuses: free, held (someone else's active hold), sold, mine (in my active hold).
export async function getSeatMap(db, showtimeId, userId, now = new Date()) {
  const showtime = await db.showtime.findUnique({
    where: { id: showtimeId },
    select: {
      ...showtimeFields,
      movie: { select: movieFields },
      hall: { select: { slug: true, name: true, seats: { orderBy: [{ row: 'asc' }, { number: 'asc' }] } } },
      seats: { select: { hallSeatId: true, booking: { select: { id: true, userId: true, status: true, holdExpiresAt: true } } } },
    },
  });
  if (!showtime) throw new AppError(404, 'not_found');

  const taken = new Map(); // hallSeatId -> status
  let myHold = null;
  for (const { hallSeatId, booking } of showtime.seats) {
    if (booking.status === 'PAID') {
      taken.set(hallSeatId, booking.userId === userId ? 'mine_paid' : 'sold');
    } else if (booking.status === 'HOLD' && booking.holdExpiresAt > now) {
      const mine = booking.userId === userId;
      taken.set(hallSeatId, mine ? 'mine' : 'held');
      if (mine) myHold = { bookingId: booking.id, expiresAt: booking.holdExpiresAt };
    }
  }

  const seats = showtime.hall.seats.map((s) => ({
    id: s.id, row: s.row, number: s.number, col: s.col, kind: s.kind,
    status: taken.get(s.id) ?? 'free',
  }));
  if (myHold) myHold.seatIds = seats.filter((s) => s.status === 'mine').map((s) => s.id);

  return {
    showtime: { id: showtime.id, startsAt: showtime.startsAt, priceCents: showtime.priceCents, salesOpen: showtime.startsAt > now },
    movie: showtime.movie,
    hall: { slug: showtime.hall.slug, name: showtime.hall.name },
    seats,
    myHold,
    holdMinutes: HOLD_MINUTES,
    maxSeats: MAX_SEATS,
  };
}

// Reserve `seatIds` for the user for HOLD_MINUTES. Replaces the user's earlier hold on the
// same showtime. Throws 409 seat_taken if any seat is held or sold by someone else.
export async function holdSeats(db, { showtimeId, userId, seatIds }, now = new Date()) {
  const unique = [...new Set(seatIds)];
  if (unique.length !== seatIds.length) throw new AppError(400, 'duplicate_seats');
  if (unique.length < 1 || unique.length > MAX_SEATS) throw new AppError(400, 'seat_count');

  const showtime = await db.showtime.findUnique({ where: { id: showtimeId }, select: { id: true, hallId: true, startsAt: true, priceCents: true } });
  if (!showtime) throw new AppError(404, 'not_found');
  if (showtime.startsAt <= now) throw new AppError(409, 'sales_closed');

  const seats = await db.hallSeat.findMany({ where: { id: { in: unique }, hallId: showtime.hallId }, select: { id: true } });
  if (seats.length !== unique.length) throw new AppError(400, 'invalid_seats'); // a seat of another hall

  const expiresAt = new Date(now.getTime() + HOLD_MINUTES * 60_000);
  try {
    return await db.$transaction(async (tx) => {
      // 1. Give up my previous hold on this showtime.
      const mine = await tx.booking.findMany({ where: { userId, showtimeId, status: 'HOLD' }, select: { id: true } });
      if (mine.length) {
        const ids = mine.map((b) => b.id);
        await tx.bookingSeat.deleteMany({ where: { bookingId: { in: ids } } });
        await tx.booking.updateMany({ where: { id: { in: ids } }, data: { status: 'CANCELLED' } });
      }
      // 2. Free these seats from holds that ran out.
      const stale = await tx.booking.findMany({
        where: { showtimeId, status: 'HOLD', holdExpiresAt: { lte: now }, seats: { some: { hallSeatId: { in: unique } } } },
        select: { id: true },
      });
      if (stale.length) {
        const ids = stale.map((b) => b.id);
        await tx.bookingSeat.deleteMany({ where: { bookingId: { in: ids } } });
        await tx.booking.updateMany({ where: { id: { in: ids } }, data: { status: 'EXPIRED' } });
      }
      // 3. Take the seats. If any is still occupied, the unique index rejects the insert and the
      //    whole transaction (including step 1) is rolled back: my old hold is kept.
      return tx.booking.create({
        data: {
          userId, showtimeId, status: 'HOLD', holdExpiresAt: expiresAt, totalCents: showtime.priceCents * unique.length,
          seats: { create: unique.map((hallSeatId) => ({ showtimeId, hallSeatId })) },
        },
        select: { id: true, holdExpiresAt: true, totalCents: true, seats: { select: { hallSeatId: true } } },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'seat_taken');
    }
    throw err;
  }
}

export async function releaseHold(db, { bookingId, userId }) {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { userId: true, status: true } });
  // Someone else's booking looks exactly like a missing one: ids are not confirmed to strangers.
  if (!booking || booking.userId !== userId) throw new AppError(404, 'not_found');
  if (booking.status !== 'HOLD') throw new AppError(409, 'not_a_hold');
  await db.$transaction([
    db.bookingSeat.deleteMany({ where: { bookingId } }),
    db.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } }),
  ]);
}
