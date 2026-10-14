// Dates and money, always in Istanbul time and Turkish lira, whatever the visitor's computer says.
const TZ = 'Europe/Istanbul';
const locale = (lang) => (lang === 'en' ? 'en-GB' : 'tr-TR');

export const formatTime = (date, lang) =>
  new Intl.DateTimeFormat(locale(lang), { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(date));

export const formatDay = (date, lang) =>
  new Intl.DateTimeFormat(locale(lang), { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(date));

export const formatWeekday = (date, lang) =>
  new Intl.DateTimeFormat(locale(lang), { timeZone: TZ, weekday: 'short' }).format(new Date(date));

export const formatDayNumber = (date, lang) =>
  new Intl.DateTimeFormat(locale(lang), { timeZone: TZ, day: 'numeric', month: 'short' }).format(new Date(date));

export const formatPrice = (cents, lang) =>
  new Intl.NumberFormat(locale(lang), { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(cents / 100);

// "%45" in Turkish, "45%" in English.
export const formatPercent = (share, lang) => new Intl.NumberFormat(locale(lang), { style: 'percent' }).format(share);

// "2026-10-14" for a date in Istanbul, used to group showtimes by day.
export const dayKey = (date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
