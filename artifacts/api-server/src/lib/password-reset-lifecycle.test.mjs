import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  isPasswordResetTokenUsable,
  passwordResetUrl,
  PASSWORD_RESET_TTL_MS,
} from './password-reset.ts';

test('token lifecycle covers happy path and failure modes', async (t) => {
  const now = Date.parse('2026-10-17T12:00:00.000Z');
  const issued = createPasswordResetToken(now);

  // Valid token is usable immediately, not after expiry, not after consumption
  await t.test('valid token is usable until expiry', () => {
    assert.equal(isPasswordResetTokenUsable({ expiresAt: issued.expiresAt, usedAt: null }, now), true);
    assert.equal(isPasswordResetTokenUsable({ expiresAt: issued.expiresAt, usedAt: null }, now + 30 * 60 * 1000 - 1), true);
    assert.equal(isPasswordResetTokenUsable({ expiresAt: issued.expiresAt, usedAt: null }, now + 30 * 60 * 1000), false);
    assert.equal(isPasswordResetTokenUsable({ expiresAt: issued.expiresAt, usedAt: null }, now + 31 * 60 * 1000), false);
  });

  await t.test('used token cannot be reused even before expiry', () => {
    assert.equal(isPasswordResetTokenUsable({ expiresAt: issued.expiresAt, usedAt: new Date(now + 1000) }, now + 2000), false);
    assert.equal(isPasswordResetTokenUsable({ expiresAt: issued.expiresAt, usedAt: '2026-10-17T12:01:00.000Z' }, now + 500), false);
  });

  await t.test('expired token cannot be used even if never consumed', () => {
    assert.equal(isPasswordResetTokenUsable({ expiresAt: new Date(now - 1), usedAt: null }, now), false);
    assert.equal(isPasswordResetTokenUsable({ expiresAt: new Date(now), usedAt: null }, now), false);
  });

  await t.test('malformed or missing expiresAt is treated as unusable', () => {
    assert.equal(isPasswordResetTokenUsable({ expiresAt: 'not-a-date', usedAt: null }, now), false);
    assert.equal(isPasswordResetTokenUsable({ expiresAt: '2026-13-99', usedAt: null }, now), false);
    // string-formatted expiresAt that is still valid should pass
    assert.equal(isPasswordResetTokenUsable({ expiresAt: issued.expiresAt.toISOString(), usedAt: null }, now), true);
  });

  await t.test('TTL is exactly 30 minutes', () => {
    assert.equal(PASSWORD_RESET_TTL_MS, 30 * 60 * 1000);
    assert.equal(issued.expiresAt.getTime(), now + PASSWORD_RESET_TTL_MS);
  });
});

test('hashPasswordResetToken is deterministic, trimmed, and safe', () => {
  const token = '  test-token-123  ';
  const trimmed = token.trim();
  // Hash should be same whether token has surrounding whitespace (trimmed internally)
  assert.equal(hashPasswordResetToken(token), hashPasswordResetToken(trimmed));
  // Different tokens produce different hashes
  assert.notEqual(hashPasswordResetToken('token-a'), hashPasswordResetToken('token-b'));
  // Hash is 64 hex chars (SHA-256)
  const hash = hashPasswordResetToken('some-random-token-value-that-is-at-least-32-chars-long-xxx');
  assert.match(hash, /^[0-9a-f]{64}$/);
  // Same input always gives same hash
  assert.equal(hashPasswordResetToken('repeatable'), hashPasswordResetToken('repeatable'));
});

test('passwordResetUrl generates fragment URL that survives special characters', () => {
  // Base64url tokens contain hyphens and underscores — must round-trip through URLSearchParams
  const tokenWithHyphens = 'AbCdEfGhIjKlMnOpQrStUvWxYz-1234567890_abc';
  const url1 = new URL(passwordResetUrl('https://mystery-shopper-frontend1.onrender.com', tokenWithHyphens));
  assert.equal(url1.origin, 'https://mystery-shopper-frontend1.onrender.com');
  assert.equal(url1.pathname, '/reset-password');
  assert.equal(url1.search, '');
  assert.equal(new URLSearchParams(url1.hash.slice(1)).get('token'), tokenWithHyphens);

  // PUBLIC_APP_URL with trailing slash should still work
  const url2 = new URL(passwordResetUrl('https://mystery-shopper-frontend1.onrender.com/', tokenWithHyphens));
  assert.equal(url2.pathname, '/reset-password');

  // Token with surrounding whitespace should be trimmed
  const url3 = new URL(passwordResetUrl('https://app.example.com', '  my-token-abc  '));
  assert.equal(new URLSearchParams(url3.hash.slice(1)).get('token'), 'my-token-abc');

  // Ensure token is not placed in search or pathname (security: avoid server logs)
  const rawUrl = passwordResetUrl('https://app.example.com', 'secret-token-xyz');
  assert.ok(rawUrl.includes('#'), 'token must be in hash fragment');
  const url4 = new URL(rawUrl);
  assert.equal(url4.search, '');
  assert.ok(!url4.pathname.includes('secret-token-xyz'));
});

test('createPasswordResetToken generates 43-char base64url tokens with 32 bytes entropy', () => {
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    const { token, tokenHash } = createPasswordResetToken();
    assert.equal(token.length, 43, `expected 43 chars, got ${token.length}: ${token}`);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/, `token must be base64url: ${token}`);
    assert.match(tokenHash, /^[0-9a-f]{64}$/);
    // Hash must match token (trimmed)
    assert.equal(tokenHash, hashPasswordResetToken(token));
    seen.add(token);
  }
  // All tokens should be unique (random)
  assert.equal(seen.size, 20);
});

test('isPasswordResetTokenUsable handles timestamptz string variants from Postgres', () => {
  const now = Date.now();
  const futureDate = new Date(now + 60000);
  const pastDate = new Date(now - 60000);

  // Drizzle/pg returns timestamptz as Date, but raw SQL could return ISO string
  assert.equal(isPasswordResetTokenUsable({ expiresAt: futureDate.toISOString(), usedAt: null }, now), true);
  assert.equal(isPasswordResetTokenUsable({ expiresAt: pastDate.toISOString(), usedAt: null }, now), false);

  // usedAt string form also counts as consumed
  assert.equal(isPasswordResetTokenUsable({ expiresAt: futureDate, usedAt: futureDate.toISOString() }, now), false);
  // usedAt null vs undefined both mean unused
  assert.equal(isPasswordResetTokenUsable({ expiresAt: futureDate, usedAt: null }, now), true);
  // Boundary: expiresAt exactly equal to now is not usable (must be strictly greater)
  assert.equal(isPasswordResetTokenUsable({ expiresAt: new Date(now), usedAt: null }, now), false);
});
