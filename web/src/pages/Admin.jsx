// Admin: a week of showtimes with sales, a form to add a show, and delete for unsold ones.
// The server checks the role, the hall clash and the input; this page only shows the answers.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { Notice } from '../components/Form.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { dayKey, formatDay, formatPercent, formatPrice, formatTime } from '../lib/format.js';
import { usePrefs } from '../lib/prefs.jsx';

const DAYS = 7;
const addDays = (day, n) => dayKey(new Date(new Date(`${day}T12:00:00+03:00`).getTime() + n * 24 * 60 * 60 * 1000));

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-3">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold">{value}</p>
    </div>
  );
}

function ShowRow({ show, onDelete, deleting }) {
  const { lang, t } = usePrefs();
  const share = show.capacity ? show.sold / show.capacity : 0;
  return (
    <li className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 border-t border-line py-3 first:border-t-0">
      <span className="font-mono text-sm">{formatTime(show.startsAt, lang)}</span>
      <span className="min-w-0">
        <span className="block truncate font-semibold">{lang === 'en' ? show.movie.titleEn : show.movie.titleTr}</span>
        <span className="block text-xs text-ink-3">
          {show.hall} · {formatPrice(show.priceCents, lang)}
        </span>
        {/* Occupancy bar */}
        <span className="mt-1.5 flex items-center gap-2 text-xs text-ink-2">
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-3/20" aria-hidden="true">
            <span className="block h-full rounded-full bg-velvet" style={{ width: `${Math.round(share * 100)}%` }} />
          </span>
          {t('admin.soldOf', { sold: show.sold, capacity: show.capacity })} · {formatPrice(show.revenueCents, lang)}
        </span>
      </span>
      <button
        type="button"
        onClick={() => onDelete(show)}
        disabled={show.hasBookings || deleting}
        title={show.hasBookings ? t('error.has_bookings') : undefined}
        className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-2 hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-2"
      >
        {t('admin.delete')}
      </button>
    </li>
  );
}

