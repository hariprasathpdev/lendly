import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app } from '../src/app.js';

test('payment orders, signature verification, and refunds reject anonymous callers', async () => {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/v1/payments`;
    const responses = await Promise.all([
      fetch(`${base}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      fetch(`${base}/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      fetch(`${base}/refunds/11111111-1111-4111-8111-111111111111`, { method: 'POST' }),
    ]);
    for (const response of responses) {
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, 'AUTH_REQUIRED');
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('payment policy is public and the webhook route does not require a student session', async () => {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/v1/payments`;
    const policy = await fetch(`${base}/policy`);
    assert.equal(policy.status, 200);
    assert.equal((await policy.json()).data.mode, 'demo');

    const webhook = await fetch(`${base}/webhook/razorpay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"event":"payment.captured"}',
    });
    assert.equal(webhook.status, 503);
    assert.equal((await webhook.json()).error.code, 'PAYMENT_WEBHOOK_UNAVAILABLE');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
