/**
 * Company website URL discovery via LLM and web search fallback.
 */

import { logger } from "@/lib/logger";
import { getProviderWithFailover } from "@/lib/ai/provider";
import { WebSearchScraper } from "@/lib/scraping/web-search-scraper";
import { WebsiteSuggestionSchema, type WebsiteLookupResult } from "./types";

const CONFIDENCE_THRESHOLD = 0.7;
const LLM_TIMEOUT_MS = 30_000;

/**
 * Wraps a promise with a timeout. Rejects if the promise doesn't resolve in time.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}_timeout`)), ms)
    ),
  ]);
}

/**
 * Discover a company's official website URL.
 * Uses LLM first, falls back to web search if confidence is low.
 */
export async function lookupWebsite(
  companyName: string,
  ticker?: string | null
): Promise<WebsiteLookupResult | null> {
  logger.info("enrichment.website_lookup.start", { companyName, ticker });

  try {
    // 1. Try LLM lookup
    const llmResult = await lookupViaLLM(companyName, ticker);
    if (llmResult && llmResult.websiteUrl && llmResult.confidence >= CONFIDENCE_THRESHOLD) {
      logger.info("enrichment.website_lookup.llm_success", {
        companyName,
        websiteUrl: llmResult.websiteUrl,
        confidence: llmResult.confidence,
      });
      return llmResult;
    }

    // 2. Fall back to web search
    const searchResult = await lookupViaWebSearch(companyName, ticker);
    if (searchResult && searchResult.websiteUrl) {
      logger.info("enrichment.website_lookup.search_success", {
        companyName,
        websiteUrl: searchResult.websiteUrl,
        confidence: searchResult.confidence,
      });
      return searchResult;
    }

    // 3. Return LLM result even if low confidence (better than nothing)
    if (llmResult && llmResult.websiteUrl) {
      logger.info("enrichment.website_lookup.low_confidence", {
        companyName,
        websiteUrl: llmResult.websiteUrl,
        confidence: llmResult.confidence,
      });
      return llmResult;
    }

    logger.info("enrichment.website_lookup.not_found", { companyName });
    return null;
  } catch (error) {
    logger.error("enrichment.website_lookup.error", {
      companyName,
      error: String(error),
    });
    return null;
  }
}

async function lookupViaLLM(
  companyName: string,
  ticker?: string | null
): Promise<WebsiteLookupResult | null> {
  try {
    const { provider } = getProviderWithFailover("openai");
    
    const contextInfo = ticker 
      ? `${companyName} (ticker: ${ticker})` 
      : companyName;
    
    const result = await withTimeout(
      provider.completeStructured(
        [
          {
            role: "system",
            content:
              "You are a corporate research assistant. You identify official company website URLs. Return the primary corporate/official website, not subsidiaries or regional sites.",
          },
          {
            role: "user",
            content: `What is the official website URL for "${contextInfo}"? Return your response as JSON with fields: websiteUrl (string URL or null), confidence (number 0-1). Return null websiteUrl if you cannot find a reliable official website.`,
          },
        ],
        WebsiteSuggestionSchema,
        { temperature: 0.3 }
      ),
      LLM_TIMEOUT_MS,
      "website_llm"
    );

    return {
      websiteUrl: result.websiteUrl,
      confidence: result.confidence,
    };
  } catch (error) {
    logger.warn("enrichment.website_lookup.llm_failed", {
      companyName,
      error: String(error),
    });
    return null;
  }
}

async function lookupViaWebSearch(
  companyName: string,
  ticker?: string | null
): Promise<WebsiteLookupResult | null> {
  try {
    const searchScraper = new WebSearchScraper();
    
    const searchQuery = ticker 
      ? `${companyName} ${ticker} official website`
      : `${companyName} official website`;
    
    const results = await searchScraper.search(searchQuery, { numResults: 5 });

    if (results.length === 0) {
      return null;
    }

    // Use LLM to extract website URL from search results
    const resultText = results
      .map((r) => `${r.title}: ${r.snippet} (${r.url})`)
      .join("\n");

    const { provider } = getProviderWithFailover("openai");
    const extracted = await withTimeout(
      provider.completeStructured(
        [
          {
            role: "system",
            content:
              "You are a corporate research assistant. Extract the official company website URL from the search results. Return the primary corporate website, not news articles, social media, or subsidiary pages.",
          },
          {
            role: "user",
            content: `Based on these search results, what is the official website URL for "${companyName}"? Return your response as JSON with fields: websiteUrl (string URL or null), confidence (number 0-1).\n\nSearch results:\n${resultText}\n\nReturn null websiteUrl if you cannot determine the official website with confidence.`,
          },
        ],
        WebsiteSuggestionSchema,
        { temperature: 0.2 }
      ),
      LLM_TIMEOUT_MS,
      "website_search_llm"
    );

    if (extracted.websiteUrl && extracted.confidence >= CONFIDENCE_THRESHOLD) {
      return {
        websiteUrl: extracted.websiteUrl,
        confidence: extracted.confidence,
      };
    }

    return null;
  } catch (error) {
    logger.warn("enrichment.website_lookup.search_failed", {
      companyName,
      error: String(error),
    });
    return null;
  }
}