// Language and theme: remembered in localStorage (a per-visitor convenience), applied to <html>.
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { dictionaries } from './i18n.js';

const PrefsContext = createContext(null);

const read = (key, allowed, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: the choice lasts until the page is closed
  }
};

const initialLang = () => read('seans-lang', ['tr', 'en'], navigator.language?.startsWith('tr') ? 'tr' : 'en');
const initialTheme = () =>
  read('seans-theme', ['dark', 'light'], matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

export function PrefsProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);
  const [theme, setThemeState] = useState(initialTheme);

  document.documentElement.lang = lang;
  document.documentElement.dataset.theme = theme;

  const setLang = useCallback((value) => {
    write('seans-lang', value);
    setLangState(value);
  }, []);
  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      write('seans-theme', next);
      return next;
    });
  }, []);

  // t('key', { n: 2 }) -> text with {n} replaced; a missing key shows itself, so it is easy to spot.
  const t = useCallback(
    (key, values) => {
      let text = dictionaries[lang][key] ?? dictionaries.tr[key] ?? key;
      if (values) for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, value);
      return text;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, theme, toggleTheme, t }), [lang, setLang, theme, toggleTheme, t]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  return useContext(PrefsContext);
}
