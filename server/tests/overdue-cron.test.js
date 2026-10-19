import test from 'node:test';
import assert from 'node:assert/strict';
import { runOverdueJobRequest } from '../src/utils/overdue-job.js';

const secret = 'test-secret-value-that-is-at-least-32-chars';

test('overdue runner calls the private API with its bearer secret', async () => {
  let request;
  const result = await runOverdueJobRequest({
    hostport: 'lendly-api:10000',
    secret,
    fetchImpl: async (...args) => {
      request = args;
      return { ok: true, status: 200 };
    },
  });

  assert.equal(request[0], 'http://lendly-api:10000/api/v1/internal/overdue/run');
  assert.equal(request[1].method, 'POST');
  assert.equal(request[1].headers.Authorization, `Bearer ${secret}`);
  assert.deepEqual(result, { status: 200 });
});

test('overdue runner rejects missing or malformed configuration before making a request', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: true, status: 200 }; };

  await assert.rejects(runOverdueJobRequest({ hostport: 'https://example.com', secret, fetchImpl }), /API_HOSTPORT/);
  await assert.rejects(runOverdueJobRequest({ hostport: 'lendly-api:10000', secret: 'short', fetchImpl }), /CRON_SECRET/);
  assert.equal(calls, 0);
});

test('overdue runner fails the scheduled run when the API returns an error', async () => {
  await assert.rejects(
    runOverdueJobRequest({ hostport: 'lendly-api:10000', secret, fetchImpl: async () => ({ ok: false, status: 503 }) }),
    /HTTP 503/,
  );
});
