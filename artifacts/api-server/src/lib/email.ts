import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";

export type ZeptoMailConfig = {
  host: string;
  port: 587;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
  contactTo: string;
};

type SmtpTransportOptions = {
  host: string;
  port: number;
  secure: false;
  requireTLS: true;
  auth: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
  tls: { minVersion: "TLSv1.2" };
};

type MailTransport = Pick<Transporter, "sendMail">;
type TransportFactory = (options: SmtpTransportOptions) => MailTransport;
export type EmailMessage = Omit<SendMailOptions, "from"> & {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailFailureCode = "configuration" | "delivery";

/** Safe, deliberately detail-free SMTP errors for API responses and logs. */
export class ZeptoMailError extends Error {
  readonly code: EmailFailureCode;

  constructor(code: EmailFailureCode) {
    super(code === "configuration" ? "Email service is not configured." : "Email could not be delivered.");
    this.name = "ZeptoMailError";
    this.code = code;
  }
}

function requiredValue(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new ZeptoMailError("configuration");
  return value;
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Validate every SMTP setting before creating a transport. Never default a secret. */
export function readZeptoMailConfig(env: NodeJS.ProcessEnv = process.env): ZeptoMailConfig {
  const host = requiredValue(env, "ZEPTOMAIL_SMTP_HOST");
  const rawPort = requiredValue(env, "ZEPTOMAIL_SMTP_PORT");
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port !== 587) throw new ZeptoMailError("configuration");

  const user = requiredValue(env, "ZEPTOMAIL_SMTP_USER");
  const password = env["ZEPTOMAIL_SMTP_PASSWORD"];
  if (!password || !password.trim()) throw new ZeptoMailError("configuration");
  const fromEmail = requiredValue(env, "ZEPTOMAIL_FROM_EMAIL");
  const fromName = requiredValue(env, "ZEPTOMAIL_FROM_NAME");
  const contactTo = requiredValue(env, "ZEPTOMAIL_CONTACT_TO");
  if (
    !validEmail(fromEmail) ||
    !validEmail(contactTo) ||
    fromName.length > 100 ||
    /[\r\n]/.test(fromName)
  ) {
    throw new ZeptoMailError("configuration");
  }

  return { host, port: 587, user, password, fromEmail, fromName, contactTo };
}

/**
 * Create an isolated service instance so tests can supply an in-memory transport.
 * TLS is always upgraded with STARTTLS on port 587; implicit TLS is not used.
 */
export function createZeptoMailService(
  env: NodeJS.ProcessEnv = process.env,
  transportFactory: TransportFactory = (options) => nodemailer.createTransport(options),
) {
  const config = readZeptoMailConfig(env);
  const transport = transportFactory({
    host: config.host,
    port: config.port,
    secure: false,
    requireTLS: true,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    tls: { minVersion: "TLSv1.2" },
  });

  return {
    config,
    async send(message: EmailMessage): Promise<void> {
      try {
        await transport.sendMail({
          ...message,
          from: { name: config.fromName, address: config.fromEmail },
        });
      } catch {
        // Nodemailer errors may include server responses or auth context. Do not
        // attach the original error or expose its message outside this module.
        throw new ZeptoMailError("delivery");
      }
    },
  };
}

let sharedService: ReturnType<typeof createZeptoMailService> | undefined;

/** Lazily validate configuration so an unconfigured local app can still boot. */
export function getZeptoMailService() {
  sharedService ??= createZeptoMailService();
  return sharedService;
}

export type EmailCategory = "contact" | "account" | "assignment" | "review" | "security";

