export type SafeRequestBodyError = {
  status: 400 | 413 | 415;
  message: string;
  type: string;
};

/** Classify parser failures without returning or logging the supplied body. */
export function classifyRequestBodyError(error: unknown): SafeRequestBodyError | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { type?: unknown };
  if (value.type === "entity.too.large") {
    return { status: 413, message: "The request body is too large.", type: "entity.too.large" };
  }
  if (value.type === "entity.parse.failed") {
    return { status: 400, message: "The request body is not valid JSON or form data.", type: "entity.parse.failed" };
  }
  if (value.type === "encoding.unsupported" || value.type === "charset.unsupported") {
    return { status: 415, message: "The request body encoding is not supported.", type: String(value.type) };
  }
  return null;
}
