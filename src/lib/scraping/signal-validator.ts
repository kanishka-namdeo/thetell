/**
 * Signal data validation and cleaning layer.
 * Ensures signal quality before saving to database.
 */

import { logger } from "@/lib/logger";

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  cleanedData?: {
    publishedAt: Date | null;
    author: string | null;
    rawContent: string;
  };
}

/**
 * Validate and clean signal data before saving.
 * Returns validation result with issues found and cleaned data.
 */
export function validateAndCleanSignal(data: {
  publishedAt: Date | null;
  author?: string | null;
  rawContent: string;
  sourceUrl: string;
  title: string;
}): ValidationResult {
  const issues: string[] = [];
  const cleaned = {
    publishedAt: data.publishedAt,
    author: data.author || null,
    rawContent: data.rawContent,
  };

  // 1. Validate publication date - reject future dates
  if (cleaned.publishedAt) {
    const now = new Date();
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    if (cleaned.publishedAt > oneDayFromNow) {
      issues.push(`Future date rejected: ${cleaned.publishedAt.toISOString()}`);
      logger.warn("signal_validation.future_date", {
        url: data.sourceUrl,
        publishedAt: cleaned.publishedAt.toISOString(),
        now: now.toISOString(),
      });
      cleaned.publishedAt = null; // Set to null instead of rejecting entire signal
    }
  }

  // 2. Check for truncated content
  if (cleaned.rawContent) {
    const trimmed = cleaned.rawContent.trim();
    const lastChar = trimmed[trimmed.length - 1];
    
    // Content should end with proper punctuation or closing bracket
    const validEndings = ['.', '!', '?', ')', ']', '"', "'", '。', '！', '？'];
    if (trimmed.length > 100 && !validEndings.includes(lastChar)) {
      issues.push(`Content may be truncated (ends with: '${lastChar}')`);
      logger.debug("signal_validation.potential_truncation", {
        url: data.sourceUrl,
        lastChar,
        contentLength: trimmed.length,
      });
    }

    // Check for minimum content length
    if (trimmed.length < 50) {
      issues.push(`Content too short: ${trimmed.length} chars`);
    }
  }

  // 3. Check for missing author
  if (!cleaned.author || cleaned.author.trim() === '') {
    issues.push('Missing author attribution');
  }

  // 4. Clean HTML entities from content
  cleaned.rawContent = cleanHtmlEntities(cleaned.rawContent);

  return {
    valid: issues.length === 0,
    issues,
    cleanedData: cleaned,
  };
}

/**
 * Clean HTML entities from text content.
 */
function cleanHtmlEntities(text: string): string {
  return text
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8230;/g, '…')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Check whether scraped content is actually about a specific company.
 *
 * Catches false positives where a company name appears in passing
 * (e.g., "Apple" the fruit, "Meta" as a prefix, a WD SSD deal mentioning Mac).
 *
 * Rules:
 * - Company name must appear in the title OR the first 500 chars of content
 * - For short/ambiguous names (≤5 chars), require 2+ mentions across title+content
 *   OR co-occurrence with the ticker or a known industry keyword
 */
export function checkCompanyRelevance(data: {
  title: string;
  rawContent: string;
  companyName: string;
  ticker?: string | null;
  sector?: string | null;
  industry?: string | null;
}): { relevant: boolean; reason: string } {
  const { title, rawContent, companyName, ticker, sector, industry } = data;
  const nameLower = companyName.toLowerCase();
  const titleLower = title.toLowerCase();
  const contentHead = rawContent.slice(0, 500).toLowerCase();
  const combined = `${titleLower} ${contentHead}`;

  const nameInTitle = titleLower.includes(nameLower);
  const nameInContentHead = contentHead.includes(nameLower);

  if (!nameInTitle && !nameInContentHead) {
    return { relevant: false, reason: `Company "${companyName}" not found in title or first 500 chars` };
  }

  const isAmbiguous = companyName.length <= 5;
  if (!isAmbiguous) {
    return { relevant: true, reason: "ok" };
  }

  // For ambiguous names, require stronger evidence
  const mentionCount = countOccurrences(combined, nameLower);
  const tickerMention = ticker ? combined.includes(ticker.toLowerCase()) : false;
  const industryKeywords = buildIndustryKeywords(sector, industry, companyName);
  const hasIndustryContext = industryKeywords.some((kw) => combined.includes(kw));

  if (nameInTitle && (mentionCount >= 2 || tickerMention || hasIndustryContext)) {
    return { relevant: true, reason: "ok" };
  }

  if (!nameInTitle && (mentionCount >= 3 || tickerMention)) {
    return { relevant: true, reason: "ok" };
  }

  return {
    relevant: false,
    reason: `Ambiguous name "${companyName}" — insufficient evidence (mentions: ${mentionCount}, ticker: ${tickerMention}, industry: ${hasIndustryContext})`,
  };
}

function countOccurrences(text: string, search: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  return count;
}

function buildIndustryKeywords(sector?: string | null, industry?: string | null, companyName?: string): string[] {
  const keywords: string[] = [];
  if (sector) keywords.push(sector.toLowerCase());
  if (industry) keywords.push(industry.toLowerCase());

  // Common disambiguation terms for well-known ambiguous company names
  const knownDisambig: Record<string, string[]> = {
    apple: ["iphone", "ipad", "mac", "macbook", "ios", "apple inc", "tim cook", "cupertino", "app store", "apple music", "apple watch"],
    meta: ["facebook", "instagram", "whatsapp", "meta platforms", "mark zuckerberg", "vr", "quest headset"],
    amazon: ["aws", "jeff bezos", "prime", "amazon.com", "seattle", "alexa", "kindle"],
    shell: ["shell plc", "oil", "gas", "petroleum", "energy"],
  };

  if (companyName) {
    const disambig = knownDisambig[companyName.toLowerCase()];
    if (disambig) keywords.push(...disambig);
  }

  return keywords;
}

/**
 * Extract author from RSS feed item metadata.
 * Checks multiple common author fields in RSS/Atom feeds.
 */
export function extractAuthorFromMetadata(metadata: Record<string, string>): string | null {
  // Common author fields in RSS/Atom feeds
  const authorFields = [
    'dc:creator',
    'atom:author',
    'author',
    'dc:contributor',
    'itunes:author',
  ];

  for (const field of authorFields) {
    if (metadata[field] && metadata[field].trim()) {
      return metadata[field].trim();
    }
  }

  return null;
}
