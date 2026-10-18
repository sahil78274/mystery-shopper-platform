/**
 * Brevo (Sendinblue) transactional email via HTTPS API.
 * Uses https://api.brevo.com/v3/smtp/email — avoids SMTP port blocking on Render Free.
 *
 * Configure via:
 *   BREVO_API_KEY=xkeysib-...   (Brevo > SMTP & API > API Keys > Create)
 *   ZEPTOMAIL_FROM_EMAIL / ZEPTOMAIL_FROM_NAME / ZEPTOMAIL_CONTACT_TO (reused for sender)
 *
 * Sender address must be verified in Brevo (Senders > Add sender, verify DNS).
 * See docs/RENDER_DEPLOYMENT.md and docs/zeptomail-deployment.md for setup steps.
 */
import { ZeptoMailError, type EmailMessage } from "./email.ts";

export type BrevoConfig = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  contactTo: string;
};

function requiredValue(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new ZeptoMailError("configuration");
  return value;
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function readBrevoConfig(env: NodeJS.ProcessEnv = process.env): BrevoConfig {
  const apiKey = requiredValue(env, "BREVO_API_KEY");
  if (apiKey.length < 10) throw new ZeptoMailError("configuration");

  const fromEmail = requiredValue(env, "ZEPTOMAIL_FROM_EMAIL");
  const fromName = requiredValue(env, "ZEPTOMAIL_FROM_NAME");
  const contactTo = requiredValue(env, "ZEPTOMAIL_CONTACT_TO");
  if (!validEmail(fromEmail) || !validEmail(contactTo) || fromName.length > 100 || /[\r\n]/.test(fromName)) {
    throw new ZeptoMailError("configuration");
  }

  return { apiKey, fromEmail, fromName, contactTo };
}

type BrevoPayload = {
  sender: { email: string; name: string };
  to: Array<{ email: string }>;
  subject: string;
  htmlContent: string;
  textContent: string;
  replyTo?: { email: string };
};

export type BrevoFetch = typeof fetch;

function buildPayload(config: BrevoConfig, message: EmailMessage): BrevoPayload {
  const payload: BrevoPayload = {
    sender: { email: config.fromEmail, name: config.fromName },
    to: [{ email: message.to }],
    subject: message.subject,
    htmlContent: message.html,
    textContent: message.text,
  };
  const replyTo = (message as EmailMessage & { replyTo?: string }).replyTo;
  if (replyTo && typeof replyTo === "string" && validEmail(replyTo.trim())) {
    payload.replyTo = { email: replyTo.trim() };
  }
  return payload;
}

export function createBrevoService(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: BrevoFetch = fetch,
) {
  const config = readBrevoConfig(env);

  return {
    config: { ...config, provider: "brevo" as const },
    async send(message: EmailMessage): Promise<void> {
      const payload = buildPayload(config, message);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      let response: Response;
      try {
        response = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "api-key": config.apiKey,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch (error) {
        const err = error as { name?: string; code?: string };
        console.error("[Brevo diagnostic]", {
          code: err.code ?? err.name ?? "UNKNOWN",
          status: null,
        });
        throw new ZeptoMailError("delivery");
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        console.error("[Brevo diagnostic]", {
          code: "BREVO_API_ERROR",
          status: response.status,
        });
        throw new ZeptoMailError("delivery");
      }
    },
  };
}

export function isBrevoConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    readBrevoConfig(env);
    return true;
  } catch {
    return false;
  }
}
