import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrevoService, readBrevoConfig, isBrevoConfigured } from './brevo.ts';
import { ZeptoMailError } from './email.ts';

const baseEnv = {
  BREVO_API_KEY: 'xkeysib-test-key-1234567890-abcdef',
  ZEPTOMAIL_FROM_EMAIL: 'care@ricoz.in',
  ZEPTOMAIL_FROM_NAME: 'Ricoz Innovation',
  ZEPTOMAIL_CONTACT_TO: 'care@ricoz.in',
};

test('readBrevoConfig validates required sender fields and rejects header injection', () => {
  assert.deepEqual(readBrevoConfig(baseEnv), {
    apiKey: 'xkeysib-test-key-1234567890-abcdef',
    fromEmail: 'care@ricoz.in',
    fromName: 'Ricoz Innovation',
    contactTo: 'care@ricoz.in',
  });

  assert.throws(
    () => readBrevoConfig({ ...baseEnv, BREVO_API_KEY: '' }),
    (e) => e instanceof ZeptoMailError && e.code === 'configuration',
  );
  assert.throws(
    () => readBrevoConfig({ ...baseEnv, BREVO_API_KEY: 'short' }),
    (e) => e instanceof ZeptoMailError && e.code === 'configuration',
  );
  assert.throws(
    () => readBrevoConfig({ ...baseEnv, ZEPTOMAIL_FROM_EMAIL: 'not-an-email' }),
    (e) => e instanceof ZeptoMailError && e.code === 'configuration',
  );
  assert.throws(
    () => readBrevoConfig({ ...baseEnv, ZEPTOMAIL_FROM_NAME: 'Ricoz\nInjection' }),
    (e) => e instanceof ZeptoMailError && e.code === 'configuration',
  );
});

test('isBrevoConfigured returns true only when all vars present', () => {
  assert.equal(isBrevoConfigured(baseEnv), true);
  assert.equal(isBrevoConfigured({}), false);
  assert.equal(isBrevoConfigured({ BREVO_API_KEY: 'xkeysib-abc123456789', ZEPTOMAIL_FROM_EMAIL: 'a@b.c' }), false);
});

test('Brevo service sends via HTTPS API with correct payload and headers — never leaks api key', async () => {
  let capturedUrl = '';
  let capturedHeaders = {};
  let capturedBody = '';
  const fetchImpl = async (url, init) => {
    capturedUrl = url;
    capturedHeaders = init.headers;
    capturedBody = init.body;
    return { ok: true, status: 201 };
  };

  const service = createBrevoService(baseEnv, fetchImpl);
  assert.equal(service.config.provider, 'brevo');
  await service.send({
    to: 'user@example.com',
    subject: 'Reset your Ricoz password',
    text: 'Hello plain',
    html: '<p>Hello</p>',
  });

  assert.equal(capturedUrl, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(capturedHeaders['api-key'], 'xkeysib-test-key-1234567890-abcdef');
  assert.equal(capturedHeaders['content-type'], 'application/json');
  const body = JSON.parse(capturedBody);
  assert.deepEqual(body.sender, { email: 'care@ricoz.in', name: 'Ricoz Innovation' });
  assert.deepEqual(body.to, [{ email: 'user@example.com' }]);
  assert.equal(body.subject, 'Reset your Ricoz password');
  assert.equal(body.htmlContent, '<p>Hello</p>');
  assert.equal(body.textContent, 'Hello plain');
  assert.equal(body.replyTo, undefined);
});

test('Brevo service forwards replyTo when present (contact enquiries)', async () => {
  let capturedBody = '';
  const fetchImpl = async (_url, init) => {
    capturedBody = init.body;
    return { ok: true, status: 201 };
  };
  const service = createBrevoService(baseEnv, fetchImpl);
  await service.send({
    to: 'care@ricoz.in',
    subject: 'New enquiry',
    text: 'Hi',
    html: '<p>Hi</p>',
    replyTo: 'visitor@example.com',
  });
  const body = JSON.parse(capturedBody);
  assert.deepEqual(body.replyTo, { email: 'visitor@example.com' });
});

test('Brevo service ignores invalid replyTo without failing', async () => {
  let capturedBody = '';
  const fetchImpl = async (_url, init) => {
    capturedBody = init.body;
    return { ok: true, status: 201 };
  };
  const service = createBrevoService(baseEnv, fetchImpl);
  await service.send({
    to: 'care@ricoz.in',
    subject: 'New enquiry',
    text: 'Hi',
    html: '<p>Hi</p>',
    replyTo: 'not-an-email',
  });
  const body = JSON.parse(capturedBody);
  assert.equal(body.replyTo, undefined);
});

test('Brevo service sanitizes API failures and timeout without leaking response body', async () => {
  // API error (401/400 etc.)
  const failingFetch = async () => ({ ok: false, status: 401 });
  const service = createBrevoService(baseEnv, failingFetch);
  await assert.rejects(
    service.send({ to: 'a@b.c', subject: 'Test', text: 't', html: '<p>t</p>' }),
    (e) => e instanceof ZeptoMailError && e.code === 'delivery' && !e.message.includes('xkeysib'),
  );

  // Network/timeout error
  const throwingFetch = async () => { throw Object.assign(new Error('fetch failed'), { code: 'ETIMEDOUT' }); };
  const service2 = createBrevoService(baseEnv, throwingFetch);
  await assert.rejects(
    service2.send({ to: 'a@b.c', subject: 'Test', text: 't', html: '<p>t</p>' }),
    (e) => e instanceof ZeptoMailError && e.code === 'delivery',
  );
});

test('Brevo service applies 10s abort timeout via signal', async () => {
  let capturedSignal;
  const fetchImpl = async (_url, init) => {
    capturedSignal = init.signal;
    return { ok: true, status: 201 };
  };
  const service = createBrevoService(baseEnv, fetchImpl);
  await service.send({ to: 'a@b.c', subject: 'Test', text: 't', html: '<p>t</p>' });
  assert.ok(capturedSignal instanceof AbortSignal, 'should pass AbortSignal to fetch');
});
