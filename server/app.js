// The Express app. On Vercel it runs as one serverless function (api/index.js);
// locally server/dev.js starts it on a port and Vite proxies /api to it.
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';

import { loadUser } from './auth/middleware.js';
import { handleStripeEvent } from './booking/checkout.js';
import { createAdminRouter } from './admin/routes.js';
import { createAuthRouter } from './auth/routes.js';
import { createBookingRouter } from './booking/routes.js';
import { loadConfig } from './config.js';
import { getPrisma } from './db.js';
import { errorHandler, notFound } from './errors.js';
import { createMailer } from './mail.js';
import { createPayments } from './payments.js';

// `deps` lets tests pass the test database, a fake mailer and fake payments.
export function createApp(config = loadConfig(), deps = {}) {
  const db = () => deps.prisma ?? getPrisma(config.DATABASE_URL); // connects on first use
  const mailer = deps.mailer ?? createMailer(config);
  const payments = deps.payments ?? createPayments(config);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Vercel's proxy sets the client address and https

  // The API only returns JSON, so it can have the strictest policy; the pages get their
  // Content-Security-Policy from vercel.json (they are static files there).
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
  // Stripe signs the exact bytes it sends, so the webhook needs the raw body: it is registered
  // before the JSON parser. A bad signature is a 400; a failure while handling is a 500, and
  // Stripe retries it later.
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    let event;
    try {
      event = payments.verifyEvent(req.body, req.get('stripe-signature') ?? '');
    } catch {
      return res.status(400).json({ error: 'bad_signature' });
    }
    const result = await handleStripeEvent(db(), payments, event, { mailer, config });
    return res.json({ received: true, result });
  });

  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Cookies are sent with cross-site requests in some cases; refuse state-changing requests
  // from any page other than our own site (CSRF), in addition to SameSite cookies.
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin && origin !== config.APP_ORIGIN) {
      return res.status(403).json({ error: 'forbidden' });
    }
    return next();
  });

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api', loadUser(db));
  app.use('/api/auth', createAuthRouter({ db, mailer, config }));
  app.use('/api', createBookingRouter({ db, payments, config }));
  app.use('/api/admin', createAdminRouter({ db }));

  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
