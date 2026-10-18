# SEO: Seans

Site: https://seans.miracdeprem.com (Turkish by default, English with `?lang=en`)

Seans is a React single-page app. The programme (`/`) and every film page (`/movies/<slug>`) are sent by the server (`server/seo.js`) with their own title, description, language alternates and structured data. Every other page (accounts, tickets, bookings, admin, door) is the static `index.html`, which carries `noindex`. Seans is a portfolio demo with payments in Stripe test mode; the descriptions say so, and showings are not marked up as events.

## Keywords

| Type | Turkish | English |
|---|---|---|
| General | sinema bileti al, online sinema bileti, klasik filmler | buy cinema tickets online, classic films, movie tickets |
| Specific | klasik film gösterimi, sinema koltuk seçimi, QR sinema bileti | classic film screenings, choose cinema seat, QR movie ticket |
| Per film | "<film adı> (<yıl>) <yönetmen>" (ör. "Kazablanka 1942 Michael Curtiz") | "<title> (<year>) <director>" |
| Portfolio | sinema rezervasyon sistemi projesi, Stripe ödeme entegrasyonu örneği | movie reservation system project, seat booking with Stripe |

## Where they are used

- `<title>` and meta description: programme text; on film pages "<title> (<year>), <director> · Seans" and the film summary
- Canonical + `hreflang` (tr, en, x-default) on the programme and film pages; `?lang=en` wins over the saved choice in the app
- Open Graph and Twitter card with `/og-image.png`
- JSON-LD `WebSite` on the programme, `Movie` (director, year, runtime) on film pages
- `/sitemap.xml` generated from the database (programme + every film, both languages) and `/robots.txt` (private pages closed)

## Google Search Console

The `miracdeprem.com` domain property covers this subdomain. Submit `https://seans.miracdeprem.com/sitemap.xml`.
