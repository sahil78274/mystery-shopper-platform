import test from 'node:test';
import assert from 'node:assert/strict';
import { createZeptoMailService, ZeptoMailError, readZeptoMailConfig } from './email.ts';

const testPassword = 'test-only-password';
const env = {
  ZEPTOMAIL_SMTP_HOST: 'smtp.zeptomail.in',
  ZEPTOMAIL_SMTP_PORT: '587',
  ZEPTOMAIL_SMTP_USER: 'emailapikey',
  ZEPTOMAIL_SMTP_PASSWORD: testPassword,
  ZEPTOMAIL_FROM_EMAIL: 'care@ricoz.in',
  ZEPTOMAIL_FROM_NAME: 'Ricoz Innovation',
  ZEPTOMAIL_CONTACT_TO: 'care@ricoz.in',
};

test('validates ZeptoMail settings and configures port 587 with mandatory STARTTLS', async () => {
  assert.deepEqual(readZeptoMailConfig(env), {
    host: 'smtp.zeptomail.in',
    port: 587,
    user: 'emailapikey',
    password: testPassword,
    fromEmail: 'care@ricoz.in',
    fromName: 'Ricoz Innovation',
    contactTo: 'care@ricoz.in',
  });

  let transportOptions;
  let sentMessage;
  const service = createZeptoMailService(env, (options) => {
    transportOptions = options;
    return { sendMail: async (message) => { sentMessage = message; return {}; } };
  });
  await service.send({ to: 'shopper@example.com', subject: 'Test', text: 'Hello', html: '<p>Hello</p>' });

  assert.equal(transportOptions.host, 'smtp.zeptomail.in');
  assert.equal(transportOptions.port, 587);
  assert.equal(transportOptions.secure, false);
  assert.equal(transportOptions.requireTLS, true);
  assert.equal(transportOptions.auth.user, 'emailapikey');
  assert.equal(transportOptions.auth.pass, testPassword);
  assert.deepEqual(sentMessage.from, { name: 'Ricoz Innovation', address: 'care@ricoz.in' });
  assert.equal(sentMessage.to, 'shopper@example.com');
});

test('validates port 465 with implicit TLS', async () => {
  const env465 = { ...env, ZEPTOMAIL_SMTP_PORT: '465' };
  assert.deepEqual(readZeptoMailConfig(env465), {
    host: 'smtp.zeptomail.in',
    port: 465,
    user: 'emailapikey',
    password: testPassword,
    fromEmail: 'care@ricoz.in',
    fromName: 'Ricoz Innovation',
    contactTo: 'care@ricoz.in',
  });

  let transportOptions;
  const service = createZeptoMailService(env465, (options) => {
    transportOptions = options;
    return { sendMail: async () => ({}) };
  });
  await service.send({ to: 'shopper@example.com', subject: 'Test', text: 'Hello', html: '<p>Hello</p>' });

  assert.equal(transportOptions.port, 465);
  assert.equal(transportOptions.secure, true);
  assert.equal(transportOptions.requireTLS, undefined);
});

test('rejects missing secrets and invalid SMTP port without returning credential values', () => {
  assert.throws(
    () => readZeptoMailConfig({ ...env, ZEPTOMAIL_SMTP_PASSWORD: '' }),
    (error) => error instanceof ZeptoMailError && error.code === 'configuration' && !error.message.includes(testPassword),
  );
  assert.throws(
    () => readZeptoMailConfig({ ...env, ZEPTOMAIL_SMTP_PORT: '2525' }),
    (error) => error instanceof ZeptoMailError && error.code === 'configuration',
  );
  assert.throws(
    () => readZeptoMailConfig({ ...env, ZEPTOMAIL_SMTP_PORT: '25' }),
    (error) => error instanceof ZeptoMailError && error.code === 'configuration',
  );
  assert.throws(
    () => readZeptoMailConfig({ ...env, ZEPTOMAIL_FROM_NAME: 'Ricoz\nInvalid' }),
    (error) => error instanceof ZeptoMailError && error.code === 'configuration',
  );
});

test('sanitizes SMTP transport failures rather than exposing provider diagnostics', async () => {
  const service = createZeptoMailService(env, () => ({
    sendMail: async () => { throw new Error(`AUTH failed: ${testPassword}`); },
  }));
  await assert.rejects(
    service.send({ to: 'shopper@example.com', subject: 'Test', text: 'Hello', html: '<p>Hello</p>' }),
    (error) => error instanceof ZeptoMailError && error.code === 'delivery' && !error.message.includes(testPassword) && !('cause' in error),
  );
});
