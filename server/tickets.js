// Tickets: the code inside the QR, and checking a ticket at the door.
//
// The QR holds "t1.<ticket id>.<signature>". The signature is an HMAC of the id with a server
// secret, so nobody can make a valid QR without the secret, even if they guess an id.
import { createHmac, timingSafeEqual } from 'node:crypto';

import QRCode from 'qrcode';

const VERSION = 't1';
const ENTRY_OPENS_MIN = 60; // the door opens one hour before the film

const sign = (id, secret) => createHmac('sha256', secret).update(`${VERSION}.${id}`).digest().subarray(0, 16);

export function ticketCode(ticketId, secret) {
  return `${VERSION}.${ticketId}.${sign(ticketId, secret).toString('base64url')}`;
}

// The ticket id if the code is genuine, otherwise null.
export function readTicketCode(code, secret) {
  const parts = String(code ?? '').trim().split('.');
  if (parts.length !== 3 || parts[0] !== VERSION || !/^[a-z0-9]{10,40}$/i.test(parts[1])) return null;
  const given = Buffer.from(parts[2], 'base64url');
  const expected = sign(parts[1], secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return parts[1];
}

export const qrPng = (code) => QRCode.toBuffer(code, { width: 360, margin: 2, errorCorrectionLevel: 'M' });

// Checks a ticket in. Returns { result, ticket } where result is one of:
// ok, already_used, invalid (unknown or forged code), not_paid, too_early, finished.
export async function checkIn(db, code, secret, now = new Date()) {
  const ticketId = readTicketCode(code, secret);
  if (!ticketId) return { result: 'invalid' };

  const seat = await db.bookingSeat.findUnique({
    where: { id: ticketId },
    include: {
      hallSeat: { select: { row: true, number: true, kind: true } },
      booking: { select: { status: true, user: { select: { name: true } } } },
      showtime: { select: { startsAt: true, hall: { select: { name: true } }, movie: { select: { titleTr: true, titleEn: true, runtimeMin: true } } } },
    },
  });
  if (!seat) return { result: 'invalid' };

  const ticket = {
    seat: `${seat.hallSeat.row}${seat.hallSeat.number}`,
    accessible: seat.hallSeat.kind === 'ACCESSIBLE',
    name: seat.booking.user.name,
    hall: seat.showtime.hall.name,
    startsAt: seat.showtime.startsAt,
    movie: { titleTr: seat.showtime.movie.titleTr, titleEn: seat.showtime.movie.titleEn },
  };
  if (seat.booking.status !== 'PAID') return { result: 'not_paid', ticket };

  const start = seat.showtime.startsAt.getTime();
  if (now.getTime() < start - ENTRY_OPENS_MIN * 60_000) return { result: 'too_early', ticket };
  if (now.getTime() > start + seat.showtime.movie.runtimeMin * 60_000) return { result: 'finished', ticket };

  // Only one scan can change null to a time, even if two doors scan the same QR at once.
  const { count } = await db.bookingSeat.updateMany({ where: { id: ticketId, checkedInAt: null }, data: { checkedInAt: now } });
  if (count === 1) return { result: 'ok', ticket: { ...ticket, checkedInAt: now } };

  const { checkedInAt } = await db.bookingSeat.findUnique({ where: { id: ticketId }, select: { checkedInAt: true } });
  return { result: 'already_used', ticket: { ...ticket, checkedInAt } };
}
