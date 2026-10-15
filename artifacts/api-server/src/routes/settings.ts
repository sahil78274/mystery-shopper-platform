import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetSettingsPreferencesResponse,
  UpdateSettingsPreferencesBody,
  UpdateSettingsPreferencesResponse,
} from "@workspace/api-zod";
import {
  browserPreferencesTable,
  db,
  DEFAULT_BROWSER_PREFERENCES,
} from "@workspace/db";

const router: IRouter = Router();
const preferenceCookieName = "fieldnote_preferences";
const preferenceCookieMaxAge = 365 * 24 * 60 * 60 * 1000;
const preferenceCookiePath = "/api/settings/preferences";

function getBrowserKeyHash(req: Request, res: Response): string {
  const existingToken = req.cookies?.[preferenceCookieName];
  const token =
    typeof existingToken === "string" && /^[A-Za-z0-9_-]{43}$/.test(existingToken)
      ? existingToken
      : randomBytes(32).toString("base64url");

  const forwardedProtocol = req
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim()
    .toLowerCase();
  res.cookie(preferenceCookieName, token, {
    httpOnly: true,
    maxAge: preferenceCookieMaxAge,
    path: preferenceCookiePath,
    sameSite: "lax",
    secure: req.secure || forwardedProtocol === "https",
  });

  return createHash("sha256").update(token).digest("hex");
}

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

router.get("/settings/preferences", async (req, res): Promise<void> => {
  const browserKeyHash = getBrowserKeyHash(req, res);
  const [saved] = await db
    .select({
      timezone: browserPreferencesTable.timezone,
      dateFormat: browserPreferencesTable.dateFormat,
      timeFormat: browserPreferencesTable.timeFormat,
    })
    .from(browserPreferencesTable)
    .where(eq(browserPreferencesTable.browserKeyHash, browserKeyHash));

  res.json(
    GetSettingsPreferencesResponse.parse({
      scope: "browser",
      ...(saved ?? DEFAULT_BROWSER_PREFERENCES),
    }),
  );
});

router.put("/settings/preferences", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsPreferencesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isIanaTimezone(parsed.data.timezone)) {
    res.status(400).json({ error: "Choose a valid IANA time zone." });
    return;
  }

  const browserKeyHash = getBrowserKeyHash(req, res);
  const [saved] = await db
    .insert(browserPreferencesTable)
    .values({
      browserKeyHash,
      timezone: parsed.data.timezone,
      dateFormat: parsed.data.dateFormat,
      timeFormat: parsed.data.timeFormat,
    })
    .onConflictDoUpdate({
      target: browserPreferencesTable.browserKeyHash,
      set: {
        timezone: parsed.data.timezone,
        dateFormat: parsed.data.dateFormat,
        timeFormat: parsed.data.timeFormat,
        updatedAt: new Date(),
      },
    })
    .returning({
      timezone: browserPreferencesTable.timezone,
      dateFormat: browserPreferencesTable.dateFormat,
      timeFormat: browserPreferencesTable.timeFormat,
    });

  res.json(
    UpdateSettingsPreferencesResponse.parse({
      scope: "browser",
      ...saved,
    }),
  );
});

export default router;
