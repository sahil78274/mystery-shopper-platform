export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function validDateRange(from?: string, to?: string): boolean {
  if (from && !validDate(from)) return false;
  if (to && !validDate(to)) return false;
  return !from || !to || from <= to;
}

/** Trim selected text values before generated Zod validation. */
export function normalizeTextFields<T>(
  input: T,
  fields: readonly string[],
  emptyAsNull: readonly string[] = [],
): T {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return input;

  const result: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  for (const field of fields) {
    const value = result[field];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    result[field] = trimmed === "" && emptyAsNull.includes(field) ? null : trimmed;
  }
  return result as T;
}
