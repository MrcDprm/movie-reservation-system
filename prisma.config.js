// Prisma 7 reads connection settings from this file instead of schema.prisma.
// The CLI (migrate, studio) uses the direct connection; the app uses Neon's pooled one (server/db.js).
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DIRECT_URL') },
});
