// Settings from environment variables (see .env.example). Read once, validated with zod,
// so a missing secret fails at startup instead of in the middle of a request.
import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // Neon's pooled connection string (host contains "-pooler").
    DATABASE_URL: z.string().url().optional(),
    // The public address of the site; the only origin allowed to call the API, used in e-mail links.
    APP_ORIGIN: z.string().url().default('http://localhost:5173'),
    APP_NAME: z.string().default('Klasik Sinema'),
    // Resend (https://resend.com). Without a key, e-mails are printed to the console.
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('Klasik Sinema <bilet@miracdeprem.com>'),
    // Stripe test mode: sk_test_... and the webhook endpoint's signing secret (whsec_...).
    STRIPE_SECRET_KEY: z.string().startsWith('sk_test_').optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    // Signs the QR codes on tickets. Long and random in production (openssl rand -base64 48).
    TICKET_SECRET: z.string().min(32).optional(),
  })
  .superRefine((c, ctx) => {
    if (c.NODE_ENV !== 'production') return;
    for (const key of ['RESEND_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'TICKET_SECRET']) {
      if (!c[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required in production' });
    }
  });

const stripUndefined = (object) => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined));

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid configuration: ${fields}`);
  }
  // A fixed secret is fine on a developer machine; production must set its own (checked above).
  return { TICKET_SECRET: 'local-development-ticket-secret-not-for-production', ...stripUndefined(parsed.data) };
}
