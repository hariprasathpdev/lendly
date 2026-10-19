import test from 'node:test';
import assert from 'node:assert/strict';
import { requireTermsAccepted } from '../src/middleware/auth.js';

test('policy gate rejects profiles without a server-recorded acceptance timestamp', () => {
  let error;
  requireTermsAccepted({ profile: { terms_accepted_at: null } }, {}, (nextError) => { error = nextError; });
  assert.equal(error.status, 403);
  assert.equal(error.code, 'POLICY_ACCEPTANCE_REQUIRED');
});

test('policy gate allows profiles with a recorded acceptance timestamp', () => {
  let called = false;
  requireTermsAccepted({ profile: { terms_accepted_at: '2026-10-18T00:00:00.000Z' } }, {}, (error) => {
    assert.equal(error, undefined);
    called = true;
  });
  assert.equal(called, true);
});
