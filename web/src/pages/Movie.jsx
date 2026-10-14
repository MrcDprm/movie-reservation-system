// One film: big poster, details and every upcoming show, grouped by day.
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import Poster from '../components/Poster.jsx';
import { api } from '../lib/api.js';
import { dayKey, formatDay, formatPrice, formatTime } from '../lib/format.js';
import { usePrefs } from '../lib/prefs.jsx';
import NotFound from './NotFound.jsx';

export default function Movie() {
  const { slug } = useParams();
  const { lang, t } = usePrefs();
  const { data, isPending, error } = useQuery({ queryKey: ['movie', slug], queryFn: () => api(`/movies/${slug}`) });

  if (error?.status === 404) return <NotFound />;
  if (isPending || error) {
    return <p className="mx-auto max-w-6xl px-4 py-16 text-ink-3 sm:px-6">{error ? t(`error.${error.code}`) : t('home.loading')}</p>;
  }

  const { movie } = data;
  const title = lang === 'en' ? movie.titleEn : movie.titleTr;
  const days = new Map();
  for (const show of movie.showtimes) {
    const key = dayKey(show.startsAt);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(show);
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-10 sm:grid-cols-[16rem_1fr] sm:gap-12 sm:px-6 sm:pt-14">
      <div className="mx-auto w-48 sm:w-full">
        <Poster movie={movie} size="lg" />
      </div>
      <div className="min-w-0">
        <Link to="/" className="text-sm font-semibold text-ink-3 hover:text-ink">
          ← {t('nav.program')}
        </Link>
        <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-2 text-ink-3">
          {movie.originalTitle !== title && <span className="italic">{movie.originalTitle} · </span>}
          {movie.year} · {t('movie.minutes', { n: movie.runtimeMin })}
        </p>
        <p className="mt-1 text-sm text-ink-2">
          {t('movie.director')}: {movie.director}
        </p>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2">{lang === 'en' ? movie.summaryEn : movie.summaryTr}</p>

        <h2 className="mt-10 font-display text-2xl font-semibold">{t('movie.shows')}</h2>
        {days.size === 0 && <p className="mt-3 text-ink-3">{t('movie.noShows')}</p>}
        <div className="mt-4 grid gap-5">
          {[...days.entries()].map(([key, shows]) => (
            <section key={key}>
              <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{formatDay(shows[0].startsAt, lang)}</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {shows.map((show) => (
                  <li key={show.id}>
                    <Link
                      to={`/showtimes/${show.id}`}
                      aria-label={t('showtime.choose', { time: formatTime(show.startsAt, lang), hall: show.hall.name })}
                      className="flex flex-col rounded-lg border border-line bg-surface px-3 py-2 hover:border-velvet"
                    >
                      <span className="font-display text-xl font-semibold leading-none">{formatTime(show.startsAt, lang)}</span>
                      <span className="mt-1 text-[0.7rem] text-ink-3">
                        {show.hall.name} · {formatPrice(show.priceCents, lang)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
