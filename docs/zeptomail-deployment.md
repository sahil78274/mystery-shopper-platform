# ZeptoMail SMTP deployment and verification

Ricoz mail is sent only by the API server through Nodemailer. The browser receives neither SMTP configuration nor credentials. Port **587** is configured with `secure: false` and mandatory STARTTLS (`requireTLS: true`).

## Before production

1. **Rotate the ZeptoMail password that was previously shared.** Do not reuse it. Do not place the replacement in Git, chat, client-side variables, or this document.
2. In ZeptoMail, verify that `care@ricoz.in` is an approved sender and that the `ricoz.in` domain's required SPF/DKIM records and delivery settings are verified. Confirm the ZeptoMail account/region uses `smtp.zeptomail.in` and is allowed to send from this address.
3. Set `PUBLIC_APP_URL` to the public origin that serves the Ricoz web application. It must resolve the `/reset-password`, `/login`, `/my-work`, and `/submissions/:id` routes. In production it must use HTTPS.
4. Review and apply the password-reset-token database migration in staging before deploying the API. See [`../lib/db/zeptomail-password-reset-migration.md`](../lib/db/zeptomail-password-reset-migration.md). Do not use production `drizzle-kit push` as a substitute for a reviewed migration.

## Configure Render manually

Render could not be configured through the available workspace integration. An authorized operator must make these changes in the Render Dashboard:

1. Open the Render **Web Service that runs `@workspace/api-server`** (not the static/frontend service).
2. Open **Environment** and add the following service variables exactly as shown:

   | Variable | Value |
   | --- | --- |
   | `ZEPTOMAIL_SMTP_HOST` | `smtp.zeptomail.in` |
   | `ZEPTOMAIL_SMTP_PORT` | `587` |
   | `ZEPTOMAIL_SMTP_USER` | `emailapikey` |
   | `ZEPTOMAIL_SMTP_PASSWORD` | Store the rotated password using Render's protected/secret environment-variable UI. Never put it in a client build or source file. |
   | `ZEPTOMAIL_FROM_EMAIL` | `care@ricoz.in` |
   | `ZEPTOMAIL_FROM_NAME` | `Ricoz Innovation` |
   | `ZEPTOMAIL_CONTACT_TO` | `care@ricoz.in` |
   | `PUBLIC_APP_URL` | The actual HTTPS public origin of the Ricoz web application (not the API URL). |

3. Leave Render-managed `PORT` and existing `DATABASE_URL` settings intact. Do not add SMTP variables to the frontend/static site.
4. Save and redeploy the API service after the migration has been applied.
5. From a real Ricoz account, exercise a password-reset request and use the received link. Also test the public contact form, a newly assigned/reassigned task, a final review decision, and a shopper approval/rejection. Verify sender identity, SPF/DKIM alignment, delivery, links, and mobile rendering with the intended recipients. Do not use a production account or real inbox for destructive/reset testing without authorization.

## Local development

Copy `artifacts/api-server/.env.example` to `artifacts/api-server/.env` and set local `DATABASE_URL` / `PUBLIC_APP_URL`. The API loads this package-local `.env` with `dotenv/config`; the file is ignored by Git. The SMTP password remains blank in the example and is optional for booting, but actual delivery requires the separately supplied secret. Without working SMTP, contact requests return a safe delivery error; password-recovery requests retain the same generic response to avoid account discovery.

Mocked SMTP tests do not contact ZeptoMail. They validate configuration, STARTTLS options, and sanitized transport failure handling.

## Mail behavior and operations

- Shopper registration keeps its current immediate-session and administrator-approval behavior. The acknowledgement says the profile is pending; it is **not** an email-ownership verification and does not add a login gate.
- Password recovery uses a cryptographically random token, stores only its SHA-256 hash, expires after 30 minutes, and can be consumed once. The link carries the token in a URL fragment so it is not sent in HTTP requests or access-log URLs; the reset page removes it from the address bar after capture. Successful reset invalidates all existing sessions and triggers a password-change notice. Passwords are never emailed.
- Contact requests are validated server-side and limited to 5 per client IP per 15 minutes. Password-reset requests are limited per IP (5/hour) and per normalized email (3/hour; the email key is hashed in memory); reset submissions are limited to 10 per IP per 15 minutes. The current fixed-window limiters are process-local; horizontally scaled deployments should add a shared limiter at the edge or in a shared store.
- Assignment notices are emitted only on a new assignment or actual reassignment while the task is `assigned`; review mail is emitted only on a successful final decision, and approval mail only when shopper verification status changes. Re-saving the same state does not send another notice. These workflow notifications are best-effort after the core database mutation, with no durable outbox/retry; a delivery warning does not roll back the assignment, review, or approval.
- SMTP errors are reduced to a safe category/code in logs. Do not add recipient addresses, message content, SMTP response text, passwords, session tokens, or reset tokens to logs.

## Checks after deployment

Monitor API logs for the safe `Email delivery failed` warning and its category/code only. A missing or malformed SMTP setting is reported as a configuration failure without including the secret. Confirm the application still supports existing login and role workflows; this integration does not require email OTP, SMS OTP, or mandatory email verification.
