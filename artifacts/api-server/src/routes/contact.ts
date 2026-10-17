import { Router, type IRouter } from "express";
import { SubmitContactFormBody, SubmitContactFormResponse } from "@workspace/api-zod";
import { sendContactEnquiry } from "../lib/email-notifications";
import { rateLimitByIp } from "../lib/rate-limit";
import { normalizeTextFields } from "../lib/validation";

const router: IRouter = Router();
const contactRateLimit = rateLimitByIp(
  5,
  15 * 60 * 1000,
  "Too many enquiries from this address. Please try again later.",
);

router.post("/contact", contactRateLimit, async (req, res): Promise<void> => {
  const normalized = normalizeTextFields(req.body, ["name", "email", "subject", "message"]);
  const sanitized = {
    ...normalized,
    name: typeof normalized?.name === "string" ? normalized.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : normalized?.name,
    email: typeof normalized?.email === "string" ? normalized.email.trim().toLowerCase() : normalized?.email,
    subject: typeof normalized?.subject === "string" ? normalized.subject.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : normalized?.subject,
    message: typeof normalized?.message === "string" ? normalized.message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim() : normalized?.message,
  };
  const parsed = SubmitContactFormBody.safeParse(sanitized);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const input = parsed.data;
  const delivered = await sendContactEnquiry(input);
  if (!delivered) {
    res.status(503).json({ error: "Your message could not be sent right now. Please try again later." });
    return;
  }
  res.status(202).json(
    SubmitContactFormResponse.parse({ message: "Your message has been sent. Thank you for contacting Ricoz." }),
  );
});

export default router;
