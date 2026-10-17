const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis"]);
const HEIF_BRANDS = new Set([...HEIC_BRANDS, "mif1", "msf1"]);

function beginsWith(bytes: Buffer, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function matchesImageSignature(bytes: Buffer, mimeType: string): boolean {
  switch (mimeType) {
    case "image/jpeg":
      return beginsWith(bytes, JPEG_SIGNATURE);
    case "image/png":
      return beginsWith(bytes, PNG_SIGNATURE);
    case "image/webp":
      return (
        bytes.length >= 12 &&
        bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP"
      );
    case "image/heic":
    case "image/heif": {
      if (bytes.length < 16 || bytes.toString("ascii", 4, 8) !== "ftyp") return false;
      const compatibleBrands = bytes.toString("ascii", 8, Math.min(bytes.length, 64));
      const allowedBrands = mimeType === "image/heic" ? HEIC_BRANDS : HEIF_BRANDS;
      return [...allowedBrands].some((brand) => compatibleBrands.includes(brand));
    }
    default:
      return false;
  }
}

/** Decode strict Base64 (or a matching image data URL) and verify its signature. */
export function decodeImageEvidence(data: string, mimeType: string): Buffer | null {
  let encoded = data;
  if (data.startsWith("data:")) {
    const match = /^data:([^;,]+);base64,([\s\S]*)$/i.exec(data);
    if (!match || match[1].toLowerCase() !== mimeType) return null;
    encoded = match[2];
  }

  const compact = encoded.replace(/\s/g, "");
  if (!compact || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) return null;
  if (compact.length % 4 === 1 || (compact.includes("=") && compact.length % 4 !== 0)) return null;

  const padded = compact.padEnd(Math.ceil(compact.length / 4) * 4, "=");
  const bytes = Buffer.from(padded, "base64");
  if (!bytes.length || bytes.toString("base64") !== padded) return null;
  return matchesImageSignature(bytes, mimeType) ? bytes : null;
}
