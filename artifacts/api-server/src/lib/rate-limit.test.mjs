import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedWindowLimiter } from './rate-limit.ts';

test('fixed-window limiter allows the configured number and resets at the boundary', () => {
  const limiter = new FixedWindowLimiter(2, 1_000);
  assert.deepEqual(limiter.consume('client-a', 10_000), {
    allowed: true,
    remaining: 1,
    retryAfterSeconds: 0,
  });
  assert.deepEqual(limiter.consume('client-a', 10_100), {
    allowed: true,
    remaining: 0,
    retryAfterSeconds: 0,
  });
  assert.deepEqual(limiter.consume('client-a', 10_200), {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: 1,
  });
  assert.equal(limiter.consume('client-a', 11_000).allowed, true);
});

test('fixed-window limiter isolates keys and rejects invalid configuration', () => {
  const limiter = new FixedWindowLimiter(1, 2_000);
  assert.equal(limiter.consume('client-a', 1).allowed, true);
  assert.equal(limiter.consume('client-b', 1).allowed, true);
  assert.throws(() => new FixedWindowLimiter(0, 1_000), /positive/);
});
