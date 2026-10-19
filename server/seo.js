// Search engines: the programme and every film page are sent with their own title,
// description, language alternates and structured data. The rest of the app stays a
// static single-page app whose index.html carries "noindex" (accounts, tickets, admin).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Router } from 'express';

import { getMovie, listMovies } from './booking/service.js';

export const SITE_URL = 'https://seans.miracdeprem.com';

// Same policy vercel.json gives the static pages (helmet's API policy would block the app).
export const PAGE_CSP =
  "default-src 'self'; script-src 'self' https://nabiz.miracdeprem.com; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
  "connect-src 'self' https://nabiz.miracdeprem.com; " +
  "object-src 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com; frame-ancestors 'none'";

const TEXT = {
  tr: {
    homeTitle: 'Seans: klasik film sineması, koltuğunu seç, online bilet al',
    homeDescription:
      'Seans, klasik filmler gösteren bir sinemanın bilet sitesi: seansı seç, gerçek koltuk haritasından yerini al, Stripe ile öde, QR biletini al. Ödemeler test modunda olan bir portfolyo projesidir.',
    movieTitle: (m) => `${m.titleTr} (${m.year}), ${m.director} · Seans`,
  },
  en: {
    homeTitle: 'Seans: classic film cinema, pick your seat and book tickets online',
    homeDescription:
      'Seans is the ticket site of a cinema showing classic films: pick a showing, choose your seat on a real seat map, pay with Stripe and get a QR ticket. A portfolio project with payments in test mode.',
    movieTitle: (m) => `${m.titleEn} (${m.year}), ${m.director} · Seans`,
  },
};

const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON-LD that cannot close its script tag. */
export const jsonLd = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

/** Shortens text for a meta description at a word boundary. */
export function summary(text, max = 155) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.lastIndexOf(' ', max - 1);
  return `${flat.slice(0, cut > 0 ? cut : max - 1).replace(/[,.;:]$/, '')}…`;
}

export const pageUrl = (path, lang) => `${SITE_URL}${path}${lang === 'en' ? '?lang=en' : ''}`;

/** Puts the page's head tags into the built index.html. */
export function renderPage(template, { lang, path, title, description, data }) {
  const url = pageUrl(path, lang);
  const tags = [
    `<link rel="canonical" href="${url}" />`,
    `<link rel="alternate" hreflang="tr" href="${pageUrl(path, 'tr')}" />`,
    `<link rel="alternate" hreflang="en" href="${pageUrl(path, 'en')}" />`,
    `<link rel="alternate" hreflang="x-default" href="${pageUrl(path, 'tr')}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Seans" />',
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${SITE_URL}/og-image.png" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:locale" content="${lang === 'en' ? 'en_US' : 'tr_TR'}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<script type="application/ld+json">${jsonLd(data)}</script>`,
  ];
  return template
    .replace(/<html lang="[a-z]+">/, `<html lang="${lang}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace(/\s*<meta name="robots" content="noindex" \/>/, '')
    .replace('</head>', `    ${tags.join('\n    ')}\n  </head>`);
}

export function homePage(lang) {
  const t = TEXT[lang];
  return {
    lang,
    path: '/',
    title: t.homeTitle,
    description: t.homeDescription,
    data: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Seans',
      url: pageUrl('/', lang),
      description: t.homeDescription,
      inLanguage: lang,
      author: { '@type': 'Person', name: 'Miraç Deprem', url: 'https://www.miracdeprem.com' },
    },
  };
}

export function moviePage(movie, lang) {
  const english = lang === 'en';
  const description = summary(english ? movie.summaryEn : movie.summaryTr);
  return {
    lang,
    path: `/movies/${movie.slug}`,
    title: TEXT[lang].movieTitle(movie),
    description,
    data: {
      '@context': 'https://schema.org',
      '@type': 'Movie',
      name: english ? movie.titleEn : movie.titleTr,
      alternateName: movie.originalTitle,
      dateCreated: String(movie.year),
      director: { '@type': 'Person', name: movie.director },
      duration: `PT${movie.runtimeMin}M`,
      description: english ? movie.summaryEn : movie.summaryTr,
      url: pageUrl(`/movies/${movie.slug}`, lang),
      inLanguage: lang,
    },
  };
}

export function sitemapXml(slugs) {
  const paths = ['/', ...slugs.map((slug) => `/movies/${slug}`)];
  const urls = paths.flatMap((path) =>
    ['tr', 'en'].map(
      (lang) => `  <url>
    <loc>${escapeHtml(pageUrl(path, lang))}</loc>
    <xhtml:link rel="alternate" hreflang="tr" href="${escapeHtml(pageUrl(path, 'tr'))}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${escapeHtml(pageUrl(path, 'en'))}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeHtml(pageUrl(path, 'tr'))}"/>
  </url>`,
    ),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}

const langOf = (req) => (req.query.lang === 'en' ? 'en' : 'tr');

// The built page (index.html renamed to app.html, see vite.config.js), read once per function
// instance; vercel.json includes it in the function.
let cached;
const defaultTemplate = () => (cached ??= readFile(join(process.cwd(), 'dist', 'app.html'), 'utf8'));

export function createSeoRouter({ db, loadTemplate = defaultTemplate }) {
  const router = Router();

  const send = async (res, page, status = 200) => {
    const html = renderPage(await loadTemplate(), page);
    res.status(status).set({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PAGE_CSP, 'Cache-Control': 'no-cache' }).send(html);
  };

  router.get('/', async (req, res) => send(res, homePage(langOf(req))));

  router.get('/movies/:slug', async (req, res) => {
    let movie;
    try {
      movie = await getMovie(db(), req.params.slug);
    } catch (err) {
      if (err?.status !== 404) throw err;
      // Unknown film: the app shows its own "not found"; search engines must not keep it.
      const html = (await loadTemplate()).replace(/<html lang="[a-z]+">/, `<html lang="${langOf(req)}">`);
      return res.status(404).set({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PAGE_CSP }).send(html);
    }
    return send(res, moviePage(movie, langOf(req)));
  });

  router.get('/sitemap.xml', async (req, res) => {
    const movies = await listMovies(db());
    res.set({ 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }).send(sitemapXml(movies.map((m) => m.slug)));
  });

  return router;
}
