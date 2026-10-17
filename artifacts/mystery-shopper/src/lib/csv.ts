/** Escape a CSV cell and prefix formula-leading characters for spreadsheet safety. */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  let text = String(value);
  if (/^[\u0000-\u0020\uFEFF]*[=+\-@]/.test(text)) text = `'${text}`;
  if (/["\n\r,]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function csvRow(values: readonly unknown[]): string {
  return `${values.map(csvCell).join(",")}\r\n`;
}
