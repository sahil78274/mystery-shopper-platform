import test from 'node:test';
import assert from 'node:assert/strict';
import { SubmitContactFormBody } from '../../../../lib/api-zod/src/generated/api.ts';

const validEnquiry = {
  name: 'Asha Rao',
  email: 'asha@example.com',
  subject: 'Platform information',
  message: 'Please tell me more about the Ricoz platform.',
};

test('accepts valid contact enquiries within the documented field limits', () => {
  assert.equal(SubmitContactFormBody.safeParse(validEnquiry).success, true);
  assert.equal(SubmitContactFormBody.safeParse({ ...validEnquiry, message: 'x'.repeat(4001) }).success, false);
  assert.equal(SubmitContactFormBody.safeParse({ ...validEnquiry, email: 'not-an-email' }).success, false);
});

test('rejects missing, too-short and whitespace-only contact fields', () => {
  assert.equal(SubmitContactFormBody.safeParse({ ...validEnquiry, name: '   ' }).success, false);
  assert.equal(SubmitContactFormBody.safeParse({ ...validEnquiry, subject: '\t  ' }).success, false);
  assert.equal(SubmitContactFormBody.safeParse({ ...validEnquiry, message: ' \n   ' }).success, false);
  assert.equal(SubmitContactFormBody.safeParse({ ...validEnquiry, message: 'short' }).success, false);
});
