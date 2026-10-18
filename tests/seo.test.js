import assert from 'node:assert/strict';
import { test } from 'node:test';

import request from 'supertest';

import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { jsonLd, moviePage, renderPage, sitemapXml, summary } from '../server/seo.js';

const config = loadConfig({ NODE_ENV: 'test', APP_ORIGIN: 'https://sinema.example' });

const TEMPLATE = `<!doctype html>
<html lang="tr">
  <head>
    <meta name="description" content="Seans" />
    <!-- note -->
    <meta name="robots" content="noindex" />
    <title>Seans</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

const MOVIE = {
  slug: 'casablanca', titleTr: 'Kazablanka', titleEn: 'Casablanca', originalTitle: 'Casablanca', year: 1942,
  director: 'Michael Curtiz', runtimeMin: 102, summaryTr: 'Rick\'in barı <savaş> yıllarında.', summaryEn: 'Rick\'s bar during the war.',
  posterInk: '#000', posterPaper: '#fff', showtimes: [],
};

// The movie service only needs these two queries.
const prisma = {
  movie: {
    findUnique: async ({ where }) => (where.slug === MOVIE.slug ? MOVIE : null),
    findMany: async () => [MOVIE],
  },
};
const app = () => createApp(config, { prisma, loadTemplate: async () => TEMPLATE });

test('film page is sent with its own title, description, alternates and Movie data', async () => {
  const response = await request(app()).get('/movies/casablanca?lang=en');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-security-policy'], /script-src 'self'/);
  const html = response.text;
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>Casablanca \(1942\), Michael Curtiz · Seans<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/seans\.miracdeprem\.com\/movies\/casablanca\?lang=en" \/>/);
  assert.match(html, /hreflang="tr" href="https:\/\/seans\.miracdeprem\.com\/movies\/casablanca"/);
  assert.doesNotMatch(html, /noindex/);
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(data['@type'], 'Movie');
  assert.equal(data.duration, 'PT102M');
});

test('home page is indexable and Turkish by default', async () => {
  const html = (await request(app()).get('/')).text;
  assert.match(html, /<html lang="tr">/);
  assert.match(html, /klasik film sineması/);
  assert.doesNotMatch(html, /noindex/);
});

test('unknown film is a 404 that keeps noindex', async () => {
  const response = await request(app()).get('/movies/nope');
  assert.equal(response.status, 404);
  assert.match(response.text, /noindex/);
});

test('sitemap lists the home page and every film in both languages', async () => {
  const response = await request(app()).get('/sitemap.xml');
  assert.match(response.headers['content-type'], /application\/xml/);
  assert.equal(response.text.match(/<loc>/g).length, 4);
  assert.match(response.text, /<loc>https:\/\/seans\.miracdeprem\.com\/movies\/casablanca\?lang=en<\/loc>/);
});

test('text from the database is escaped in the head', () => {
  const html = renderPage(TEMPLATE, moviePage({ ...MOVIE, titleTr: '"><script>x</script>' }, 'tr'));
  assert.doesNotMatch(html, /"><script>x/);
  assert.doesNotMatch(jsonLd({ a: '</script>' }), /<\/script>/);
});

test('summary cuts at a word', () => {
  const long = 'kelime '.repeat(60);
  const cut = summary(long);
  assert.ok(cut.length <= 156);
  assert.ok(cut.endsWith('kelime…'));
  assert.equal(sitemapXml([]).match(/<loc>/g).length, 2);
});
