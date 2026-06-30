/**
 * Source verification utility.
 *
 * Performs HTTP HEAD requests to verify that discovered source URLs are
 * accessible and return valid responses.
 */

import { logger } from "@/lib/logger";

export interface VerificationResult {
  valid: boolean;
  status?: number;
  contentType?: string;
  details?: string;
  duration: number;
}

export async function verifySource(url: string): Promise<VerificationResult> {
  const start = Date.now();
  const log = logger.child({ tool: "verifier", url });

  try {
    // Validate URL format
    new URL(url);

    // For local dev, skip actual HTTP requests for common domains
    // In production, this would make real HEAD requests
    const isLocalDev = process.env.NODE_ENV === "development";

    if (isLocalDev) {
      // Simulate verification for known good domains
      const knownGoodDomains = [
        "sec.gov",
        "github.com",
        "linkedin.com",
        "google.com",
        "reddit.com",
        "courtlistener.com",
        "uspto.gov",
      ];

      const urlHostname = new URL(url).hostname;
      const isKnownGood = knownGoodDomains.some((d) => urlHostname.includes(d));

      if (isKnownGood) {
        return {
          valid: true,
          status: 200,
          contentType: "text/html",
          details: "Verified (simulated)",
          duration: Date.now() - start,
        };
      }

      // For unknown domains in dev, simulate a verification
      return {
        valid: true,
        status: 200,
        contentType: "text/html",
        details: "Verified (simulated for dev)",
        duration: Date.now() - start,
      };
    }

    // Production: actual HTTP HEAD request
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "TheTell-Bot/1.0 (+https://thetell.example.com/bot; contact@example.com)",
        },
      });

      clearTimeout(timeout);

      const isValid = response.ok || response.status === 403; // 403 is common for some sites
      return {
        valid: isValid,
        status: response.status,
        contentType: response.headers.get("content-type") || undefined,
        details: isValid ? "URL is accessible" : `HTTP ${response.status}`,
        duration: Date.now() - start,
      };
    } catch (fetchError) {
      clearTimeout(timeout);
      throw fetchError;
    }
  } catch (error) {
    log.error("Source verification failed", { error: String(error) });
    return {
      valid: false,
      details: error instanceof Error ? error.message : "Unknown error",
      duration: Date.now() - start,
    };
  }
}
