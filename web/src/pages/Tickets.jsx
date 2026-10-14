// "My tickets": every paid booking, upcoming shows first, past ones below.
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';

import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatDay, formatTime } from '../lib/format.js';
import { usePrefs } from '../lib/prefs.jsx';

function BookingCard({ booking, past }) {
  const { lang, t } = usePrefs();
  const { showtime, seats } = booking;
  const title = lang === 'en' ? showtime.movie.titleEn : showtime.movie.titleTr;
  return (
    <li>
      <Link
        to={`/bookings/${booking.id}`}
        className={`flex overflow-hidden rounded-xl border border-line bg-surface hover:border-ink-3 ${past ? 'opacity-70' : ''}`}
      >
        {/* The film's poster colours as a ticket stub. */}
        <span className="w-3 shrink-0 sm:w-4" style={{ background: showtime.movie.posterPaper }} aria-hidden="true" />
        <span className="grid flex-1 gap-1 p-4 sm:p-5">
          <span className="font-display text-xl font-semibold leading-tight">{title}</span>
          <span className="text-sm text-ink-2">
            {formatDay(showtime.startsAt, lang)} · {formatTime(showtime.startsAt, lang)} · {showtime.hall.name}
          </span>
          <span className="font-mono text-xs text-ink-3">
            {t('tickets.seats')}: {seats.map((s) => s.label).join(', ')}
          </span>
        </span>
        <span className="self-center pr-4 text-sm font-semibold text-velvet-strong">{t('tickets.open')} →</span>
      </Link>
    </li>
  );
}

export default function Tickets() {
  const { t } = usePrefs();
  const { user, loading } = useAuth();
  const { data, isPending, error } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => api('/bookings'),
    enabled: Boolean(user),
  });

  if (!loading && !user) return <Navigate to="/login?next=%2Ftickets" replace />;

  const now = Date.now();
  const bookings = data?.bookings ?? [];
  // A show stays "upcoming" until the film ends, so tickets are easy to find at the door.
  const endOf = (b) => new Date(b.showtime.startsAt).getTime() + b.showtime.movie.runtimeMin * 60 * 1000;
  const upcoming = bookings.filter((b) => endOf(b) > now).reverse(); // soonest first
  const past = bookings.filter((b) => endOf(b) <= now);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6 sm:pt-14">
      <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{t('nav.tickets')}</h1>

      {(loading || isPending) && !error && <p className="mt-8 text-ink-3">{t('tickets.loading')}</p>}
      {error && <p className="mt-8 text-danger">{t(`error.${error.code}`)}</p>}

      {data && bookings.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-line p-8 text-center">
          <p className="text-ink-2">{t('tickets.empty')}</p>
          <Link to="/" className="mt-4 inline-block rounded-lg bg-velvet px-5 py-2.5 font-semibold text-on-velvet hover:bg-velvet-strong">
            {t('tickets.browse')}
          </Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{t('tickets.upcoming')}</h2>
          <ul className="mt-3 grid gap-3">
            {upcoming.map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-ink-3">{t('tickets.past')}</h2>
          <ul className="mt-3 grid gap-3">
            {past.map((b) => (
              <BookingCard key={b.id} booking={b} past />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
