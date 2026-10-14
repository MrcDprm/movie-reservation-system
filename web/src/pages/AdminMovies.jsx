// Admin, films tab: the list, and one form for both adding and editing a film. The poster
// preview updates as you type, so a bad colour pair is visible before saving.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Notice } from '../components/Form.jsx';
import Poster from '../components/Poster.jsx';
import { api } from '../lib/api.js';
import { formatDay, formatTime } from '../lib/format.js';
import { usePrefs } from '../lib/prefs.jsx';

const EMPTY = {
  titleTr: '',
  titleEn: '',
  originalTitle: '',
  year: '',
  director: '',
  runtimeMin: '',
  summaryTr: '',
  summaryEn: '',
  posterInk: '#f2e6d0',
  posterPaper: '#1d1a24',
};
const field = 'w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-ink outline-none focus:border-velvet';

function Input({ label, name, value, onChange, ...props }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      {label}
      <input name={name} value={value} onChange={(e) => onChange(name, e.target.value)} className={field} {...props} />
    </label>
  );
}

function Textarea({ label, name, value, onChange }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      {label}
      <textarea name={name} value={value} onChange={(e) => onChange(name, e.target.value)} rows={4} maxLength={1000} required className={field} />
    </label>
  );
}

function Colour({ label, name, value, onChange }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      {label}
      <span className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(name, e.target.value)} className="h-10 w-12 cursor-pointer rounded border border-line bg-bg" aria-label={label} />
        <input value={value} onChange={(e) => onChange(name, e.target.value)} maxLength={7} className={`${field} font-mono`} aria-label={`${label} (hex)`} />
      </span>
    </label>
  );
}

