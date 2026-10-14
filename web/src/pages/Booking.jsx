// One booking: after Stripe sends the buyer back here (?paid=1) we wait for the webhook to
// confirm the payment, then show one QR ticket per seat.
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';

import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatDay, formatPrice, formatTime } from '../lib/format.js';
import { usePrefs } from '../lib/prefs.jsx';
import NotFound from './NotFound.jsx';

const POLL_MS = 2000;
const WAIT_MS = 60 * 1000; // after a minute we stop asking and say the e-mail will follow

// The code is drawn in the browser; only the signed text comes from the server.
function QrImage({ code, label }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(code, { margin: 1, width: 480, errorCorrectionLevel: 'M' }).then((url) => alive && setSrc(url));
    return () => {
      alive = false;
    };
  }, [code]);
  // Always dark on white, whatever the theme: door scanners read that best.
  return (
    <div className="aspect-square w-full max-w-[15rem] rounded-lg bg-white p-2">
      {src && <img src={src} alt={label} className="h-full w-full [image-rendering:pixelated]" />}
    </div>
  );
}

function Ticket({ seat, index, count, title, showtime }) {
  const { lang, t } = usePrefs();
  return (
    <li className="grid justify-items-center gap-4 rounded-xl border border-line bg-surface p-5 text-center">
      <p className="font-mono text-xs text-ink-3">{t('booking.ticketOf', { i: index + 1, n: count })}</p>
      <QrImage code={seat.code} label={t('booking.qrLabel', { seat: seat.label })} />
      {/* The same code as text, for the door to type in if a screen will not scan. */}
      <p className="max-w-[15rem] break-all font-mono text-[0.6rem] leading-snug text-ink-3">{seat.code}</p>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-3">{t('booking.seat')}</p>
        <p className="font-display text-4xl font-semibold">{seat.label}</p>
      </div>
      <p className="text-sm text-ink-2">
        {title} · {formatTime(showtime.startsAt, lang)} · {showtime.hall.name}
      </p>
      {seat.checkedIn && (
        <p className="rounded-full border border-ok/40 px-3 py-1 text-xs font-semibold text-ok">{t('booking.used')}</p>
      )}
    </li>
  );
}

export default function Booking() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { lang, t } = usePrefs();
  const { user, loading } = useAuth();
  const returning = params.has('paid'); // came back from Stripe
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (!returning) return undefined;
    const timer = setTimeout(() => setGaveUp(true), WAIT_MS);
    return () => clearTimeout(timer);
  }, [returning]);

  const { data, error } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api(`/bookings/${id}`),
    enabled: Boolean(user),
    // Keep asking while the payment is being confirmed, but not forever.
    refetchInterval: (query) => (returning && !gaveUp && query.state.data?.booking.status === 'HOLD' ? POLL_MS : false),
  });

  if (!loading && !user) return <Navigate to={`/login?next=${encodeURIComponent(`/bookings/${id}`)}`} replace />;
  if (error?.status === 404) return <NotFound />;

  const page = (children) => (
    <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 sm:pt-12">
      <Link to="/tickets" className="text-sm font-semibold text-ink-3 hover:text-ink">
        ← {t('nav.tickets')}
      </Link>
      {children}
    </div>
  );

  if (error) return page(<p className="mt-8 text-danger">{t(`error.${error.code}`)}</p>);
  if (!data) return page(<p className="mt-8 text-ink-3">{t('tickets.loading')}</p>);

  const { booking } = data;
  const { showtime } = booking;
  const title = lang === 'en' ? showtime.movie.titleEn : showtime.movie.titleTr;
  const header = (
    <>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-1 text-ink-2">
        {formatDay(showtime.startsAt, lang)} · {formatTime(showtime.startsAt, lang)} · {showtime.hall.name}
      </p>
    </>
  );

  if (booking.status === 'PAID') {
    return page(
      <>
        {header}
        {returning && (
          <p role="status" className="mt-6 rounded-lg border border-ok/40 px-4 py-3 text-sm text-ok">
            {t('booking.paid')}
          </p>
        )}
        <p className="mt-6 text-sm text-ink-2">{t('booking.atDoor')}</p>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {booking.seats.map((seat, i) => (
            <Ticket key={seat.id} seat={seat} index={i} count={booking.seats.length} title={title} showtime={showtime} />
          ))}
        </ul>
        <p className="mt-6 font-mono text-xs text-ink-3">
          {t('booking.total', { price: formatPrice(booking.totalCents, lang) })} · {t('booking.ref')}: {booking.id}
        </p>
      </>,
    );
  }

  // Not paid (yet). Coming back from Stripe means the webhook is probably on its way.
  const waiting = booking.status === 'HOLD' && returning;
  return page(
    <>
      {header}
      <div className="mt-8 rounded-xl border border-line bg-surface p-6" aria-live="polite">
        {waiting && !gaveUp && (
          <p className="flex items-center gap-3 text-ink-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold border-t-transparent" aria-hidden="true" />
            {t('booking.confirming')}
          </p>
        )}
        {waiting && gaveUp && <p className="text-ink-2">{t('booking.slow')}</p>}
        {booking.status === 'HOLD' && !returning && <p className="text-ink-2">{t('booking.notPaid')}</p>}
        {(booking.status === 'EXPIRED' || booking.status === 'CANCELLED') && (
          <p className="text-ink-2">{t(`booking.${booking.status.toLowerCase()}`)}</p>
        )}
        {(!waiting || gaveUp) && (
          <Link
            to={`/showtimes/${showtime.id}`}
            className="mt-5 inline-block rounded-lg bg-velvet px-5 py-2.5 font-semibold text-on-velvet hover:bg-velvet-strong"
          >
            {t('booking.toShow')}
          </Link>
        )}
      </div>
    </>,
  );
}
