// Load a package-local .env for local development before application modules read configuration.
import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";

function diagnosticForMissingEnv(): void {
  const required = ["DATABASE_URL", "PUBLIC_APP_URL"];
  const smtpVars = [
    "ZEPTOMAIL_SMTP_HOST",
    "ZEPTOMAIL_SMTP_PORT",
    "ZEPTOMAIL_SMTP_USER",
    "ZEPTOMAIL_SMTP_PASSWORD",
    "ZEPTOMAIL_FROM_EMAIL",
    "ZEPTOMAIL_FROM_NAME",
    "ZEPTOMAIL_CONTACT_TO",
  ];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    logger.warn(
      { missing },
      "Missing required environment variables — some features will not work until they are set",
    );
  }
  const missingSmtp = smtpVars.filter((key) => !process.env[key]?.trim());
  if (missingSmtp.length) {
    logger.warn(
      { missing: missingSmtp },
      "ZeptoMail SMTP is not fully configured — email delivery is disabled until all SMTP variables are set",
    );
  } else {
    const port = Number(process.env.ZEPTOMAIL_SMTP_PORT);
    if (![465, 587].includes(port)) {
      logger.warn({ ZEPTOMAIL_SMTP_PORT: process.env.ZEPTOMAIL_SMTP_PORT }, "ZEPTOMAIL_SMTP_PORT must be 465 or 587");
    }
  }
  if (process.env.PUBLIC_APP_URL) {
    try {
      const u = new URL(process.env.PUBLIC_APP_URL);
      if (process.env.NODE_ENV === "production" && u.protocol !== "https:") {
        logger.warn("PUBLIC_APP_URL must use https in production");
      }
    } catch {
      logger.warn("PUBLIC_APP_URL is not a valid URL");
    }
  }
}

diagnosticForMissingEnv();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid PORT value: "${rawPort}". Use an integer from 1 to 65535.`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, publicAppUrl: process.env.PUBLIC_APP_URL ?? null }, "Server listening");
});
