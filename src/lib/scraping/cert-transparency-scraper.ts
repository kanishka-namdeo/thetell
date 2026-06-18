/**
 * Certificate Transparency scraper for tracking infrastructure changes.
 * Monitors new subdomains and certificate issuance patterns via crt.sh.
 * Signal value: infrastructure changes, new product launches (ai.company.com),
 * cloud migrations.
 */

import { z } from "zod";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";
import { normalizeUrl, computeContentHash } from "./url-normalizer";

/**
 * Signal type representing a certificate transparency event.
 */
export interface CertificateTransparencySignal {
  id: string;
  type: "new_subdomain" | "certificate_issued";
  domain: string;
  subdomain: string;
  url: string;
  title: string;
  description: string;
  publishedAt: Date;
  metadata: Record<string, string | number | boolean>;
  contentHash: string;
}

/**
 * crt.sh API certificate entry schema.
 */
const CrtShEntrySchema = z.object({
  id: z.number(),
  issuer_ca_id: z.number(),
  issuer_name: z.string(),
  common_name: z.string(),
  name_value: z.string(),
  not_before: z.string(),
  not_after: z.string(),
  serial_number: z.string(),
});

export class CertTransparencyScraper extends BaseScraper {
  private readonly crtShBase = "https://crt.sh";

  constructor() {
    // crt.sh rate limit: ~60 requests/minute
    // Use conservative rate: 1 request/second
    super(1.0, 30000, 3, 3600); // 1 hour cache
  }

  /**
   * Scrape certificate transparency logs for a domain.
   * @param domain - Company domain (e.g., "example.com")
   */
  async scrape(domain: string): Promise<CertificateTransparencySignal[]> {
    logger.info("Starting certificate transparency scrape", { domain });

    const signals: CertificateTransparencySignal[] = [];

    try {
      const certs = await this.fetchCertificates(domain);
      if (certs) {
        signals.push(...this.processCertificates(domain, certs));
      }

      logger.info("Certificate transparency scrape completed", {
        domain,
        signalCount: signals.length,
      });
    } catch (error) {
      logger.error("Certificate transparency scrape failed", {
        domain,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return signals;
  }

  /**
   * Fetch certificates from crt.sh for a domain.
   */
  private async fetchCertificates(
    domain: string
  ): Promise<z.infer<typeof CrtShEntrySchema>[] | null> {
    const url = `${this.crtShBase}/?q=%25.${domain}&output=json`;
    const text = await this.fetch(url);

    if (!text) {
      logger.warn("Failed to fetch certificates from crt.sh", { domain });
      return null;
    }

    try {
      const data = JSON.parse(text);
      return z.array(CrtShEntrySchema).parse(data);
    } catch (error) {
      logger.error("Failed to parse crt.sh response", {
        domain,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Process certificates into signals.
   */
  private processCertificates(
    domain: string,
    certs: z.infer<typeof CrtShEntrySchema>[]
  ): CertificateTransparencySignal[] {
    const signals: CertificateTransparencySignal[] = [];
    const recentCerts = certs.filter((cert) => {
      const issuedDate = new Date(cert.not_before);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return issuedDate > thirtyDaysAgo;
    });

    for (const cert of recentCerts) {
      const subdomain = this.extractSubdomain(cert.common_name, domain);
      const normalizedUrl = normalizeUrl(`https://${cert.common_name}`);
      const content = JSON.stringify({
        id: cert.id,
        common_name: cert.common_name,
        not_before: cert.not_before,
        serial: cert.serial_number,
      });

      signals.push({
        id: `cert-${cert.id}`,
        type: "certificate_issued",
        domain,
        subdomain,
        url: `https://${cert.common_name}`,
        title: `Certificate issued: ${cert.common_name}`,
        description: `New SSL certificate issued for ${cert.common_name}`,
        publishedAt: new Date(cert.not_before),
        metadata: {
          issuer: cert.issuer_name,
          serial: cert.serial_number,
          validFrom: cert.not_before,
          validTo: cert.not_after,
          subdomain,
        },
        contentHash: computeContentHash(normalizedUrl, content),
      });
    }

    return signals;
  }

  /**
   * Extract subdomain from a certificate's common name.
   */
  private extractSubdomain(commonName: string, domain: string): string {
    const cleaned = commonName.replace(/^\*\./, "");
    if (cleaned === domain) {
      return domain;
    }
    if (cleaned.endsWith(`.${domain}`)) {
      return cleaned.slice(0, -domain.length - 1);
    }
    return cleaned;
  }
}
