// The programme: pick a day, see each film's shows that day.
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import Poster from '../components/Poster.jsx';
import { api } from '../lib/api.js';
import { dayKey, formatDayNumber, formatPrice, formatTime, formatWeekday } from '../lib/format.js';
import { usePrefs } from '../lib/prefs.jsx';

const DAYS_SHOWN = 7;

function useProgramme() {
  return useQuery({ queryKey: ['movies'], queryFn: () => api('/movies'), staleTime: 60_000 });
}

function DayPicker({ days, selected, onSelect }) {
  const { lang, t } = usePrefs();
  const today = dayKey(new Date());
  return (
    <div role="tablist" aria-label={t('home.days')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      {days.map((day) => {
        const active = day === selected;
        const date = new Date(`${day}T12:00:00Z`);
        return (
          <button
            key={day}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(day)}
            className={`flex min-w-[4.5rem] shrink-0 flex-col items-center rounded-lg border px-3 py-2 ${
              active ? 'border-velvet bg-velvet text-on-velvet' : 'border-line bg-surface text-ink-2 hover:border-ink-3'
            }`}
          >
            <span className="text-[0.7rem] font-bold uppercase tracking-wider">
              {day === today ? t('home.today') : formatWeekday(date, lang)}
            </span>
            <span className="font-display text-lg font-semibold">{formatDayNumber(date, lang)}</span>
          </button>
        );
      })}
    </div>
  );
}

function MovieRow({ movie, shows }) {
  const { lang, t } = usePrefs();
  const title = lang === 'en' ? movie.titleEn : movie.titleTr;
  const summary = lang === 'en' ? movie.summaryEn : movie.summaryTr;
  return (
    <article className="grid grid-cols-[6.5rem_1fr] gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-[10.5rem_1fr] sm:gap-6 sm:p-5">
      <Link to={`/movies/${movie.slug}`} aria-label={`${t('movie.details')}: ${title}`}>
        <Poster movie={movie} />
      </Link>
      <div className="min-w-0">
        <h2 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">
          <Link to={`/movies/${movie.slug}`} className="hover:text-velvet-strong">
            {title}
          </Link>
        </h2>
        <p className="mt-1 text-sm text-ink-3">
          {movie.originalTitle !== title && <span className="italic">{movie.originalTitle} · </span>}
          {movie.year} · {movie.director} · {t('movie.minutes', { n: movie.runtimeMin })}
        </p>
        <p className="mt-3 hidden max-w-2xl text-sm leading-relaxed text-ink-2 sm:block">{summary}</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {shows.map((show) => (
            <li key={show.id}>
              <Link
                to={`/showtimes/${show.id}`}
                aria-label={t('showtime.choose', { time: formatTime(show.startsAt, lang), hall: show.hall.name })}
                className="flex flex-col rounded-lg border border-line bg-surface-2 px-3 py-2 hover:border-velvet"
              >
                <span className="font-display text-xl font-semibold leading-none">{formatTime(show.startsAt, lang)}</span>
                <span className="mt-1 text-[0.7rem] text-ink-3">
                  {show.hall.name} · {formatPrice(show.priceCents, lang)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

export default function Program() {
  const { t } = usePrefs();
  const [params] = useSearchParams();
  const greeting = params.has('welcome') ? t('auth.welcome') : params.has('reset') ? t('auth.reset.done') : null;
  const { data, isPending, error } = useProgramme();

  // Days that have at least one show, in order, at most a week.
  const byDay = useMemo(() => {
    const map = new Map();
    for (const movie of data?.movies ?? []) {
      for (const show of movie.showtimes) {
        const key = dayKey(show.startsAt);
        if (!map.has(key)) map.set(key, new Map());
        const films = map.get(key);
        if (!films.has(movie.slug)) films.set(movie.slug, { movie, shows: [] });
        films.get(movie.slug).shows.push(show);
      }
    }
    return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, DAYS_SHOWN));
  }, [data]);

  const [chosen, setChosen] = useState(null);
  const days = [...byDay.keys()];
  const selected = chosen && byDay.has(chosen) ? chosen : days[0];
  const films = selected
    ? [...byDay.get(selected).values()].sort((a, b) => a.shows[0].startsAt.localeCompare(b.shows[0].startsAt))
    : [];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">{t('home.eyebrow')}</p>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-6xl">{t('home.title')}</h1>
      <p className="mt-4 max-w-2xl text-ink-2">{t('home.lead')}</p>
      {greeting && (
        <p role="status" className="mt-6 max-w-2xl rounded-lg border border-ok/40 px-4 py-3 text-sm text-ok">
          {greeting}
        </p>
      )}

      <div className="mt-8">
        {isPending && <p className="text-ink-3">{t('home.loading')}</p>}
        {error && <p role="alert" className="text-danger">{t(`error.${error.code}`)}</p>}
        {data && (
          <>
            <DayPicker days={days} selected={selected} onSelect={setChosen} />
            <div className="mt-6 grid gap-4" role="tabpanel">
              {films.length === 0 && <p className="text-ink-3">{t('home.empty')}</p>}
              {films.map(({ movie, shows }) => (
                <MovieRow key={movie.slug} movie={movie} shows={shows} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
