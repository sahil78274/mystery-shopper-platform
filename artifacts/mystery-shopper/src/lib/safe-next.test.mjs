import test from 'node:test';
import assert from 'node:assert/strict';
import { safeNextPath } from './safe-next.ts';

test('safeNextPath preserves same-origin paths, queries, and fragments', () => {
  assert.equal(safeNextPath('/region/trends?months=6#chart'), '/region/trends?months=6#chart');
  assert.equal(safeNextPath('/reports'), '/reports');
});

test('safeNextPath rejects open redirects and malformed paths', () => {
  for (const candidate of [
    'https://attacker.invalid/path',
    '//attacker.invalid/path',
    '/\\\\attacker.invalid',
    'not-a-path',
    '',
    null,
    '/reports\nhttps://attacker.invalid',
  ]) {
    assert.equal(safeNextPath(candidate), '/');
  }
});
