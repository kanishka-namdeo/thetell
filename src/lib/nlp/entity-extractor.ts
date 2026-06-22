/**
 * Named Entity Recognition using BERT-base-NER.
 *
 * Opportunity 3 from the Local NLP Model Integration Plan.
 * Replaces regex-based entity detection in src/lib/ai/confidence.ts.
 *
 * Model: Xenova/bert-base-NER
 * Expected latency: ~20ms per signal on CPU
 */

import { getModelPipeline } from "./model-cache";
import { logger } from "@/lib/logger";

export interface ExtractedEntities {
  persons: string[];
  organizations: string[];
  locations: string[];
  dates: string[];
  monetary: string[];
}

/**
 * Group consecutive tokens into entities using BIO scheme decoding.
 * B-PER, I-PER -> "John Smith"
 */
function groupEntitiesByBIO(
  tokens: Array<{ entity: string; word: string; score: number }>,
): Map<string, string[]> {
  const entities = new Map<string, string[]>();
  let currentEntity = "";
  let currentType = "";

  for (const token of tokens) {
    const entity = token.entity.toUpperCase();
    const word = token.word;

    if (entity.startsWith("B-")) {
      // Save previous entity if exists
      if (currentEntity && currentType) {
        if (!entities.has(currentType)) {
          entities.set(currentType, []);
        }
        entities.get(currentType)!.push(currentEntity.trim());
      }
      // Start new entity
      currentType = entity.slice(2);
      currentEntity = word;
    } else if (entity.startsWith("I-") && currentType === entity.slice(2)) {
      // Continue current entity
      currentEntity += word;
    } else {
      // End current entity
      if (currentEntity && currentType) {
        if (!entities.has(currentType)) {
          entities.set(currentType, []);
        }
        entities.get(currentType)!.push(currentEntity.trim());
      }
      currentEntity = "";
      currentType = "";
    }
  }

  // Don't forget the last entity
  if (currentEntity && currentType) {
    if (!entities.has(currentType)) {
      entities.set(currentType, []);
    }
    entities.get(currentType)!.push(currentEntity.trim());
  }

  return entities;
}

/**
 * Extract date patterns from text using regex.
 */
function extractDatesWithRegex(text: string): string[] {
  const datePatterns = [
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, // MM/DD/YYYY
    /\b\d{4}-\d{2}-\d{2}\b/g, // YYYY-MM-DD
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi, // Month DD, YYYY
    /\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}\b/gi, // DD Month YYYY
    /\bQ[1-4] \d{4}\b/g, // Q1 2024
    /\bFY\d{4}\b/g, // FY2024
  ];

  const dates: string[] = [];
  for (const pattern of datePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      dates.push(...matches);
    }
  }
  return [...new Set(dates)];
}

/**
 * Extract monetary values from text using regex.
 */
function extractMonetaryWithRegex(text: string): string[] {
  const monetaryPatterns = [
    /\$\d+(?:\.\d+)?(?:\s?(?:million|billion|trillion|M|B|T))?/gi, // $100 million
    /\d+(?:\.\d+)?\s?(?:million|billion|trillion)\s?(?:dollars|USD)?/gi, // 100 million dollars
    /€\d+(?:\.\d+)?(?:\s?(?:million|billion|trillion))?/gi, // €100 million
    /£\d+(?:\.\d+)?(?:\s?(?:million|billion|trillion))?/gi, // £100 million
    /\d+(?:\.\d+)?\s?(?:USD|EUR|GBP)(?:\s?(?:million|billion|trillion))?/gi, // 100 USD million
  ];

  const monetary: string[] = [];
  for (const pattern of monetaryPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      monetary.push(...matches);
    }
  }
  return [...new Set(monetary)];
}

/**
 * Clean up BERT-NER token words (handle subword tokens).
 */
