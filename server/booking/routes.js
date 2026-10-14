// Catalogue and seat hold endpoints.
import { Router } from 'express';
import { z } from 'zod';

import { AppError } from '../errors.js';
import { enforce } from '../rateLimit.js';
import { requireUser } from '../auth/middleware.js';
import { getBooking, listBookings, startCheckout } from './checkout.js';
import { getMovie, getSeatMap, holdSeats, listMovies, releaseHold, MAX_SEATS } from './service.js';

const id = z.string().min(1).max(40).regex(/^[a-z0-9]+$/i);
const holdBody = z.object({ seatIds: z.array(id).min(1).max(MAX_SEATS) });
const checkoutBody = z.object({ lang: z.enum(['tr', 'en']).default('tr') });

function requireVerified(req, res, next) {
  if (!req.user.emailVerifiedAt) throw new AppError(403, 'email_not_verified');
  next();
}

export function createBookingRouter({ db, payments }) {
  const router = Router();

  // A replaced or released hold must not stay payable on Stripe. Best effort: if closing fails,
  // a payment for it is still refunded by the webhook.
  const closeCheckouts = async (ids) => {
    for (const checkoutId of ids) {
      try {
        await payments.expireCheckout(checkoutId);
      } catch (err) {
        console.error('[checkout] could not close', checkoutId, err?.message);
      }
    }
  };

  router.get('/movies', async (req, res) => {
    res.json({ movies: await listMovies(db()) });
  });

  router.get('/movies/:slug', async (req, res) => {
    res.json({ movie: await getMovie(db(), req.params.slug) });
  });

  // Polled every few seconds by the seat page, so it stays a single query.
  router.get('/showtimes/:id/seats', async (req, res) => {
    if (!id.safeParse(req.params.id).success) throw new AppError(404, 'not_found');
    res.json(await getSeatMap(db(), req.params.id, req.user?.id ?? null));
  });

  router.post('/showtimes/:id/hold', requireUser, requireVerified, async (req, res) => {
    if (!id.safeParse(req.params.id).success) throw new AppError(404, 'not_found');
    const parsed = holdBody.safeParse(req.body ?? {});
    if (!parsed.success) throw new AppError(400, 'invalid_input', { fields: ['seatIds'] });
    await enforce(db(), [{ key: `hold:user:${req.user.id}`, limit: 30, windowSeconds: 600 }]);
    const { booking: hold, replacedCheckouts } = await holdSeats(db(), { showtimeId: req.params.id, userId: req.user.id, seatIds: parsed.data.seatIds });
    await closeCheckouts(replacedCheckouts);
    res.status(201).json({
      hold: { bookingId: hold.id, expiresAt: hold.holdExpiresAt, totalCents: hold.totalCents, seatIds: hold.seats.map((s) => s.hallSeatId) },
    });
  });

  router.delete('/holds/:bookingId', requireUser, async (req, res) => {
    if (!id.safeParse(req.params.bookingId).success) throw new AppError(404, 'not_found');
    const checkoutId = await releaseHold(db(), { bookingId: req.params.bookingId, userId: req.user.id });
    if (checkoutId) await closeCheckouts([checkoutId]);
    res.status(204).end();
  });

  router.post('/holds/:bookingId/checkout', requireUser, requireVerified, async (req, res) => {
    if (!id.safeParse(req.params.bookingId).success) throw new AppError(404, 'not_found');
    const lang = checkoutBody.safeParse(req.body ?? {}).data?.lang ?? 'tr';
    await enforce(db(), [{ key: `checkout:user:${req.user.id}`, limit: 20, windowSeconds: 600 }]);
    res.json(await startCheckout(db(), payments, { bookingId: req.params.bookingId, user: req.user, lang }));
  });

  router.get('/bookings', requireUser, async (req, res) => {
    res.json({ bookings: await listBookings(db(), req.user.id) });
  });

  router.get('/bookings/:bookingId', requireUser, async (req, res) => {
    if (!id.safeParse(req.params.bookingId).success) throw new AppError(404, 'not_found');
    res.json({ booking: await getBooking(db(), { bookingId: req.params.bookingId, userId: req.user.id }) });
  });

  return router;
}
