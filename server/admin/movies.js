// Films: list, add, edit, delete. A film's slug (its address, /movies/<slug>) is made once from
// the English title and the year, and never changes, so shared links keep working.
import { AppError } from '../errors.js';
import { findClash, liveBookings } from './schedule.js';

export const MOVIE_FIELDS = [
  'titleTr', 'titleEn', 'originalTitle', 'year', 'director', 'runtimeMin', 'summaryTr', 'summaryEn', 'posterInk', 'posterPaper',
];

// "Häxan: Witchcraft" + 1922 -> "haxan-witchcraft-1922"
export function slugify(title, year) {
  const base = title
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u00ad]/g, '') // accents and soft hyphens
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return `${base || 'film'}-${year}`;
}

// WCAG contrast ratio of two "#rrggbb" colours: the poster title must stay readable.
export function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const checkColours = (input) => {
  if (contrast(input.posterInk, input.posterPaper) < 3) throw new AppError(400, 'low_contrast');
};

export async function listMovies(db) {
  const movies = await db.movie.findMany({
    orderBy: { titleTr: 'asc' },
    include: { _count: { select: { showtimes: { where: { startsAt: { gt: new Date() } } } } } },
  });
  return movies.map(({ _count, createdAt, ...movie }) => ({ ...movie, upcomingShows: _count.showtimes }));
}

export async function createMovie(db, input) {
  checkColours(input);
  const base = slugify(input.titleEn, input.year);
  // Two films with the same title and year are rare; a number keeps their addresses apart.
  for (let n = 1; n <= 20; n++) {
    try {
      return await db.movie.create({ data: { ...input, slug: n === 1 ? base : `${base}-${n}` } });
    } catch (err) {
      if (err?.code !== 'P2002') throw err;
    }
  }
  throw new AppError(409, 'slug_taken');
}

export async function updateMovie(db, movieId, input) {
  checkColours(input);
  const movie = await db.movie.findUnique({ where: { id: movieId }, select: { runtimeMin: true } });
  if (!movie) throw new AppError(404, 'not_found');

  // A longer film may now run into the next show in the same hall.
  if (input.runtimeMin > movie.runtimeMin) {
    const upcoming = await db.showtime.findMany({ where: { movieId, startsAt: { gt: new Date() } }, select: { id: true, hallId: true, startsAt: true } });
    for (const show of upcoming) {
      if (await findClash(db, { hallId: show.hallId, startsAt: show.startsAt, runtimeMin: input.runtimeMin, ignoreId: show.id })) {
        throw new AppError(409, 'runtime_clash', { startsAt: show.startsAt });
      }
    }
  }
  return db.movie.update({ where: { id: movieId }, data: input });
}

export async function deleteMovie(db, movieId) {
  // Its showtimes go with it, so it is refused while any of them has tickets.
  return db.$transaction(async (tx) => {
    const movie = await tx.movie.findUnique({ where: { id: movieId }, select: { id: true } });
    if (!movie) throw new AppError(404, 'not_found');
    const active = await tx.booking.count({ where: { showtime: { movieId }, ...liveBookings() } });
    if (active > 0) throw new AppError(409, 'movie_has_bookings');
    await tx.movie.delete({ where: { id: movieId } });
  });
}
