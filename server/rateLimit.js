// Fixed-window rate limiting stored in Postgres, because serverless instances share no memory.
// One statement inserts the counter or increments it, starting a new window when the old one
// has ended, so concurrent requests cannot both read "4" and both pass a limit of 5.
import { AppError } from './errors.js';

export async function hit(prisma, key, windowSeconds, now = new Date()) {
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);
  const rows = await prisma.$queryRaw`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${resetAt} ELSE "RateLimitBucket"."resetAt" END
    RETURNING "count", "resetAt"`;
  return rows[0];
}

// Throws 429 when any of the keys is over its limit. All keys are counted, so an attacker
// spreading guesses over many e-mails is still stopped by the per-IP key and vice versa.
export async function enforce(prisma, rules, now = new Date()) {
  let retryAfter = 0;
  for (const { key, limit, windowSeconds } of rules) {
    const { count, resetAt } = await hit(prisma, key, windowSeconds, now);
    if (count > limit) retryAfter = Math.max(retryAfter, Math.ceil((resetAt - now) / 1000));
  }
  if (retryAfter > 0) {
    const error = new AppError(429, 'rate_limited');
    error.retryAfter = retryAfter;
    throw error;
  }
  // Now and then, drop old counters so the table stays small.
  if (Math.random() < 0.01) {
    await prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lt: now } } });
  }
}

// The visitor's IP. On Vercel, x-vercel-forwarded-for is set by Vercel's edge from the real
// connection and cannot be supplied by the client; req.ip is the fallback for local runs.
export function clientIp(req) {
  const vercel = req.get('x-vercel-forwarded-for');
  return (vercel ? vercel.split(',')[0].trim() : req.ip) || 'unknown';
}
