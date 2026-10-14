// Settings from environment variables (see .env.example). Read once, validated with zod,
// so a missing secret fails at startup instead of in the middle of a request.
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Neon's pooled connection string (host contains "-pooler").
  DATABASE_URL: z.string().url().optional(),
  // The public address of the site; the only origin allowed to call the API.
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
});

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid configuration: ${fields}`);
  }
  return parsed.data;
}
