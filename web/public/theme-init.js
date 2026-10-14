// Runs before the page is drawn, so a saved light theme does not flash dark first.
// A separate file because the Content-Security-Policy allows no inline scripts.
try {
  const theme = localStorage.getItem('seans-theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  const lang = localStorage.getItem('seans-lang');
  if (lang === 'en' || lang === 'tr') document.documentElement.lang = lang;
} catch {
  // storage blocked: defaults are used
}
