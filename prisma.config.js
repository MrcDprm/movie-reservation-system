// Prisma 7 reads connection settings from this file instead of schema.prisma.
// The CLI (migrate) uses the direct connection; the app uses Neon's pooled one (server/db.js).
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer loads .env by itself. Locally the variables come from .env, or from the
// file named in PRISMA_ENV_FILE (.env.test for the test database); on Vercel they are already set.
try {
  process.loadEnvFile(process.env.PRISMA_ENV_FILE ?? '.env');
} catch {
  // no file: use the environment as it is
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'node prisma/seed.js' },
  // Only migrate needs a connection. The Vercel build runs just `prisma generate`, which does
  // not, so a missing DIRECT_URL there is fine.
  ...(process.env.DIRECT_URL && { datasource: { url: process.env.DIRECT_URL } }),
});
