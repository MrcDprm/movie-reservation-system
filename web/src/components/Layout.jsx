import { Link, NavLink, Outlet } from 'react-router-dom';

import { usePrefs } from '../lib/prefs.jsx';

// Every live project links to the others; the current one is highlighted.
const PROJECTS = [
  ['Seans', 'https://seans.miracdeprem.com'],
  ['KVKK Assistant', 'https://kvkk.miracdeprem.com'],
  ['Crypto Toolkit', 'https://crypto.miracdeprem.com'],
  ['Sahaf', 'https://sahaf.miracdeprem.com'],
  ['Tic-Tac-Toe', 'https://tictactoe.miracdeprem.com'],
  ['Hangman', 'https://hangman.miracdeprem.com'],
  ['Quiz App', 'https://quiz.miracdeprem.com'],
  ['Weather App', 'https://weather.miracdeprem.com'],
];

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 text-ink no-underline">
      <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden="true">
        <rect width="64" height="64" rx="14" className="fill-surface-2" />
        <path d="M14 22h36v8a4 4 0 0 0 0 8v8H14v-8a4 4 0 0 0 0-8z" className="fill-velvet" />
        <path d="M38 24v4M38 32v4M38 40v2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className="font-display text-2xl font-semibold tracking-tight">Seans</span>
    </Link>
  );
}

function HeaderControls() {
  const { lang, setLang, toggleTheme, t } = usePrefs();
  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-full border border-line p-0.5" role="group" aria-label={t('nav.language')}>
        {['tr', 'en'].map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={lang === code}
            className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${
              lang === code ? 'bg-ink text-bg' : 'text-ink-3 hover:text-ink'
            }`}
          >
            {code}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={t('nav.theme')}
        title={t('nav.theme')}
        className="grid h-9 w-9 place-items-center rounded-full border border-line text-ink-2 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

export default function Layout() {
  const { t } = usePrefs();
  const navClass = ({ isActive }) =>
    `text-sm font-semibold ${isActive ? 'text-ink' : 'text-ink-3 hover:text-ink'}`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden gap-6 sm:flex">
              <NavLink to="/" end className={navClass}>
                {t('nav.program')}
              </NavLink>
            </nav>
          </div>
          <HeaderControls />
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-16 border-t border-line">
        <div className="mx-auto grid max-w-6xl justify-items-center gap-3 px-4 py-8 text-center sm:px-6">
          <p className="max-w-xl text-sm text-ink-3">{t('footer.note')}</p>
          <nav aria-label={t('footer.projects')} className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 font-mono text-xs">
            {PROJECTS.map(([name, url]) =>
              name === 'Seans' ? (
                <span key={name} aria-current="page" className="font-bold text-ink">
                  {name}
                </span>
              ) : (
                <a key={name} href={url} className="text-ink-2 hover:text-velvet-strong hover:underline">
                  {name}
                </a>
              ),
            )}
          </nav>
          <div className="flex flex-wrap justify-center gap-x-5 font-mono text-xs text-ink-3">
            <span>© 2026 Miraç Deprem</span>
            <a href="https://www.miracdeprem.com" className="text-ink-2 hover:underline">
              {t('footer.portfolio')}
            </a>
            <a href="https://github.com/MrcDprm/movie-reservation-system" className="text-ink-2 hover:underline">
              {t('footer.source')}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
