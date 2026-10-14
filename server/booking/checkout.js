// From a seat hold to a paid booking.
//
// 1. The customer starts checkout: the hold is extended to the life of the Stripe page, so the
//    seats cannot be lost while they type their card number.
// 2. Stripe calls the webhook. Every update is conditional on the current status, so an event
//    delivered twice (Stripe retries) changes nothing the second time.
// 3. If the money arrives for a booking that is no longer a hold (released, replaced, expired
//    and re-sold), it is refunded automatically.
import { AppError } from '../errors.js';
import { CHECKOUT_MINUTES } from '../payments.js';

const seatLabel = (seat) => `${seat.row}${seat.number}`;

const formatTime = (date, lang) =>
  new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'tr-TR', {
    timeZone: 'Europe/Istanbul', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  }).format(date);

export async function startCheckout(db, payments, { bookingId, user, lang = 'tr' }, now = new Date()) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      showtime: { include: { movie: true, hall: true } },
      seats: { include: { hallSeat: true } },
    },
  });
  if (!booking || booking.userId !== user.id) throw new AppError(404, 'not_found');
  if (booking.status === 'PAID') throw new AppError(409, 'already_paid');
  if (booking.status !== 'HOLD' || booking.holdExpiresAt <= now) throw new AppError(409, 'hold_expired');

  // Pressing "pay" twice reuses the open page instead of creating a second one.
  if (booking.stripeSessionId) {
    const existing = await payments.getCheckout(booking.stripeSessionId);
    if (existing.status === 'open') return { url: existing.url };
  }

  const pageExpiresAt = new Date(now.getTime() + (CHECKOUT_MINUTES + 1) * 60_000);
  // The hold outlives the page by two minutes, so a payment in the last second still finds it.
  const { count } = await db.booking.updateMany({
    where: { id: booking.id, status: 'HOLD', holdExpiresAt: { gt: now } },
    data: { holdExpiresAt: new Date(pageExpiresAt.getTime() + 2 * 60_000) },
  });
  if (count !== 1) throw new AppError(409, 'hold_expired');

  const { movie, hall } = booking.showtime;
  const seats = booking.seats.map((s) => s.hallSeat).sort((a, b) => a.row.localeCompare(b.row) || a.number - b.number);
  const checkout = await payments.createCheckout({
    booking,
    email: user.email,
    lang,
    expiresAt: pageExpiresAt,
    lines: [{
      name: lang === 'en' ? movie.titleEn : movie.titleTr,
      description: `${formatTime(booking.showtime.startsAt, lang)} · ${hall.name} · ${seats.map(seatLabel).join(', ')}`,
      unitCents: booking.showtime.priceCents,
      quantity: seats.length,
    }],
  });
  await db.booking.update({ where: { id: booking.id }, data: { stripeSessionId: checkout.id } });
  return { url: checkout.url };
}

async function markPaid(db, payments, session, now) {
  const bookingId = session.metadata?.bookingId;
  if (!bookingId || session.payment_status !== 'paid') return 'ignored';
  const { count } = await db.booking.updateMany({
    where: { id: bookingId, status: 'HOLD' },
    data: { status: 'PAID', paidAt: now, stripeSessionId: session.id },
  });
  if (count === 1) return 'paid';

  const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { status: true } });
  if (booking?.status === 'PAID') return 'already_paid'; // a repeated event
  // The seats are no longer reserved for this booking: give the money back.
  await payments.refund(session.payment_intent, `refund-${session.id}`);
  return 'refunded';
}

async function releaseExpired(db, session) {
  const booking = await db.booking.findFirst({ where: { stripeSessionId: session.id, status: 'HOLD' }, select: { id: true } });
  if (!booking) return 'ignored';
  await db.$transaction([
    db.bookingSeat.deleteMany({ where: { bookingId: booking.id } }),
    db.booking.updateMany({ where: { id: booking.id, status: 'HOLD' }, data: { status: 'EXPIRED' } }),
  ]);
  return 'released';
}

export async function handleStripeEvent(db, payments, event, now = new Date()) {
  const session = event.data?.object ?? {};
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return markPaid(db, payments, session, now);
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed':
      return releaseExpired(db, session);
    default:
      return 'ignored';
  }
}

// --- The customer's bookings ---

const bookingInclude = {
  showtime: { select: { id: true, startsAt: true, priceCents: true, movie: { select: { slug: true, titleTr: true, titleEn: true, posterInk: true, posterPaper: true } }, hall: { select: { name: true } } } },
  seats: { select: { id: true, checkedInAt: true, hallSeat: { select: { row: true, number: true, kind: true } } } },
};

const present = (b) => ({
  id: b.id,
  status: b.status,
  totalCents: b.totalCents,
  holdExpiresAt: b.status === 'HOLD' ? b.holdExpiresAt : null,
  paidAt: b.paidAt,
  showtime: b.showtime,
  seats: b.seats
    .map((s) => ({ id: s.id, label: seatLabel(s.hallSeat), kind: s.hallSeat.kind, checkedIn: Boolean(s.checkedInAt) }))
    .sort((a, b2) => a.label.localeCompare(b2.label, 'tr', { numeric: true })),
});

export async function listBookings(db, userId) {
  const bookings = await db.booking.findMany({
    where: { userId, status: 'PAID' },
    include: bookingInclude,
    orderBy: { showtime: { startsAt: 'desc' } },
  });
  return bookings.map(present);
}

export async function getBooking(db, { bookingId, userId }) {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
  if (!booking || booking.userId !== userId) throw new AppError(404, 'not_found');
  return present(booking);
}
