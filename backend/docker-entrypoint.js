#!/usr/bin/env node
/**
 * Waits for DB, runs migrate + seed, then starts the API.
 * Implemented in Node to avoid Windows CRLF breaking shell scripts in Docker.
 */
const { spawnSync, spawn } = require('child_process');
const { PrismaClient } = require('@prisma/client');

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: false,
    ...opts,
  });
  if (result.status !== 0 && !opts.allowFail) {
    process.exit(result.status || 1);
  }
  return result.status;
}

async function waitForDb(retries = 60) {
  const prisma = new PrismaClient();
  for (let i = 0; i < retries; i += 1) {
    try {
      await prisma.$connect();
      console.log('Database ready');
      await prisma.$disconnect();
      return;
    } catch {
      console.log(`Database unavailable — retrying in 2s... (${i + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.error('Could not connect to database');
  process.exit(1);
}

async function main() {
  console.log('Waiting for PostgreSQL...');
  await waitForDb();

  console.log('Running Prisma migrations...');
  run('npx', ['prisma', 'migrate', 'deploy']);

  console.log('Seeding database...');
  const seedStatus = run('npx', ['prisma', 'db', 'seed'], { allowFail: true });
  if (seedStatus !== 0) {
    run('node', ['prisma/seed.js']);
  }

  console.log('Starting API server...');
  const child = spawn('node', ['src/index.js'], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code || 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
