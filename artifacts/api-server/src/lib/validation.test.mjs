import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTextFields, validDate, validDateRange } from './validation.ts';

test('validDate accepts real calendar dates and rejects malformed or impossible dates', () => {
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2023-02-29'), false);
  assert.equal(validDate('2026-13-01'), false);
  assert.equal(validDate('2026-1-01'), false);
  assert.equal(validDate('2026-01-01T00:00:00Z'), false);
});

test('validDateRange validates both endpoints and inclusive ordering', () => {
  assert.equal(validDateRange(), true);
  assert.equal(validDateRange('2026-05-01'), true);
  assert.equal(validDateRange('2026-05-01', '2026-05-01'), true);
  assert.equal(validDateRange('2026-05-02', '2026-05-01'), false);
  assert.equal(validDateRange('2026-02-30', '2026-03-01'), false);
});

test('normalizeTextFields trims selected values and nulls configured optional blanks', () => {
  const source = { fullName: '  Asha Rao  ', email: '  A@EXAMPLE.COM ', phone: '  ', keep: '  x  ' };
  const normalized = normalizeTextFields(source, ['fullName', 'email', 'phone'], ['phone']);
  assert.deepEqual(normalized, {
    fullName: 'Asha Rao',
    email: 'A@EXAMPLE.COM',
    phone: null,
    keep: '  x  ',
  });
  assert.equal(source.fullName, '  Asha Rao  ', 'normalization must not mutate caller data');
});
