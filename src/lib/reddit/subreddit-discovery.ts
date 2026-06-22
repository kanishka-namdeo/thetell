/**
 * Subreddit Discovery Service
 *
 * Uses LLM to suggest relevant subreddits for a company, validates them
 * against Reddit's RSS feeds, and stores valid results in the database.
 */

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/ai/provider";
import { logger } from "@/lib/logger";

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

interface CompanyProfile {
  id: string;
  name: string;
  industry: string | null;
  sector: string | null;
  ticker: string | null;
  description: string | null;
}

const RATE_LIMIT_DELAY_MS = 1100;

/**
 * Validate a subreddit by checking its RSS feed.
 */
export async function validateSubreddit(
  name: string
): Promise<{ valid: boolean; subscriberCount?: number }> {
  const feedUrl = `https://www.reddit.com/r/${name}/.rss`;

  try {
    const response = await fetch(feedUrl, {
      headers: {
        "User-Agent":
          "TheTell-Bot/1.0 (+https://thetell.example.com/bot; contact@example.com)",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status !== 200) {
      return { valid: false };
    }

    const xml = await response.text();
    const subscriberMatch = xml.match(
      /(\d+)\s*(?:readers|subscribers|members)/i
    );

    return {
      valid: true,
      subscriberCount: subscriberMatch
        ? parseInt(subscriberMatch[1], 10)
        : undefined,
    };
  } catch (error) {
    logger.debug("subreddit_validation.failed", {
      subreddit: name,
      error: error instanceof Error ? error.message : String(error),
    });
    return { valid: false };
  }
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
- Industry-specific subreddits (e.g., r/biotech for a biotech company)
- Ticker-specific subreddits (e.g., r/aapl for Apple)
- Competitor/community subreddits
- General finance/investing subreddits relevant to this company's market

For each subreddit, explain why it's relevant.`;
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
    const provider = getProvider("openai");

    let suggestions: SubredditSuggestion;
    try {
      suggestions = await provider.completeStructured(
        [
          { role: "system", content: "You are a research assistant." },
          { role: "user", content: prompt },
        ],
        SubredditSuggestionSchema,
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

    const suggestedCount = suggestions.subreddits.length;
    logger.info("subreddit_discovery.llm_complete", {
      companyId,
      suggestedCount,
    });

    let validatedCount = 0;
    let hasErrors = false;

    for (const sub of suggestions.subreddits) {
      const name = sub.name.toLowerCase();

      try {
        const validation = await validateSubreddit(name);

        if (validation.valid) {
          await prisma.trackedSubreddit.upsert({
            where: {
              companyId_subreddit: {
                companyId,
                subreddit: name,
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
              subreddit: name,
              reason: sub.reason,
              subscriberCount: validation.subscriberCount ?? null,
              isActive: true,
            },
          });
          validatedCount++;
        } else {
          logger.debug("subreddit_discovery.invalid_subreddit", {
            companyId,
            subreddit: name,
          });
        }
      } catch (dbError) {
        hasErrors = true;
        logger.error("subreddit_discovery.upsert_failed", {
          companyId,
          subreddit: name,
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
