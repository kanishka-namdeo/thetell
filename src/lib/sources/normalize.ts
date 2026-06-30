const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
]);

export function normalizeUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  // Lowercase protocol + host
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();

  // Strip www. prefix
  if (parsed.hostname.startsWith("www.")) {
    parsed.hostname = parsed.hostname.slice(4);
  }

  // Strip trailing slashes from path
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";

  // Strip tracking params, sort remaining for stable output
  const params = new URLSearchParams(parsed.search);
  for (const key of Array.from(params.keys())) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      params.delete(key);
    }
  }
  const sorted = new URLSearchParams(
    Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b)),
  );
  parsed.search = sorted.toString() ? `?${sorted.toString()}` : "";

  return parsed.toString();
}
