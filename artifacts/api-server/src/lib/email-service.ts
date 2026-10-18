/**
 * Unified email service — selects Brevo HTTPS API or ZeptoMail SMTP based on env.
 *
 * Priority:
 *   1. BREVO_API_KEY present → Brevo HTTPS (works on Render Free, no SMTP ports)
 *   2. ZEPTOMAIL_* present   → ZeptoMail SMTP (legacy, needs port 465/587 open)
 *   3. Neither               → not configured (throws ZeptoMailError configuration)
 *
 * All call sites should use getEmailService() instead of getZeptoMailService().
 * getZeptoMailService() is kept as alias for backwards compat.
 */
import { createZeptoMailService, getZeptoMailService as getZeptoLegacy, ZeptoMailError, type EmailMessage } from "./email.ts";
import { createBrevoService } from "./brevo.ts";

export type EmailProvider = "brevo" | "zeptomail";
export type EmailService = {
  config: { fromEmail: string; fromName: string; contactTo: string; provider: EmailProvider };
  send(message: EmailMessage): Promise<void>;
};

function detectProvider(env: NodeJS.ProcessEnv): EmailProvider | null {
  const hasBrevoKey = Boolean(env["BREVO_API_KEY"]?.trim());
  if (hasBrevoKey) return "brevo";
  const hasZepto =
    Boolean(env["ZEPTOMAIL_SMTP_HOST"]?.trim()) &&
    Boolean(env["ZEPTOMAIL_SMTP_PORT"]?.trim()) &&
    Boolean(env["ZEPTOMAIL_SMTP_USER"]?.trim()) &&
    Boolean(env["ZEPTOMAIL_SMTP_PASSWORD"]?.trim());
  if (hasZepto) return "zeptomail";
  return null;
}

let sharedEmailService: EmailService | undefined;

export function getEmailService(): EmailService {
  if (sharedEmailService) return sharedEmailService;

  const provider = detectProvider(process.env);

  if (provider === "brevo") {
    const svc = createBrevoService(process.env, fetch);
    sharedEmailService = svc as unknown as EmailService;
    return sharedEmailService;
  }
  if (provider === "zeptomail") {
    const svc = createZeptoMailService();
    sharedEmailService = svc as unknown as EmailService;
    return sharedEmailService;
  }

  throw new ZeptoMailError("configuration");
}

/** Backwards compat — prefer getEmailService */
export function getZeptoMailService(): EmailService {
  return getEmailService();
}

export function getActiveEmailProvider(env: NodeJS.ProcessEnv = process.env): EmailProvider | null {
  return detectProvider(env);
}

/** Test helper — reset shared service */
export function __resetEmailServiceForTests(): void {
  sharedEmailService = undefined;
}

export function __setEmailServiceForTests(service: EmailService): void {
  sharedEmailService = service;
}

// Re-export for backwards compat
export { ZeptoMailError } from "./email.ts";
export type { EmailMessage } from "./email.ts";
