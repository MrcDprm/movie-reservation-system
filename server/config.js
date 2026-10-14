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
  })
  .refine((c) => c.NODE_ENV !== 'production' || c.RESEND_API_KEY, {
    path: ['RESEND_API_KEY'],
    message: 'required in production',
  });

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid configuration: ${fields}`);
  }
  return parsed.data;
}
