import { createHash } from "crypto";

const TRACKING_PARAM_PREFIXES = [
  "utm_",
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "twclid",
  "li_fat_id",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "_gac",
  "igshid",
  "ref",
  "ref_src",
  "ref_url",
  "source",
  "s",
  "share",
  "spm",
  "hsCta",
  "hubs_content",
  "__s",
  "hsa_",
  "nm",
  "ncid",
  "cid",
  "oid",
  "trk",
  "trkInfo",
];

const TRACKING_PARAM_EXACT = new Set([
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "twclid",
  "li_fat_id",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "_gac",
  "igshid",
  "ref",
  "source",
  "s",
  "spm",
  "nm",
  "ncid",
  "cid",
  "oid",
  "trk",
]);

/**
 * Strip known tracking / analytics query parameters from a URL's search params.
 */
function stripTrackingParams(searchParams: URLSearchParams): URLSearchParams {
  const cleaned = new URLSearchParams();

  for (const [key, value] of searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    const isTracking =
      TRACKING_PARAM_EXACT.has(lowerKey) ||
      TRACKING_PARAM_PREFIXES.some((prefix) => lowerKey.startsWith(prefix));
    if (!isTracking) {
      cleaned.append(key, value);
    }
  }

  return cleaned;
}

/**
 * Normalize a URL for deduplication:
 * - Lowercase scheme and host
 * - Strip www. prefix
 * - Remove default ports (80 for http, 443 for https)
 * - Remove trailing slashes from pathname
 * - Strip fragment / hash
 * - Remove tracking query parameters
 * - Sort remaining query parameters alphabetically
 */
export function normalizeUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  // Lowercase scheme and host
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();

  // Strip www prefix
  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice(4);
  }

  // Remove default ports
  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  ) {
    url.port = "";
  }

  // Remove trailing slash from pathname (but keep "/" for root)
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  // Strip fragment
  url.hash = "";

  // Clean query params
  const cleanedParams = stripTrackingParams(url.searchParams);
  const sortedEntries = [...cleanedParams.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  url.search = new URLSearchParams(sortedEntries).toString();

  return url.toString();
}

/**
 * Compute a SHA-256 content hash from a normalized URL and raw content.
 * Used for deduplication of signals.
 */
export function computeContentHash(
  normalizedUrl: string,
  rawContent: string,
): string {
  const payload = `${normalizedUrl}::${rawContent}`;
  return createHash("sha256").update(payload).digest("hex");
}
