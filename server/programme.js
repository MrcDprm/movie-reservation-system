// The programme keeps itself going: once a day a cron job adds the shows of the coming two
// weeks (three a day per hall, films in rotation) and clears out expired leftovers.
import { CLEANING_MIN } from './admin/schedule.js';

const DAYS_AHEAD = 14;
const DAY = 86_400_000;
// Istanbul is UTC+3 all year.
const SLOTS = [
  { hourUtc: 11, minute: 0, priceCents: 15000 }, // 14:00, matinee
  { hourUtc: 14, minute: 30, priceCents: 15000 }, // 17:30
  { hourUtc: 18, minute: 0, priceCents: 18000 }, // 21:00
];

export function plannedShowtimes(halls, movies, from = new Date()) {
  if (movies.length === 0) return [];
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const planned = [];
  for (let day = 0; day < DAYS_AHEAD; day++) {
    halls.forEach((hall, h) => {
      SLOTS.forEach((slot, s) => {
        const startsAt = new Date(start + day * DAY + slot.hourUtc * 3_600_000 + slot.minute * 60_000);
        if (startsAt <= from) return;
        // Rotate films so each hall and day has a different programme.
        const movie = movies[(day * SLOTS.length + s + h * 3) % movies.length];
        planned.push({ hallId: hall.id, movieId: movie.id, startsAt, priceCents: slot.priceCents });
      });
    });
  }
  return planned;
}

// Adds the planned shows that are still missing. A slot is skipped when the hall is already
// busy then, for example because the admin put another film there by hand.
export async function topUpShowtimes(db, now = new Date()) {
  const [halls, movies] = await Promise.all([
    db.hall.findMany({ orderBy: { slug: 'asc' }, select: { id: true } }),
    db.movie.findMany({ orderBy: [{ createdAt: 'asc' }, { slug: 'asc' }], select: { id: true, runtimeMin: true } }),
  ]);
  const runtime = new Map(movies.map((m) => [m.id, m.runtimeMin]));
  const longest = Math.max(0, ...movies.map((m) => m.runtimeMin));

  // Everything already on the timetable in that window, read once.
  const existing = await db.showtime.findMany({
    where: { startsAt: { gt: new Date(now.getTime() - (longest + CLEANING_MIN) * 60_000), lt: new Date(now.getTime() + (DAYS_AHEAD + 1) * DAY) } },
    select: { hallId: true, startsAt: true, movie: { select: { runtimeMin: true } } },
  });
  const busy = existing.map((s) => ({ hallId: s.hallId, start: s.startsAt.getTime(), runtimeMin: s.movie.runtimeMin }));
  const overlaps = (a, b) =>
    a.hallId === b.hallId &&
    a.start < b.start + (b.runtimeMin + CLEANING_MIN) * 60_000 &&
    b.start < a.start + (a.runtimeMin + CLEANING_MIN) * 60_000;

  const toAdd = [];
  for (const show of plannedShowtimes(halls, movies, now)) {
    const slot = { hallId: show.hallId, start: show.startsAt.getTime(), runtimeMin: runtime.get(show.movieId) };
    if (busy.some((b) => overlaps(slot, b))) continue;
    busy.push(slot);
    toAdd.push(show);
  }
  const { count } = await db.showtime.createMany({ data: toAdd, skipDuplicates: true });
  return count;
}

// Rows that only take up space once their time has passed.
export async function cleanUp(db, now = new Date()) {
  const [buckets, sessions, tokens] = await Promise.all([
    db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: now } } }),
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.emailToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - DAY) } } }),
  ]);
  return { rateLimitBuckets: buckets.count, sessions: sessions.count, emailTokens: tokens.count };
}
