/**
 * Ticker symbol discovery via LLM and web search fallback.
 */

import { logger } from "@/lib/logger";
import { getProvider } from "@/lib/ai/provider";
import { WebSearchScraper } from "@/lib/scraping/web-search-scraper";
import { TickerSuggestionSchema, type TickerLookupResult } from "./types";

const CONFIDENCE_THRESHOLD = 0.7;

/**
 * Look up a company's stock ticker symbol.
 * Uses LLM first, falls back to web search if confidence is low.
 */
export async function lookupTicker(
  companyName: string
): Promise<TickerLookupResult | null> {
  logger.info("enrichment.ticker_lookup.start", { companyName });

  try {
    // 1. Try LLM lookup
    const llmResult = await lookupViaLLM(companyName);
    if (llmResult && llmResult.ticker && llmResult.confidence >= CONFIDENCE_THRESHOLD) {
      logger.info("enrichment.ticker_lookup.llm_success", {
        companyName,
        ticker: llmResult.ticker,
        confidence: llmResult.confidence,
      });
      return llmResult;
    }

    // 2. Fall back to web search
    const searchResult = await lookupViaWebSearch(companyName);
    if (searchResult && searchResult.ticker) {
      logger.info("enrichment.ticker_lookup.search_success", {
        companyName,
        ticker: searchResult.ticker,
        confidence: searchResult.confidence,
      });
      return searchResult;
    }

    // 3. Return LLM result even if low confidence (better than nothing)
    if (llmResult && llmResult.ticker) {
      logger.info("enrichment.ticker_lookup.low_confidence", {
        companyName,
        ticker: llmResult.ticker,
        confidence: llmResult.confidence,
      });
      return llmResult;
    }

    logger.info("enrichment.ticker_lookup.not_found", { companyName });
    return null;
  } catch (error) {
    logger.error("enrichment.ticker_lookup.error", {
      companyName,
      error: String(error),
    });
    return null;
  }
}

async function lookupViaLLM(
  companyName: string
): Promise<TickerLookupResult | null> {
  try {
    const provider = getProvider("openai");
    const result = await provider.completeStructured(
      [
        {
          role: "system",
          content:
            "You are a financial research assistant. You identify stock ticker symbols for companies.",
        },
        {
          role: "user",
          content: `What is the stock ticker symbol for "${companyName}"? Return null if the company is not publicly traded or you are unsure.`,
        },
      ],
      TickerSuggestionSchema,
      { temperature: 0.3 }
    );

    return {
      ticker: result.ticker,
      exchange: result.exchange,
      confidence: result.confidence,
    };
  } catch (error) {
    logger.warn("enrichment.ticker_lookup.llm_failed", {
      companyName,
      error: String(error),
    });
    return null;
  }
}

async function lookupViaWebSearch(
  companyName: string
): Promise<TickerLookupResult | null> {
  try {
    const searchScraper = new WebSearchScraper();
    const results = await searchScraper.search(
      `${companyName} stock ticker symbol`,
      { numResults: 5 }
    );

    if (results.length === 0) {
      return null;
    }

    // Use LLM to extract ticker from search results
    const resultText = results
      .map((r) => `${r.title}: ${r.snippet} (${r.url})`)
      .join("\n");

    const provider = getProvider("openai");
    const extracted = await provider.completeStructured(
      [
        {
          role: "system",
          content:
            "You are a financial research assistant. Extract the stock ticker symbol from the search results.",
        },
        {
          role: "user",
          content: `Based on these search results, what is the stock ticker symbol for "${companyName}"?\n\nSearch results:\n${resultText}\n\nReturn null if you cannot determine the ticker with confidence.`,
        },
      ],
      TickerSuggestionSchema,
      { temperature: 0.2 }
    );

    if (extracted.ticker && extracted.confidence >= CONFIDENCE_THRESHOLD) {
      return {
        ticker: extracted.ticker,
        exchange: extracted.exchange,
        confidence: extracted.confidence,
      };
    }

    return null;
  } catch (error) {
    logger.warn("enrichment.ticker_lookup.search_failed", {
      companyName,
      error: String(error),
    });
    return null;
  }
}
