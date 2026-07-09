/**
 * Subreddit Discovery Service
 *
 * Uses LLM to suggest relevant subreddits for a company, validates them
 * against Reddit's RSS feeds, and stores valid results in the database.
 */

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getProviderWithFailover } from "@/lib/ai/provider";
import { logger } from "@/lib/logger";

/**
 * Lenient schema for initial LLM response parsing.
 * Accepts common LLM output variations (r/ prefix, alternative field names).
 */
const RawSubredditSuggestionSchema = z.object({
  subreddits: z.array(
    z.object({
      name: z.string(),
      reason: z.string().optional(),
      confidence: z.string().optional(),
      // Accept alternative field names the LLM might use
      explanation: z.string().optional(),
      justification: z.string().optional(),
      relevance: z.number().optional(),
      score: z.number().optional(),
    })
  ),
});

/**
 * Strict schema for normalized data after processing.
 */
const SubredditSuggestionSchema = z.object({
  subreddits: z.array(
    z.object({
      name: z.string().regex(/^[a-zA-Z0-9_]+$/),
      reason: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
    })
  ),
});

type SubredditSuggestion = z.infer<typeof SubredditSuggestionSchema>;

/**
 * Normalize LLM response to handle common variations in field names and formats.
 */
function normalizeLLMResponse(raw: z.infer<typeof RawSubredditSuggestionSchema>): SubredditSuggestion {
  const subreddits: SubredditSuggestion["subreddits"] = [];

  for (const entry of raw.subreddits) {
    // Normalize name: remove r/ prefix, trim, lowercase
    const name = entry.name.replace(/^r\//i, "").trim().toLowerCase();
    
    // Skip empty names or names with invalid characters
    if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) {
      logger.debug("subreddit_discovery.skipping_invalid_name", { rawName: entry.name });
      continue;
    }

    // Resolve reason from alternative field names
    const reason = entry.reason
      || entry.explanation
      || entry.justification
      || `Relevant to company research`;

    // Resolve confidence from alternative field names or numeric scores
    let confidence: "high" | "medium" | "low";
    if (entry.confidence && ["high", "medium", "low"].includes(entry.confidence)) {
      confidence = entry.confidence as "high" | "medium" | "low";
    } else if (typeof entry.relevance === "number") {
      confidence = entry.relevance >= 0.7 ? "high" : entry.relevance >= 0.4 ? "medium" : "low";
    } else if (typeof entry.score === "number") {
      confidence = entry.score >= 0.7 ? "high" : entry.score >= 0.4 ? "medium" : "low";
    } else {
      confidence = "medium";
    }

    subreddits.push({ name, reason, confidence });
  }

  return { subreddits };
}

interface CompanyProfile {
  id: string;
  name: string;
  industry: string | null;
  sector: string | null;
  ticker: string | null;
  description: string | null;
}

const RATE_LIMIT_DELAY_MS = 2000; // 2 seconds to avoid Reddit rate limits

/**
 * Validate a subreddit by checking if it exists.
 * Uses Reddit's RSS/Atom feeds with retry logic for rate limiting.
 */
