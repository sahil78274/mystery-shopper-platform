import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  isPasswordResetTokenUsable,
  passwordResetUrl,
  PASSWORD_RESET_TTL_MS,
} from './password-reset.ts';

test('reset tokens are random, hashed before storage and expire after the configured interval', () => {
  const now = Date.parse('2026-10-17T00:00:00.000Z');
  const issued = createPasswordResetToken(now);
  assert.equal(issued.token.length, 43);
  assert.notEqual(issued.tokenHash, issued.token);
  assert.equal(issued.tokenHash, hashPasswordResetToken(issued.token));
  assert.equal(issued.expiresAt.getTime(), now + PASSWORD_RESET_TTL_MS);
  assert.equal(isPasswordResetTokenUsable({ expiresAt: issued.expiresAt, usedAt: null }, now), true);
  assert.equal(isPasswordResetTokenUsable({ expiresAt: issued.expiresAt, usedAt: null }, issued.expiresAt.getTime()), false);
});

test('reset links keep the token in the fragment instead of the HTTP request URL', () => {
  const token = 'example-reset-token';
  const link = new URL(passwordResetUrl('https://app.example.com', token));
  assert.equal(link.pathname, '/reset-password');
  assert.equal(link.search, '');
  assert.equal(new URLSearchParams(link.hash.slice(1)).get('token'), token);
});

test('a consumed reset token cannot be reused, even before expiry', () => {
  const issued = createPasswordResetToken(10_000);
  assert.equal(isPasswordResetTokenUsable({ expiresAt: issued.expiresAt, usedAt: new Date(11_000) }, 12_000), false);
});
