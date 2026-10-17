import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRequestBodyError } from './http-error.ts';

test('request parser failures produce bounded client errors without exposing parser bodies', () => {
  assert.deepEqual(classifyRequestBodyError({ type: 'entity.too.large', body: 'private payload' }), {
    status: 413,
    message: 'The request body is too large.',
    type: 'entity.too.large',
  });
  assert.deepEqual(classifyRequestBodyError({ type: 'entity.parse.failed' }), {
    status: 400,
    message: 'The request body is not valid JSON or form data.',
    type: 'entity.parse.failed',
  });
  assert.equal(classifyRequestBodyError({ type: 'encoding.unsupported' }).status, 415);
  assert.equal(classifyRequestBodyError(new Error('database failure')), null);
});