export async function validateSubreddit(
  name: string,
  retries = 2
): Promise<{ valid: boolean; subscriberCount?: number }> {
  const feedUrl = `https://www.reddit.com/r/${name}/.rss`;
  const userAgent = "Mozilla/5.0 (compatible; TheTell-Bot/1.0; +https://thetell.example.com/bot)";

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(feedUrl, {
        headers: { "User-Agent": userAgent },
        signal: AbortSignal.timeout(15_000),
      });

      // Success — parse the feed
      if (response.status === 200) {
        const xml = await response.text();

        // Check if response is actually XML feed (RSS or Atom)
        const isRss = xml.includes("<rss");
        const isAtom = xml.includes("<feed");
        const isXml = isRss || isAtom;

        if (!isXml) {
          // Reddit returned HTML instead of XML — subreddit likely doesn't exist
          // or Reddit is serving a redirect/error page
          logger.debug("subreddit_validation.non_xml_response", {
            subreddit: name,
            contentType: response.headers.get("content-type"),
            responseLength: xml.length,
          });
          return { valid: false };
        }

        // Try to extract subscriber count from various formats
        // RSS format: <num_readers>12345</num_readers>
        // Atom format: may not include subscriber count
        const subscriberMatch =
          xml.match(/<num_readers>(\d+)<\/num_readers>/i) ||
          xml.match(/(\d+)\s*(?:readers|subscribers|members)/i);

        return {
          valid: true,
          subscriberCount: subscriberMatch
            ? parseInt(subscriberMatch[1], 10)
            : undefined,
        };
      }

      // Rate limited — wait and retry
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("retry-after") || "5", 10);
        const waitMs = Math.max(retryAfter * 1000, 3000) * (attempt + 1);
        logger.debug("subreddit_validation.rate_limited", {
          subreddit: name,
          attempt,
          retryAfter,
          waitMs,
        });
        await sleep(waitMs);
        continue;
      }

      // 403/404 — subreddit doesn't exist or is private
      if (response.status === 403 || response.status === 404) {
        return { valid: false };
      }

      // Other error — log and return invalid
      logger.debug("subreddit_validation.unexpected_status", {
        subreddit: name,
        status: response.status,
      });
      return { valid: false };
    } catch (error) {
      if (attempt < retries) {
        const waitMs = 3000 * (attempt + 1);
        logger.debug("subreddit_validation.fetch_error_retry", {
          subreddit: name,
          attempt,
          error: error instanceof Error ? error.message : String(error),
          waitMs,
        });
        await sleep(waitMs);
        continue;
      }

      logger.debug("subreddit_validation.failed", {
        subreddit: name,
        error: error instanceof Error ? error.message : String(error),
      });
      return { valid: false };
    }
  }

  return { valid: false };
}

