// Admin endpoints: films and showtimes. Everything here needs the ADMIN role.
import { Router } from 'express';
import { z } from 'zod';

import { requireRole } from '../auth/middleware.js';
import { AppError } from '../errors.js';
import { createMovie, deleteMovie, listMovies, updateMovie } from './movies.js';
import { createShowtime, deleteShowtime, listShowtimes } from './schedule.js';

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

// One line of text: trimmed, no control characters (the soft hyphen U+00AD is allowed).
const line = (max) =>
  z.string().trim().min(1).max(max).refine((s) => !/[\u0000-\u001f\u007f]/.test(s));
// A paragraph may have line breaks, nothing else invisible.
const paragraph = (max) =>
  z.string().trim().min(1).max(max).refine((s) => !/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(s));
const colour = z.string().regex(/^#[0-9a-f]{6}$/i).transform((s) => s.toLowerCase());

// Only these fields are saved; anything else in the body (slug, id, createdAt...) is dropped.
const movieBody = z.object({
  titleTr: line(120),
  titleEn: line(120),
  originalTitle: line(120),
  year: z.number().int().min(1888).max(new Date().getUTCFullYear() + 2),
  director: line(80),
  runtimeMin: z.number().int().min(1).max(300),
  summaryTr: paragraph(1000),
  summaryEn: paragraph(1000),
  posterInk: colour,
  posterPaper: colour,
});

const parse = (schema, value) => {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError(400, 'invalid_input');
  return result.data;
};

const checkId = (value) => {
  if (!id.safeParse(value).success) throw new AppError(404, 'not_found');
  return value;
};

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

  // --- Films ---

  router.get('/movies', async (req, res) => {
    res.json({ movies: await listMovies(db()) });
  });

  router.post('/movies', async (req, res) => {
    const movie = await createMovie(db(), parse(movieBody, req.body));
    res.status(201).json({ movie: { id: movie.id, slug: movie.slug } });
  });

  router.put('/movies/:id', async (req, res) => {
    const movieId = checkId(req.params.id);
    const movie = await updateMovie(db(), movieId, parse(movieBody, req.body));
    res.json({ movie: { id: movie.id, slug: movie.slug } });
  });

  router.delete('/movies/:id', async (req, res) => {
    await deleteMovie(db(), checkId(req.params.id));
    res.status(204).end();
  });

  // --- Showtimes ---

  router.get('/showtimes', async (req, res) => {
    res.json({ showtimes: await listShowtimes(db(), parse(listQuery, req.query)) });
  });

  router.post('/showtimes', async (req, res) => {
    const showtime = await createShowtime(db(), parse(showtimeBody, req.body));
    res.status(201).json({ showtime: { id: showtime.id } });
  });

  router.delete('/showtimes/:id', async (req, res) => {
    await deleteShowtime(db(), checkId(req.params.id));
    res.status(204).end();
  });

  return router;
}
