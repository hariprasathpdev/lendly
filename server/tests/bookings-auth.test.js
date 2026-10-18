import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app } from '../src/app.js';

test('booking, notification, messaging, and admin operations reject anonymous callers', async () => {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/v1/bookings`;
    const responses = await Promise.all([
      fetch(`${base}/mine`),
      fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      fetch('http://127.0.0.1:' + server.address().port + '/api/v1/notifications/mine'),
      fetch('http://127.0.0.1:' + server.address().port + '/api/v1/notifications/read-all', { method: 'POST' }),
      fetch('http://127.0.0.1:' + server.address().port + '/api/v1/conversations/mine'),
      fetch('http://127.0.0.1:' + server.address().port + '/api/v1/admin/listings'),
      fetch('http://127.0.0.1:' + server.address().port + '/api/v1/admin/disputes'),
      fetch('http://127.0.0.1:' + server.address().port + '/api/v1/admin/refunds'),
      fetch('http://127.0.0.1:' + server.address().port + '/api/v1/admin/reports'),
      fetch('http://127.0.0.1:' + server.address().port + '/api/v1/admin/overdue'),
      fetch('http://127.0.0.1:' + server.address().port + '/api/v1/admin/overview'),
      fetch('http://127.0.0.1:' + server.address().port + '/api/v1/admin/users'),
      fetch('http://127.0.0.1:' + server.address().port + '/api/v1/admin/bookings'),
      fetch('http://127.0.0.1:' + server.address().port + '/api/v1/admin/audit'),
      fetch('http://127.0.0.1:' + server.address().port + '/api/v1/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      fetch('http://127.0.0.1:' + server.address().port + '/api/v1/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      fetch('http://127.0.0.1:' + server.address().port + '/api/v1/reviews/users/11111111-1111-4111-8111-111111111111'),
    ]);
    for (const response of responses) {
      assert.equal(response.status, 401);
      const body = await response.json();
      assert.equal(body.error.code, 'AUTH_REQUIRED');
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
