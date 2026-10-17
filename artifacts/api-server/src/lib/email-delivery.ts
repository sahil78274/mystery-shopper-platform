import { logger } from "./logger";
import {
  getZeptoMailService,
  ZeptoMailError,
  type EmailCategory,
  type EmailMessage,
} from "./email";

/** Fire a best-effort notification without leaking addresses, tokens, or SMTP diagnostics. */
export async function sendEmailSafely(
  message: EmailMessage | (() => EmailMessage),
  category: EmailCategory,
): Promise<boolean> {
  try {
    const readyMessage = typeof message === "function" ? message() : message;
    await getZeptoMailService().send(readyMessage);
    return true;
  } catch (error) {
    const code = error instanceof ZeptoMailError ? error.code : "delivery";
    logger.warn({ category, emailError: code }, "Email delivery failed");
    return false;
  }
}
