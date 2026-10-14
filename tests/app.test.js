import assert from 'node:assert/strict';
import { test } from 'node:test';

import express from 'express';
import request from 'supertest';

import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { AppError, errorHandler } from '../server/errors.js';

const config = loadConfig({ NODE_ENV: 'test', APP_ORIGIN: 'https://sinema.example' });

test('health check', async () => {
  const response = await request(createApp(config)).get('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});

test('unknown API route is a JSON 404', async () => {
  const response = await request(createApp(config)).get('/api/nope');
  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: 'not_found' });
});

test('security headers and no caching of API answers', async () => {
  const response = await request(createApp(config)).get('/api/health');
  assert.match(response.headers['content-security-policy'], /default-src 'none'/);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.equal(response.headers['access-control-allow-origin'], undefined);
});

test('state-changing request from another site is refused', async () => {
  const app = createApp(config);
  const other = await request(app).post('/api/health').set('Origin', 'https://evil.example');
  assert.equal(other.status, 403);
  const own = await request(app).post('/api/health').set('Origin', 'https://sinema.example');
  assert.equal(own.status, 404); // passes the check; there is simply no POST route
});

test('broken JSON body is a 400, not a crash', async () => {
  const response = await request(createApp(config))
    .post('/api/anything')
    .set('Content-Type', 'application/json')
    .send('{not json');
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: 'bad_request' });
});

test('unexpected errors hide their details', async () => {
  const app = express();
  app.get('/boom', () => {
    throw new Error('password=hunter2 at /var/task/server/db.js');
  });
  app.get('/known', () => {
    throw new AppError(409, 'seat_taken');
  });
  app.use(errorHandler);

  const originalError = console.error;
  console.error = () => {}; // keep the test output clean
  try {
    const boom = await request(app).get('/boom');
    assert.equal(boom.status, 500);
    assert.deepEqual(boom.body, { error: 'internal_error' });
    assert.doesNotMatch(boom.text, /hunter2|db\.js/);
  } finally {
    console.error = originalError;
  }
  const known = await request(app).get('/known');
  assert.deepEqual([known.status, known.body], [409, { error: 'seat_taken' }]);
});

test('invalid configuration fails at startup', () => {
  assert.throws(() => loadConfig({ APP_ORIGIN: 'not a url' }), /APP_ORIGIN/);
});