function MovieForm({ initial, onDone }) {
  const { lang, t } = usePrefs();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => ({ ...EMPTY, ...initial }));
  const set = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    if (save.error) save.reset(); // an old error no longer describes what is on screen
  };
  const editing = Boolean(initial?.id);

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, year: Number(form.year), runtimeMin: Number(form.runtimeMin) };
      for (const key of ['id', 'slug', 'upcomingShows']) delete body[key]; // the server would drop them anyway
      return editing
        ? api(`/admin/movies/${initial.id}`, { method: 'PUT', body })
        : api('/admin/movies', { method: 'POST', body });
    },
    onSuccess: () => {
      // The public pages show films too.
      for (const key of [['admin'], ['movies'], ['movie']]) queryClient.invalidateQueries({ queryKey: key });
      onDone(editing ? 'updated' : 'created');
    },
  });

  const errorText = save.error
    ? save.error.code === 'runtime_clash'
      ? t('error.runtime_clash', { when: `${formatDay(save.error.body.startsAt, lang)} ${formatTime(save.error.body.startsAt, lang)}` })
      : t(`error.${save.error.code}`)
    : null;

  return (
    <form
      className="grid gap-6 rounded-xl border border-line bg-surface p-5 sm:p-6 lg:grid-cols-[1fr_14rem]"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid min-w-0 gap-3">
        <h2 className="font-display text-2xl font-semibold">{editing ? t('admin.movies.edit') : t('admin.movies.new')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={t('admin.movies.titleTr')} name="titleTr" value={form.titleTr} onChange={set} required maxLength={120} />
          <Input label={t('admin.movies.titleEn')} name="titleEn" value={form.titleEn} onChange={set} required maxLength={120} />
          <Input label={t('admin.movies.originalTitle')} name="originalTitle" value={form.originalTitle} onChange={set} required maxLength={120} />
          <Input label={t('admin.movies.director')} name="director" value={form.director} onChange={set} required maxLength={80} />
          <Input label={t('admin.movies.year')} name="year" type="number" min="1888" max="2100" value={form.year} onChange={set} required />
          <Input label={t('admin.movies.runtime')} name="runtimeMin" type="number" min="1" max="300" value={form.runtimeMin} onChange={set} required />
        </div>
        <Textarea label={t('admin.movies.summaryTr')} name="summaryTr" value={form.summaryTr} onChange={set} />
        <Textarea label={t('admin.movies.summaryEn')} name="summaryEn" value={form.summaryEn} onChange={set} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Colour label={t('admin.movies.ink')} name="posterInk" value={form.posterInk} onChange={set} />
          <Colour label={t('admin.movies.paper')} name="posterPaper" value={form.posterPaper} onChange={set} />
        </div>
        {errorText && <Notice>{errorText}</Notice>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={save.isPending} className="rounded-lg bg-velvet px-5 py-3 font-semibold text-on-velvet hover:bg-velvet-strong disabled:opacity-60">
            {editing ? t('admin.movies.save') : t('admin.movies.add')}
          </button>
          <button type="button" onClick={() => onDone(null)} className="rounded-lg border border-line px-5 py-3 font-semibold text-ink-2 hover:border-ink-3">
            {t('admin.movies.cancel')}
          </button>
        </div>
      </div>
      {/* Live preview with the same component the programme uses. */}
      <div className="order-first w-40 lg:order-none lg:w-full">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-ink-3">{t('admin.movies.preview')}</p>
        <Poster
          movie={{
            ...form,
            titleTr: form.titleTr || t('admin.movies.titleTr'),
            titleEn: form.titleEn || t('admin.movies.titleEn'),
            runtimeMin: form.runtimeMin || '–',
            posterInk: /^#[0-9a-f]{6}$/i.test(form.posterInk) ? form.posterInk : EMPTY.posterInk,
            posterPaper: /^#[0-9a-f]{6}$/i.test(form.posterPaper) ? form.posterPaper : EMPTY.posterPaper,
          }}
        />
      </div>
    </form>
  );
}

export default function AdminMovies() {
  const { lang, t } = usePrefs();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null); // null: list only, {}: new film, a film: edit it
  const [done, setDone] = useState(null);
  const movies = useQuery({ queryKey: ['admin', 'movies'], queryFn: () => api('/admin/movies') });
  const remove = useMutation({
    mutationFn: (id) => api(`/admin/movies/${id}`, { method: 'DELETE' }),
    onSuccess: () => setDone('deleted'),
    onSettled: () => {
      for (const key of [['admin'], ['movies'], ['movie']]) queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const plain = (movie) => (lang === 'en' ? movie.titleEn : movie.titleTr.replace(/\u00ad/g, ''));
  const open = (movie) => {
    setDone(null);
    remove.reset();
    setEditing(movie);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="grid gap-6">
      {editing ? (
        <MovieForm
          key={editing.id ?? 'new'}
          initial={editing}
          onDone={(result) => {
            setEditing(null);
            setDone(result);
          }}
        />
      ) : (
        <button type="button" onClick={() => open({})} className="justify-self-start rounded-lg bg-velvet px-5 py-3 font-semibold text-on-velvet hover:bg-velvet-strong">
          + {t('admin.movies.new')}
        </button>
      )}
      {done && <Notice kind="ok">{t(`admin.movies.${done}`)}</Notice>}
      {remove.error && <Notice>{t(`error.${remove.error.code}`)}</Notice>}
      {movies.error && <Notice>{t(`error.${movies.error.code}`)}</Notice>}

      <ul className="grid gap-3 sm:grid-cols-2">
        {(movies.data?.movies ?? []).map((movie) => (
          <li key={movie.id} className="flex gap-4 rounded-xl border border-line bg-surface p-3">
            <div className="w-20 shrink-0">
              <Poster movie={movie} size="sm" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <Link to={`/movies/${movie.slug}`} className="font-display text-lg font-semibold leading-tight hover:underline">
                {plain(movie)}
              </Link>
              <p className="text-xs text-ink-3">
                {movie.director} · {movie.year} · {t('movie.minutes', { n: movie.runtimeMin })}
              </p>
              <p className="mt-1 text-xs text-ink-2">{t('admin.movies.upcoming', { n: movie.upcomingShows })}</p>
              <div className="mt-auto flex gap-2 pt-3">
                <button type="button" onClick={() => open(movie)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-2 hover:border-ink-3 hover:text-ink">
                  {t('admin.movies.editShort')}
                </button>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => {
                    setDone(null);
                    if (window.confirm(t(movie.upcomingShows ? 'admin.movies.confirmDelete' : 'admin.movies.confirmDeleteEmpty', { title: plain(movie), n: movie.upcomingShows }))) remove.mutate(movie.id);
                  }}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-2 hover:border-danger hover:text-danger"
                >
                  {t('admin.delete')}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
