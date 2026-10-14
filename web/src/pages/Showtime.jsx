// Choosing seats for one show: the live map, the hold with its countdown, and the way to Stripe.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import SeatMap, { SeatLegend } from '../components/SeatMap.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatDay, formatPrice, formatTime } from '../lib/format.js';
import { usePrefs } from '../lib/prefs.jsx';
import NotFound from './NotFound.jsx';

const REFRESH_MS = 4000;

function useCountdown(until) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  if (!until) return null;
  const left = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  return { left, text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` };
}

const seatLabel = (seat) => `${seat.row}${seat.number}`;

export default function Showtime() {
  const { id } = useParams();
  const { lang, t } = usePrefs();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(() => new Set());
  const [message, setMessage] = useState(null);

  // The map refreshes every few seconds while the tab is visible, so taken seats appear on their own.
  const { data, isPending, error } = useQuery({
    queryKey: ['seats', id],
    queryFn: () => api(`/showtimes/${id}/seats`),
    refetchInterval: REFRESH_MS,
  });

  // A seat someone else took since I clicked it is dropped from my selection.
  useEffect(() => {
    if (!data || selected.size === 0) return;
    const free = new Set(data.seats.filter((s) => s.status === 'free').map((s) => s.id));
    const still = [...selected].filter((seatId) => free.has(seatId));
    if (still.length < selected.size) {
      setSelected(new Set(still));
      setMessage({ kind: 'warn', text: t('seats.lostSeat') });
    }
  }, [data, selected, t]);

  const hold = data?.myHold ?? null;
  const countdown = useCountdown(hold?.expiresAt);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['seats', id] });

  const holdMutation = useMutation({
    mutationFn: (seatIds) => api(`/showtimes/${id}/hold`, { method: 'POST', body: { seatIds } }),
    onSuccess: () => {
      setSelected(new Set());
      setMessage(null);
      refresh();
    },
    onError: (err) => {
      setMessage({ kind: 'error', text: t(`error.${err.code}`) });
      refresh();
    },
  });
  const releaseMutation = useMutation({
    mutationFn: () => api(`/holds/${hold.bookingId}`, { method: 'DELETE' }),
    onSettled: refresh,
  });
  const checkoutMutation = useMutation({
    mutationFn: () => api(`/holds/${hold.bookingId}/checkout`, { method: 'POST', body: { lang } }),
    onSuccess: ({ url }) => {
      // Only ever leave the site for Stripe's own checkout page.
      if (new URL(url).origin === 'https://checkout.stripe.com') window.location.assign(url);
      else setMessage({ kind: 'error', text: t('error.internal_error') });
    },
    onError: (err) => {
      setMessage({ kind: 'error', text: t(`error.${err.code}`) });
      refresh();
    },
  });

  const seatsById = useMemo(() => new Map((data?.seats ?? []).map((s) => [s.id, s])), [data]);

  if (error?.status === 404) return <NotFound />;
  if (isPending || error) {
    return <p className="mx-auto max-w-6xl px-4 py-16 text-ink-3 sm:px-6">{error ? t(`error.${error.code}`) : t('home.loading')}</p>;
  }

  const { movie, showtime, hall, maxSeats } = data;
  const title = lang === 'en' ? movie.titleEn : movie.titleTr;
  const salesOpen = showtime.salesOpen;
  const holdSeats = hold ? hold.seatIds.map((seatId) => seatsById.get(seatId)).filter(Boolean) : [];

  const toggle = (seat) => {
    if (!selected.has(seat.id) && selected.size >= maxSeats) {
      setMessage({ kind: 'warn', text: t('seats.max', { n: maxSeats }) });
      return;
    }
    setMessage(null);
    const next = new Set(selected);
    if (next.has(seat.id)) next.delete(seat.id);
    else next.add(seat.id);
    setSelected(next);
  };

  const startHold = () => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    holdMutation.mutate([...selected]);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">
      <Link to={`/movies/${movie.slug}`} className="text-sm font-semibold text-ink-3 hover:text-ink">
        ← {title}
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-1 text-ink-2">
        {formatDay(showtime.startsAt, lang)} · {formatTime(showtime.startsAt, lang)} · {hall.name} ·{' '}
        {t('seats.pricePerSeat', { price: formatPrice(showtime.priceCents, lang) })}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        {/* min-w-0: a grid item is never narrower than its content by default, so without it the
            wide hall would stretch the whole page instead of scrolling inside its own box. */}
        <section className="min-w-0 rounded-xl border border-line bg-surface p-3 sm:p-6">
          <SeatMap seats={data.seats} selected={selected} onToggle={toggle} disabled={!salesOpen || Boolean(hold)} />
          <div className="mt-6 border-t border-line pt-4">
            <SeatLegend />
          </div>
        </section>

        <aside className="h-max rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-6" aria-live="polite">
          {!salesOpen && <p className="text-ink-2">{t('seats.salesClosed')}</p>}

          {salesOpen && hold && (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{t('seats.heldTitle')}</p>
              <p className="mt-2 font-display text-2xl font-semibold">{holdSeats.map(seatLabel).join(', ')}</p>
              <p className="mt-1 text-sm text-ink-2">
                {t('seats.total', { price: formatPrice(showtime.priceCents * holdSeats.length, lang) })}
              </p>
              {countdown && (
                <p className={`mt-4 font-mono text-3xl ${countdown.left < 60 ? 'text-danger' : 'text-ink'}`}>{countdown.text}</p>
              )}
              <p className="text-xs text-ink-3">{t('seats.heldHint')}</p>
              <button
                type="button"
                onClick={() => checkoutMutation.mutate()}
                disabled={checkoutMutation.isPending || countdown?.left === 0}
                className="mt-5 w-full rounded-lg bg-velvet px-4 py-3 font-semibold text-on-velvet hover:bg-velvet-strong disabled:opacity-60"
              >
                {checkoutMutation.isPending ? t('seats.redirecting') : t('seats.pay')}
              </button>
              <button
                type="button"
                onClick={() => releaseMutation.mutate()}
                disabled={releaseMutation.isPending}
                className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-ink-2 hover:border-ink-3"
              >
                {t('seats.release')}
              </button>
              <p className="mt-4 text-xs text-ink-3">{t('seats.testCard')}</p>
            </>
          )}

          {salesOpen && !hold && (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{t('seats.yourChoice')}</p>
              {selected.size === 0 ? (
                <p className="mt-2 text-ink-2">{t('seats.pickHint', { n: maxSeats })}</p>
              ) : (
                <>
                  <p className="mt-2 font-display text-2xl font-semibold">
                    {[...selected].map((seatId) => seatLabel(seatsById.get(seatId))).sort().join(', ')}
                  </p>
                  <p className="mt-1 text-sm text-ink-2">
                    {t('seats.total', { price: formatPrice(showtime.priceCents * selected.size, lang) })}
                  </p>
                </>
              )}
              <button
                type="button"
                onClick={startHold}
                disabled={selected.size === 0 || holdMutation.isPending}
                className="mt-5 w-full rounded-lg bg-velvet px-4 py-3 font-semibold text-on-velvet hover:bg-velvet-strong disabled:opacity-50"
              >
                {user ? t('seats.hold', { n: selected.size || '' }) : t('seats.loginToHold')}
              </button>
              {user && !user.emailVerified && <p className="mt-3 text-xs text-warn">{t('error.email_not_verified')}</p>}
            </>
          )}

          {message && (
            <p role="alert" className={`mt-4 text-sm ${message.kind === 'error' ? 'text-danger' : 'text-warn'}`}>
              {message.text}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
