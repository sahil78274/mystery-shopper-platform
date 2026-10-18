import test from 'node:test';
import assert from 'node:assert/strict';
import { getActiveEmailProvider } from './email-service.ts';

test('email provider selection prefers Brevo when BREVO_API_KEY is set, falls back to ZeptoMail', () => {
  // No provider
  assert.equal(getActiveEmailProvider({}), null);
  assert.equal(getActiveEmailProvider({ ZEPTOMAIL_FROM_EMAIL: 'a@b.c' }), null);

  // ZeptoMail only
  assert.equal(
    getActiveEmailProvider({
      ZEPTOMAIL_SMTP_HOST: 'smtp.zeptomail.in',
      ZEPTOMAIL_SMTP_PORT: '587',
      ZEPTOMAIL_SMTP_USER: 'emailapikey',
      ZEPTOMAIL_SMTP_PASSWORD: 'secret',
    }),
    'zeptomail',
  );

  // Brevo preferred when both present
  assert.equal(
    getActiveEmailProvider({
      BREVO_API_KEY: 'xkeysib-abc1234567890',
      ZEPTOMAIL_SMTP_HOST: 'smtp.zeptomail.in',
      ZEPTOMAIL_SMTP_PORT: '587',
      ZEPTOMAIL_SMTP_USER: 'emailapikey',
      ZEPTOMAIL_SMTP_PASSWORD: 'secret',
    }),
    'brevo',
  );

  // Brevo alone
  assert.equal(
    getActiveEmailProvider({
      BREVO_API_KEY: 'xkeysib-abc1234567890',
    }),
    'brevo',
  );

  // Whitespace-only key does not count
  assert.equal(
    getActiveEmailProvider({
      BREVO_API_KEY: '   ',
      ZEPTOMAIL_SMTP_HOST: 'smtp.zeptomail.in',
      ZEPTOMAIL_SMTP_PORT: '587',
      ZEPTOMAIL_SMTP_USER: 'emailapikey',
      ZEPTOMAIL_SMTP_PASSWORD: 'secret',
    }),
    'zeptomail',
  );
});
