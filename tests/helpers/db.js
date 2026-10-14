// Test database helpers. Tests run against the Neon "test" branch (.env.test), never the
// main database: wipeDatabase() refuses to run if the test URL points at the same host as .env.
import { readFileSync } from 'node:fs';

import { getPrisma } from '../../server/db.js';

const host = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

function mainDatabaseHost() {
  try {
    const line = readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
    return line ? host(line.slice('DATABASE_URL='.length).trim()) : null;
  } catch {
    return null;
  }
}

export const hasTestDatabase = Boolean(process.env.DATABASE_URL);

export function testPrisma() {
  const testHost = host(process.env.DATABASE_URL);
  if (!testHost || testHost === mainDatabaseHost()) {
    throw new Error('Refusing to use the main database for tests: check .env.test');
  }
  return getPrisma();
}

// Children first, so foreign keys never block a delete.
export async function wipeDatabase(prisma) {
  await prisma.bookingSeat.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.showtime.deleteMany();
  await prisma.hallSeat.deleteMany();
  await prisma.hall.deleteMany();
  await prisma.movie.deleteMany();
  await prisma.emailToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}
