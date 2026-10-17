type EmailAction = { label: string; url: string };
type EmailTemplate = {
  preheader: string;
  title: string;
  greeting?: string;
  paragraphs: string[];
  action?: EmailAction;
  footerNote?: string;
};

export type RenderedEmail = { html: string; text: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

function htmlParagraph(value: string): string {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

/** Email-safe, responsive Ricoz branding with inline styles for mail clients. */
export function renderRicozEmail(template: EmailTemplate): RenderedEmail {
  const greeting = template.greeting ? `<p style="margin:0 0 18px;color:#171D2B;font-size:15px;line-height:1.6">${htmlParagraph(template.greeting)}</p>` : "";
  const paragraphs = template.paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px;color:#454B56;font-size:15px;line-height:1.7">${htmlParagraph(paragraph)}</p>`)
    .join("");
  const action = template.action
    ? `<tr><td style="padding:8px 0 22px"><a href="${escapeHtml(template.action.url)}" style="display:inline-block;padding:13px 22px;border-radius:7px;background:#B91F26;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">${escapeHtml(template.action.label)}</a></td></tr>`
    : "";
  const footerNote = template.footerNote
    ? `<p style="margin:16px 0 0;color:#737780;font-size:12px;line-height:1.6">${htmlParagraph(template.footerNote)}</p>`
    : "";
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#F7F8FA;font-family:Arial,Helvetica,sans-serif;color:#171D2B">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(template.preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden">
    <tr><td style="padding:22px 28px;background:#B91F26;color:#ffffff;font-size:18px;font-weight:800;letter-spacing:.04em">RICOZ <span style="font-size:11px;font-weight:500;letter-spacing:.12em">INNOVATION</span></td></tr>
    <tr><td style="padding:30px 28px 10px"><h1 style="margin:0 0 20px;color:#171D2B;font-size:23px;line-height:1.3">${escapeHtml(template.title)}</h1>${greeting}${paragraphs}</td></tr>
    ${action}
    <tr><td style="padding:0 28px 28px">${footerNote}<p style="margin:22px 0 0;padding-top:16px;border-top:1px solid #E5E7EB;color:#737780;font-size:12px;line-height:1.6">Ricoz Innovation<br>Questions? Contact <a href="mailto:care@ricoz.in" style="color:#A71920">care@ricoz.in</a></p></td></tr>
  </table>
</body>
</html>`;

  const text = [
    template.title,
    template.greeting,
    ...template.paragraphs,
    template.action ? `${template.action.label}: ${template.action.url}` : undefined,
    template.footerNote,
    "Ricoz Innovation · care@ricoz.in",
  ].filter((line): line is string => Boolean(line)).join("\n\n");
  return { html, text };
}

export function passwordResetTemplate(resetUrl: string, name: string): RenderedEmail {
  return renderRicozEmail({
    preheader: "Reset your Ricoz account password.",
    title: "Reset your password",
    greeting: `Hello ${name},`,
    paragraphs: [
      "We received a request to reset the password for your Ricoz account. Use the button below to choose a new password.",
      "This link expires in 30 minutes and can be used only once. If you did not request a reset, you can ignore this email; your password will not change.",
    ],
    action: { label: "Choose a new password", url: resetUrl },
    footerNote: "For your security, Ricoz will never ask you to reply with your password.",
  });
}

export function passwordChangedTemplate(name: string): RenderedEmail {
  return renderRicozEmail({
    preheader: "Your Ricoz account password was changed.",
    title: "Password changed",
    greeting: `Hello ${name},`,
    paragraphs: [
      "The password for your Ricoz account was changed successfully. Any other signed-in sessions have been ended.",
      "If you did not make this change, contact Ricoz support as soon as possible.",
    ],
  });
}

export function registrationReceivedTemplate(name: string, loginUrl: string): RenderedEmail {
  return renderRicozEmail({
    preheader: "We received your Ricoz shopper registration.",
    title: "Registration received",
    greeting: `Hello ${name},`,
    paragraphs: [
      "Thank you for registering as a Ricoz mystery shopper. Your profile is pending administrator review. We will email you when a decision is recorded.",
      "This is an acknowledgement, not an email-ownership verification. You do not need to take any action to sign in.",
    ],
    action: { label: "Open Ricoz", url: loginUrl },
  });
}

export function shopperVerificationTemplate(
  name: string,
  status: "verified" | "rejected",
  reason: string | null | undefined,
  workspaceUrl: string,
): RenderedEmail {
  const approved = status === "verified";
  return renderRicozEmail({
    preheader: approved ? "Your Ricoz shopper profile has been approved." : "There is an update to your Ricoz shopper profile.",
    title: approved ? "Shopper profile approved" : "Shopper profile update",
    greeting: `Hello ${name},`,
    paragraphs: approved
      ? ["Your mystery shopper profile has been approved. Eligible assignments will appear in your Ricoz workspace."]
      : [
          "Your mystery shopper profile was not approved at this time.",
          reason ? `Administrator note: ${reason}` : "Contact Ricoz support if you need more information.",
        ],
    action: { label: "Open your workspace", url: workspaceUrl },
  });
}

export function taskAssignmentTemplate(input: {
  name: string;
  storeName: string;
  visitDate: string;
  dueDate: string;
  workspaceUrl: string;
}): RenderedEmail {
  return renderRicozEmail({
    preheader: `A new visit assignment is ready at ${input.storeName}.`,
    title: "New visit assignment",
    greeting: `Hello ${input.name},`,
    paragraphs: [
      `A store visit has been assigned to you: ${input.storeName}.`,
      `Visit date: ${input.visitDate}\nReport due: ${input.dueDate}`,
      "Sign in to view the task instructions and questionnaire.",
    ],
    action: { label: "View my assignments", url: input.workspaceUrl },
  });
}

export function reportReviewedTemplate(input: {
  name: string;
  storeName: string;
  status: "approved" | "rejected" | "needs_correction";
  comment?: string | null;
  reportUrl: string;
}): RenderedEmail {
  const labels = {
    approved: "approved",
    rejected: "not approved",
    needs_correction: "returned for correction",
  } as const;
  const paragraphs = [`Your report for ${input.storeName} was ${labels[input.status]}.`];
  if (input.comment) paragraphs.push(`Reviewer note: ${input.comment}`);
  if (input.status === "needs_correction") {
    paragraphs.push("Please sign in to review the feedback and update your report.");
  }
  return renderRicozEmail({
    preheader: `A review decision is available for your ${input.storeName} report.`,
    title: "Report review update",
    greeting: `Hello ${input.name},`,
    paragraphs,
    action: { label: "View report", url: input.reportUrl },
  });
}

export function contactEnquiryTemplate(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): RenderedEmail {
  return renderRicozEmail({
    preheader: "A new enquiry was submitted through the Ricoz website.",
    title: "New website enquiry",
    greeting: "Ricoz support team,",
    paragraphs: [
      `From: ${input.name} <${input.email}>`,
      `Subject: ${input.subject}`,
      `Message:\n${input.message}`,
    ],
    footerNote: "Reply to this message to respond to the sender.",
  });
}
