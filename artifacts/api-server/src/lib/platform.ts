import { db, activityLogsTable } from "@workspace/db";

export function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** `YYYY-MM-DD` for date columns, whatever the driver hands back. */
export function calendarDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export async function recordActivity(
  action: string,
  entityType: string,
  entityId: number,
  description: string,
  actorUserId?: number | null,
): Promise<void> {
  await db.insert(activityLogsTable).values({
    action,
    entityType,
    entityId,
    description,
    actorUserId: actorUserId ?? null,
  });
}

export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (typeof current === "object" && current !== null) {
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

export function isForeignKeyViolation(error: unknown): boolean {
  let current: unknown = error;
  while (typeof current === "object" && current !== null) {
    if ("code" in current && (current.code === "23503" || current.code === "23502")) return true;
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Escapes a value for a CSV cell and neutralises spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/["\n\r,]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function csvRow(values: unknown[]): string {
  return `${values.map(csvCell).join(",")}\r\n`;
}
