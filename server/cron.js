// The daily job. Vercel calls it on the schedule in vercel.json and sends
// "Authorization: Bearer <CRON_SECRET>"; anyone else gets 401.
import { createHash, timingSafeEqual } from 'node:crypto';

import { Router } from 'express';

import { AppError } from './errors.js';
import { cleanUp, topUpShowtimes } from './programme.js';

// Hashing first gives both sides the same length, which timingSafeEqual needs.
const digest = (value) => createHash('sha256').update(String(value)).digest();

export function createCronRouter({ db, config }) {
  const router = Router();

  router.get('/daily', async (req, res) => {
    const expected = config.CRON_SECRET;
    if (!expected || !timingSafeEqual(digest(req.get('authorization') ?? ''), digest(`Bearer ${expected}`))) {
      throw new AppError(401, 'unauthorized');
    }
    const showtimesAdded = await topUpShowtimes(db());
    const removed = await cleanUp(db());
    res.json({ showtimesAdded, removed });
  });

  return router;
}