function buildDiscoveryPrompt(company: CompanyProfile): string {
  const parts = [
    `Company: ${company.name}`,
    company.industry ? `Industry: ${company.industry}` : null,
    company.sector ? `Sector: ${company.sector}` : null,
    company.ticker ? `Ticker: ${company.ticker}` : null,
    company.description ? `Description: ${company.description}` : null,
  ].filter(Boolean);

  return `You are a research assistant identifying Reddit communities relevant to a company.

${parts.join("\n")}

Suggest 5-15 Reddit subreddits where discussions about this company, its industry,
or its competitors are likely to occur. Include:
- Industry-specific subreddits (e.g., biotech for a biotech company)
- Ticker-specific subreddits (e.g., aapl for Apple)
- Competitor/community subreddits
- General finance/investing subreddits relevant to this company's market

Return your response as a JSON object with this exact structure:
{
  "subreddits": [
    {
      "name": "subreddit_name_without_r_prefix",
      "reason": "Brief explanation of why this subreddit is relevant",
      "confidence": "high|medium|low"
    }
  ]
}

Important:
- Do NOT include the "r/" prefix in subreddit names
- Provide a reason for each subreddit
- Set confidence to "high", "medium", or "low"`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Discover subreddits for a company using LLM suggestions and RSS validation.
 *
 * 1. Loads company from DB
 * 2. Calls LLM with structured prompt
 * 3. Validates each suggestion via RSS feed
 * 4. Stores valid results in TrackedSubreddit
 * 5. Logs the discovery run in SubredditDiscoveryLog
 */
export async function discoverSubredditsForCompany(companyId: string): Promise<{
  suggestedCount: number;
  validatedCount: number;
  status: "success" | "failed" | "partial";
  error?: string;
}> {
  const startTime = Date.now();
  logger.info("subreddit_discovery.start", { companyId });

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        industry: true,
        sector: true,
        ticker: true,
        description: true,
      },
    });

    if (!company) {
      const error = `Company not found: ${companyId}`;
      logger.error("subreddit_discovery.company_not_found", { companyId });
      await prisma.subredditDiscoveryLog.create({
        data: {
          companyId,
          status: "failed",
          suggestedCount: 0,
          validatedCount: 0,
          error,
          durationMs: Date.now() - startTime,
        },
      });
      return { suggestedCount: 0, validatedCount: 0, status: "failed", error };
    }

    const prompt = buildDiscoveryPrompt(company);
    const { provider } = getProviderWithFailover("openai");

    // Use lenient schema for LLM parsing
    let rawSuggestions: z.infer<typeof RawSubredditSuggestionSchema>;
    try {
      rawSuggestions = await provider.completeStructured(
        [
          { role: "system", content: "You are a research assistant." },
          { role: "user", content: prompt },
        ],
        RawSubredditSuggestionSchema,
        { temperature: 0.4 }
      );
    } catch (llmError) {
      const error =
        llmError instanceof Error ? llmError.message : String(llmError);
      logger.error("subreddit_discovery.llm_failed", { companyId, error });
      await prisma.subredditDiscoveryLog.create({
        data: {
          companyId,
          status: "failed",
          suggestedCount: 0,
          validatedCount: 0,
          error: `LLM error: ${error}`,
          durationMs: Date.now() - startTime,
        },
      });
      return { suggestedCount: 0, validatedCount: 0, status: "failed", error };
    }

    // Normalize the response
    const suggestions = normalizeLLMResponse(rawSuggestions);
    const suggestedCount = suggestions.subreddits.length;

    logger.info("subreddit_discovery.llm_complete", {
      companyId,
      suggestedCount,
    });

    let validatedCount = 0;
    let hasErrors = false;

    for (const sub of suggestions.subreddits) {
      try {
        const validation = await validateSubreddit(sub.name);

        if (validation.valid) {
          await prisma.trackedSubreddit.upsert({
            where: {
              companyId_subreddit: {
                companyId,
                subreddit: sub.name,
              },
            },
            update: {
              reason: sub.reason,
              subscriberCount: validation.subscriberCount ?? null,
              lastValidatedAt: new Date(),
              isActive: true,
            },
            create: {
              companyId,
              subreddit: sub.name,
              reason: sub.reason,
              subscriberCount: validation.subscriberCount ?? null,
              isActive: true,
            },
          });
          validatedCount++;
        } else {
          logger.debug("subreddit_discovery.invalid_subreddit", {
            companyId,
            subreddit: sub.name,
          });
        }
      } catch (dbError) {
        hasErrors = true;
        logger.error("subreddit_discovery.upsert_failed", {
          companyId,
          subreddit: sub.name,
          error: dbError instanceof Error ? dbError.message : String(dbError),
        });
      }

      await sleep(RATE_LIMIT_DELAY_MS);
    }

    const status =
      validatedCount === 0 && hasErrors
        ? "failed"
        : hasErrors || validatedCount < suggestedCount
          ? "partial"
          : "success";

    await prisma.subredditDiscoveryLog.create({
      data: {
        companyId,
        status,
        suggestedCount,
        validatedCount,
        durationMs: Date.now() - startTime,
      },
    });

    logger.info("subreddit_discovery.complete", {
      companyId,
      suggestedCount,
      validatedCount,
      status,
      durationMs: Date.now() - startTime,
    });

    return { suggestedCount, validatedCount, status };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    logger.error("subreddit_discovery.unexpected_error", {
      companyId,
      error: errorMessage,
    });

    await prisma.subredditDiscoveryLog.create({
      data: {
        companyId,
        status: "failed",
        suggestedCount: 0,
        validatedCount: 0,
        error: errorMessage,
        durationMs: Date.now() - startTime,
      },
    });

    return {
      suggestedCount: 0,
      validatedCount: 0,
      status: "failed",
      error: errorMessage,
    };
  }
}
