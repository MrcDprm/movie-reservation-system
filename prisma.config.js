// Prisma 7 reads connection settings from this file instead of schema.prisma.
// The CLI (migrate) uses the direct connection; the app uses Neon's pooled one (server/db.js).
import { defineConfig, env } from 'prisma/config';

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
  datasource: { url: env('DIRECT_URL') },
});
