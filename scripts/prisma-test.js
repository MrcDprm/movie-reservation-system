// Run a Prisma CLI command against the test database: `npm run db:deploy:test`.
// Sets PRISMA_ENV_FILE so prisma.config.js loads .env.test instead of .env (works on Windows too).
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['prisma', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PRISMA_ENV_FILE: '.env.test' },
});
process.exit(result.status ?? 1);
