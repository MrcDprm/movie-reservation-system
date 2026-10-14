// Prisma client over Neon's serverless driver. Prisma 7 talks to the database through a
// driver adapter; Neon's driver works well in short-lived Vercel functions.
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';

let client;

// Created on first use and reused while the function instance stays warm.
export function getPrisma(databaseUrl = process.env.DATABASE_URL) {
  if (!client) {
    if (!databaseUrl) throw new Error('DATABASE_URL is not set');
    client = new PrismaClient({ adapter: new PrismaNeon({ connectionString: databaseUrl }) });
  }
  return client;
}