function cleanTokenWord(word: string): string {
  // BERT-NER often uses ## for subword tokens
  return word.replace(/^##/, "").replace(/^▁/, " ").trim();
}

/**
 * Extract social-media-specific entities using regex patterns.
 * 
 * Captures:
 * - Reddit usernames: u/username
 * - Subreddits: r/subreddit
 * - Hashtags: #hashtag
 * - Stock tickers: $AAPL, $TSLA
 */
function extractSocialEntities(text: string): ExtractedEntities {
  const patterns = {
    persons: [/\bu\/([a-zA-Z0-9_-]+)/g], // Reddit usernames
    organizations: [/\br\/([a-zA-Z0-9_]+)/g], // Subreddits
    locations: [],
    dates: [],
    monetary: [],
  };

  const extractAll = (regexPatterns: RegExp[]): string[] => {
    const results: string[] = [];
    for (const pattern of regexPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        results.push(match[1] || match[0]);
      }
    }
    return [...new Set(results)];
  };

  // Extract hashtags (organizations/social entities)
  const hashtagPattern = /#([a-zA-Z0-9_]+)/g;
  const hashtags = [...new Set([...text.matchAll(hashtagPattern)].map(m => m[1]))];

  // Extract stock tickers (monetary-like entities)
  const tickerPattern = /\$([A-Z]{2,5})\b/g;
  const tickers = [...new Set([...text.matchAll(tickerPattern)].map(m => `$${m[1]}`))];

  return {
    persons: extractAll(patterns.persons),
    organizations: [...extractAll(patterns.organizations), ...hashtags],
    locations: extractAll(patterns.locations),
    dates: extractAll(patterns.dates),
    monetary: [...extractAll(patterns.monetary), ...tickers],
  };
}

/**
 * Extract named entities from text using a local BERT-NER model.
 *
 * Groups consecutive tokens using BIO scheme decoding.
 * Results are used to enhance LLM prompts and improve confidence scoring.
 *
 * @param text - The text to extract entities from
 * @param sourceType - Optional signal source type. For SOCIAL signals, merges
 *                     regex-extracted social entities (usernames, hashtags, tickers)
 *                     with BERT-NER results.
 */
export async function extractEntities(text: string, sourceType?: string): Promise<ExtractedEntities> {
  const startTime = Date.now();

  try {
    const ner = await getModelPipeline(
      "token-classification",
      "Xenova/bert-base-NER",
    ) as (text: string) => Promise<Array<{ entity: string; word: string; score: number }>>;

    const result = await ner(text);

    // Clean up token words before grouping
    const cleanedTokens = result.map((token: { entity: string; word: string; score: number }) => ({
      ...token,
      word: cleanTokenWord(token.word),
    }));

    // Group tokens into entities using BIO scheme
    const groupedEntities = groupEntitiesByBIO(cleanedTokens);

    // Map entity types to our categories
    let persons = groupedEntities.get("PER") ?? [];
    let organizations = groupedEntities.get("ORG") ?? [];
    let locations = groupedEntities.get("LOC") ?? [];

    // Use regex for dates and monetary (BERT-NER doesn't extract these well)
    let dates = extractDatesWithRegex(text);
    let monetary = extractMonetaryWithRegex(text);

    // For SOCIAL signals, merge BERT-NER entities with social-specific entities
    if (sourceType === "SOCIAL") {
      const socialEntities = extractSocialEntities(text);
      persons = [...persons, ...socialEntities.persons];
      organizations = [...organizations, ...socialEntities.organizations];
      locations = [...locations, ...socialEntities.locations];
      dates = [...dates, ...socialEntities.dates];
      monetary = [...monetary, ...socialEntities.monetary];
    }

    const elapsed = Date.now() - startTime;
    logger.info("nlp.entities.extracted", {
      personsCount: persons.length,
      organizationsCount: organizations.length,
      locationsCount: locations.length,
      datesCount: dates.length,
      monetaryCount: monetary.length,
      sourceType: sourceType ?? "unspecified",
      elapsedMs: elapsed,
    });

    return {
      persons: [...new Set(persons)],
      organizations: [...new Set(organizations)],
      locations: [...new Set(locations)],
      dates: [...new Set(dates)],
      monetary: [...new Set(monetary)],
    };
  } catch (error) {
    logger.error("nlp.entities.extraction.failed", {
      error: String(error),
      textLength: text.length,
    });
    throw error;
  }
}
