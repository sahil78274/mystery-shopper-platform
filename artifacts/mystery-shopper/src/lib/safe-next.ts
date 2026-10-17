const FALLBACK_PATH = "/";

export function safeNextPath(next: string | null, origin = "https://ricoz.invalid"): string {
  if (!next || !next.startsWith("/") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return FALLBACK_PATH;
  try {
    const destination = new URL(next, origin);
    if (destination.origin !== new URL(origin).origin) return FALLBACK_PATH;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return FALLBACK_PATH;
  }
}
