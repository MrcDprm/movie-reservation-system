// The Express app. On Vercel it runs as one serverless function (api/index.js);
// locally server/dev.js starts it on a port and Vite proxies /api to it.
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';

import { loadUser } from './auth/middleware.js';
import { createAuthRouter } from './auth/routes.js';
import { loadConfig } from './config.js';
import { getPrisma } from './db.js';
import { errorHandler, notFound } from './errors.js';
import { createMailer } from './mail.js';

// `deps` lets tests pass the test database and a fake mailer.
export function createApp(config = loadConfig(), deps = {}) {
  const db = () => deps.prisma ?? getPrisma(config.DATABASE_URL); // connects on first use
  const mailer = deps.mailer ?? createMailer(config);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Vercel's proxy sets the client address and https

  // The API only returns JSON, so it can have the strictest policy; the pages get their
  // Content-Security-Policy from vercel.json (they are static files there).
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
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

  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
