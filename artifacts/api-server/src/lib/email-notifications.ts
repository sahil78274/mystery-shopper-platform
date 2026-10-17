import {
  contactEnquiryTemplate,
  passwordChangedTemplate,
  passwordResetTemplate,
  registrationReceivedTemplate,
  reportReviewedTemplate,
  shopperVerificationTemplate,
  taskAssignmentTemplate,
} from "./email-templates";
import { getZeptoMailService, ZeptoMailError } from "./email";
import { sendEmailSafely } from "./email-delivery";
import { passwordResetUrl } from "./password-reset";

function appUrl(path: string): string {
  const raw = process.env.PUBLIC_APP_URL?.trim();
  if (!raw) throw new ZeptoMailError("configuration");
  try {
    const base = new URL(raw);
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      (process.env.NODE_ENV === "production" && base.protocol !== "https:")
    ) {
      throw new Error("Invalid public URL");
    }
    return new URL(path, base).toString();
  } catch {
    throw new ZeptoMailError("configuration");
  }
}

function message(to: string, subject: string, rendered: { text: string; html: string }) {
  return { to, subject, text: rendered.text, html: rendered.html };
}

export function sendRegistrationNotice(email: string, name: string): Promise<boolean> {
  return sendEmailSafely(() => message(
    email,
    "Ricoz shopper registration received",
    registrationReceivedTemplate(name, appUrl("/login")),
  ), "account");
}

export function sendShopperVerificationNotice(input: {
  email: string;
  name: string;
  status: "verified" | "rejected";
  reason?: string | null;
}): Promise<boolean> {
  return sendEmailSafely(() => message(
    input.email,
    input.status === "verified" ? "Your Ricoz shopper profile is approved" : "Update to your Ricoz shopper profile",
    shopperVerificationTemplate(input.name, input.status, input.reason, appUrl("/my-work")),
  ), "account");
}

export function sendPasswordResetNotice(email: string, name: string, token: string): Promise<boolean> {
  return sendEmailSafely(() => {
    const resetUrl = passwordResetUrl(appUrl("/"), token);
    return message(email, "Reset your Ricoz password", passwordResetTemplate(resetUrl, name));
  }, "security");
}

export function sendPasswordChangedNotice(email: string, name: string): Promise<boolean> {
  return sendEmailSafely(() => message(
    email,
    "Your Ricoz password was changed",
    passwordChangedTemplate(name),
  ), "security");
}

export function sendTaskAssignmentNotice(input: {
  email: string;
  name: string;
  storeName: string;
  visitDate: string;
  dueDate: string;
}): Promise<boolean> {
  return sendEmailSafely(() => message(
    input.email,
    "New Ricoz mystery-shopper assignment",
    taskAssignmentTemplate({ ...input, workspaceUrl: appUrl("/my-work") }),
  ), "assignment");
}

export function sendReportReviewNotice(input: {
  email: string;
  name: string;
  storeName: string;
  submissionId: number;
  status: "approved" | "rejected" | "needs_correction";
  comment?: string | null;
}): Promise<boolean> {
  return sendEmailSafely(() => message(
    input.email,
    "Your Ricoz report review is complete",
    reportReviewedTemplate({
      ...input,
      reportUrl: appUrl(`/submissions/${input.submissionId}`),
    }),
  ), "review");
}

export function sendContactEnquiry(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<boolean> {
  return sendEmailSafely(() => {
    const rendered = contactEnquiryTemplate(input);
    const recipient = getZeptoMailService().config.contactTo;
    return {
      ...message(recipient, "New Ricoz website enquiry", rendered),
      replyTo: input.email,
    };
  }, "contact");
}
