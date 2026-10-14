import { Link } from 'react-router-dom';

import { usePrefs } from '../lib/prefs.jsx';

export default function NotFound() {
  const { t } = usePrefs();
  return (
    <div className="mx-auto grid max-w-6xl justify-items-start gap-6 px-4 py-24 sm:px-6">
      <p className="font-display text-7xl font-semibold text-velvet">404</p>
      <h1 className="font-display text-3xl font-semibold">{t('notfound.title')}</h1>
      <Link to="/" className="rounded-lg bg-velvet px-5 py-3 font-semibold text-on-velvet hover:bg-velvet-strong">
        {t('notfound.back')}
      </Link>
    </div>
  );
}
