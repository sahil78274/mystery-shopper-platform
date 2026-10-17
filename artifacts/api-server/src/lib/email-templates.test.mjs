import test from 'node:test';
import assert from 'node:assert/strict';
import { contactEnquiryTemplate, passwordResetTemplate } from './email-templates.ts';

test('email templates escape user-controlled content and keep passwords out of security messages', () => {
  const reset = passwordResetTemplate('https://ricoz.example/reset-password?token=example', '<Asha>');
  assert.match(reset.html, /Hello &lt;Asha&gt;/);
  assert.match(reset.html, /expires in 30 minutes/);
  assert.doesNotMatch(reset.text, /temporary password/i);

  const contact = contactEnquiryTemplate({
    name: '<script>alert(1)</script>',
    email: 'asha@example.com',
    subject: 'Website question',
    message: '<img src=x onerror=alert(1)>',
  });
  assert.doesNotMatch(contact.html, /<script>|<img src=x/);
  assert.match(contact.html, /&lt;script&gt;/);
  assert.match(contact.html, /&lt;img src=x/);
});