function NewShowtime({ options, from, onCreated }) {
  const { lang, t } = usePrefs();
  const [done, setDone] = useState(false);
  const create = useMutation({
    mutationFn: (form) =>
      api('/admin/showtimes', {
        method: 'POST',
        body: {
          movieId: form.movieId,
          hallId: form.hallId,
          startsAt: `${form.date}T${form.time}:00+03:00`, // picked in Istanbul time
          priceCents: Math.round(Number(form.price) * 100),
        },
      }),
    onSuccess: (_, form) => {
      setDone(true);
      onCreated(form.date);
    },
    onMutate: () => setDone(false),
  });

  const field = 'rounded-lg border border-line bg-bg px-3 py-2.5 text-ink outline-none focus:border-velvet';
  return (
    <form
      className="grid gap-3 rounded-xl border border-line bg-surface p-5"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(Object.fromEntries(new FormData(e.currentTarget)));
      }}
    >
      <h2 className="font-display text-2xl font-semibold">{t('admin.new')}</h2>
      <label className="grid gap-1.5 text-sm font-semibold">
        {t('admin.movie')}
        <select name="movieId" required className={field}>
          {options.movies.map((m) => (
            <option key={m.id} value={m.id}>
              {lang === 'en' ? m.titleEn : m.titleTr.replace(/­/g, '')} ({t('movie.minutes', { n: m.runtimeMin })})
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-semibold">
        {t('admin.hall')}
        <select name="hallId" required className={field}>
          {options.halls.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name} ({t('admin.seatsN', { n: h.capacity })})
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5 text-sm font-semibold">
          {t('admin.date')}
          <input type="date" name="date" required defaultValue={addDays(from, 1)} className={field} />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          {t('admin.time')}
          <input type="time" name="time" required defaultValue="20:00" step="300" className={field} />
        </label>
      </div>
      <label className="grid gap-1.5 text-sm font-semibold">
        {t('admin.price')}
        <input type="number" name="price" required min="10" max="1000" step="5" defaultValue="160" className={field} />
      </label>
      <p className="text-xs text-ink-3">{t('admin.rules')}</p>
      {create.error && <Notice>{t(`error.${create.error.code}`)}</Notice>}
      {done && <Notice kind="ok">{t('admin.created')}</Notice>}
      <button
        type="submit"
        disabled={create.isPending}
        className="rounded-lg bg-velvet px-4 py-3 font-semibold text-on-velvet hover:bg-velvet-strong disabled:opacity-60"
      >
        {t('admin.add')}
      </button>
    </form>
  );
}

export default function Admin() {
  const { lang, t } = usePrefs();
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(() => dayKey(new Date()));
  const isAdmin = user?.role === 'ADMIN';

  const options = useQuery({ queryKey: ['admin', 'options'], queryFn: () => api('/admin/options'), enabled: isAdmin });
  const list = useQuery({
    queryKey: ['admin', 'showtimes', from],
    queryFn: () => api(`/admin/showtimes?from=${from}&days=${DAYS}`),
    enabled: isAdmin,
  });
  const remove = useMutation({
    mutationFn: (id) => api(`/admin/showtimes/${id}`, { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'showtimes'] }),
  });

  if (!loading && !user) return <Navigate to="/login?next=%2Fadmin" replace />;
  if (loading) return null;
  if (!isAdmin) return <p className="mx-auto max-w-xl px-4 py-16 text-center text-ink-2">{t('admin.only')}</p>;

  const shows = list.data?.showtimes ?? [];
  const sold = shows.reduce((n, s) => n + s.sold, 0);
  const seats = shows.reduce((n, s) => n + s.capacity, 0);
  const revenue = shows.reduce((n, s) => n + s.revenueCents, 0);
  const byDay = new Map();
  for (const show of shows) byDay.set(dayKey(show.startsAt), [...(byDay.get(dayKey(show.startsAt)) ?? []), show]);

  const onDelete = (show) => {
    const title = lang === 'en' ? show.movie.titleEn : show.movie.titleTr.replace(/­/g, '');
    if (window.confirm(t('admin.confirmDelete', { title, time: `${formatDay(show.startsAt, lang)} ${formatTime(show.startsAt, lang)}` }))) {
      remove.mutate(show.id);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">
      <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{t('admin.title')}</h1>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setFrom(addDays(from, -DAYS))} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold">
          ← {t('admin.prevWeek')}
        </button>
        <input
          type="date"
          value={from}
          onChange={(e) => e.target.value && setFrom(e.target.value)}
          aria-label={t('admin.from')}
          className="rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink"
        />
        <button type="button" onClick={() => setFrom(addDays(from, DAYS))} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold">
          {t('admin.nextWeek')} →
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('admin.shows')} value={shows.length} />
        <Stat label={t('admin.ticketsSold')} value={sold} />
        <Stat label={t('admin.occupancy')} value={seats ? formatPercent(sold / seats, lang) : '–'} />
        <Stat label={t('admin.revenue')} value={formatPrice(revenue, lang)} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section className="min-w-0">
          {list.isPending && <p className="text-ink-3">{t('home.loading')}</p>}
          {list.error && <Notice>{t(`error.${list.error.code}`)}</Notice>}
          {remove.error && <Notice>{t(`error.${remove.error.code}`)}</Notice>}
          {list.data && shows.length === 0 && <p className="text-ink-2">{t('admin.none')}</p>}
          {[...byDay].map(([day, dayShows]) => (
            <div key={day} className="mb-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{formatDay(dayShows[0].startsAt, lang)}</h2>
              <ul className="mt-2 rounded-xl border border-line bg-surface px-4">
                {dayShows.map((show) => (
                  <ShowRow key={show.id} show={show} onDelete={onDelete} deleting={remove.isPending} />
                ))}
              </ul>
            </div>
          ))}
        </section>
        <aside className="h-max lg:sticky lg:top-6">
          {options.data && (
            <NewShowtime
              options={options.data}
              from={from}
              onCreated={() => queryClient.invalidateQueries({ queryKey: ['admin', 'showtimes'] })}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
