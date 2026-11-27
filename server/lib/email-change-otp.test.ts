import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMAIL_CHANGE_OTP_DAILY_LIMIT,
  EMAIL_CHANGE_OTP_MAX_ATTEMPTS,
  EMAIL_CHANGE_OTP_TTL_SECONDS,
  hashProfileEmailChangeOtp,
  maskEmailAddress,
} from './email-change-otp.ts';

test('email change OTP policy has the required expiry, send limit and attempt cap', () => {
  assert.equal(EMAIL_CHANGE_OTP_TTL_SECONDS, 600);
  assert.equal(EMAIL_CHANGE_OTP_DAILY_LIMIT, 3);
  assert.equal(EMAIL_CHANGE_OTP_MAX_ATTEMPTS, 5);
});

test('OTP hash is keyed, deterministic and does not reveal the submitted code', () => {
  const previous = process.env.APPROVAL_TOKEN_ENCRYPTION_KEY;
  process.env.APPROVAL_TOKEN_ENCRYPTION_KEY = 'test-only-key-that-is-at-least-32-bytes-long';
  try {
    const first = hashProfileEmailChangeOtp('123456');
    assert.equal(first, hashProfileEmailChangeOtp('123456'));
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.equal(first.includes('123456'), false);
    assert.notEqual(first, hashProfileEmailChangeOtp('654321'));
  } finally {
    if (previous === undefined) delete process.env.APPROVAL_TOKEN_ENCRYPTION_KEY;
    else process.env.APPROVAL_TOKEN_ENCRYPTION_KEY = previous;
  }
});

test('email masking conceals most of the local part', () => {
  assert.equal(maskEmailAddress('drician@example.com'), 'dr••••••@example.com');
  assert.equal(maskEmailAddress('a@example.com'), 'a••@example.com');
});
