#!/usr/bin/env tsx
/**
 * Scraper Data Quality Fix Script
 *
 * Fixes the identified data quality issues by:
 * 1. Improving RSS scraper to extract full content
 * 2. Adding date validation (reject future dates)
 * 3. Adding metadata extraction (author, URL, etc.)
 * 4. Re-processing existing signals to clean data
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as cheerio from 'cheerio';
// @ts-ignore - node-fetch types not installed
import fetch from 'node-fetch';

// Parse .env.local and set environment variables
const envPath = join(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach((line) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  }
});

// Import prisma after setting env
import { prisma } from '../src/lib/db';
import { Prisma } from '@prisma/client';

interface ArticleContent {
  title: string;
  author: string | null;
  publishedAt: Date | null;
  fullContent: string;
  description: string;
  url: string;
  domain: string;
}

/**
 * Validate and fix publication date
 * - Reject future dates
 * - Reject dates before 2000
 * - Return null for invalid dates
 */
function validateDate(date: Date | null): Date | null {
  if (!date || isNaN(date.getTime())) {
    return null;
  }

  const now = new Date();

  // Reject future dates
  if (date > now) {
    console.warn(`  ⚠️  Future date detected: ${date.toISOString()}. Rejecting.`);
    return null;
  }

  // Reject very old dates (before 2000)
  if (date < new Date(2000, 0, 1)) {
    console.warn(`  ⚠️  Suspiciously old date: ${date.toISOString()}. Rejecting.`);
    return null;
  }

  return date;
}

/**
 * Extract full article content from a URL
 * Uses multiple strategies to get complete content
 */
async function extractFullArticle(url: string): Promise<ArticleContent | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'TheTell-Bot/1.0 (+https://thetell.example.com/bot)',
      },
    });

    if (!response.ok) {
      console.error(`  ❌ Failed to fetch article: ${response.statusText}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract title
    let title = '';
    const ogTitle = $('meta[property="og:title"]').attr('content');
    const schemaTitle = $('[itemprop="headline"]').first().text();
    const h1 = $('h1').first().text();
    const htmlTitle = $('title').first().text();
    title = ogTitle || schemaTitle || h1 || htmlTitle || '';

    // Extract author
    let author: string | null = null;
    const ogAuthor = $('meta[property="article:author"]').attr('content');
    const schemaAuthor = $('[itemprop="author"]').first().text();
    const metaAuthor = $('meta[name="author"]').attr('content');
    author = ogAuthor || schemaAuthor || metaAuthor || null;

    // Extract publication date
    let pubDate: Date | null = null;
    const ogDate = $('meta[property="article:published_time"]').attr('content');
    const schemaDate = $('[itemprop="datePublished"]').attr('content');
    const timeDate = $('time').first().attr('datetime');
    if (ogDate) pubDate = new Date(ogDate);
    if (!pubDate && schemaDate) pubDate = new Date(schemaDate);
    if (!pubDate && timeDate) pubDate = new Date(timeDate);

    // Validate date
    pubDate = validateDate(pubDate);

    // Extract full content
    let fullContent = '';

    // Strategy 1: Try article body selectors
    const bodySelectors = [
      '[itemprop="articleBody"]',
      '[class*="article-body"]',
      '[class*="post-content"]',
      '[class*="entry-content"]',
      '[class*="story-body"]',
      'article',
    ];

    for (const selector of bodySelectors) {
      const body = $(selector).first();
      if (body.length) {
        // Remove non-content elements
        body.find('script, style, nav, header, footer, aside, iframe, .ads, .advertisement').remove();

        const paragraphs = body
          .find('p')
          .map((_, el) => $(el).text().trim())
          .get()
          .filter((t) => t.length > 50) // Filter out very short paragraphs
          .join('\n\n');

        if (paragraphs.length > 200) {
          fullContent = paragraphs;
          break;
        }
      }
    }

    // Strategy 2: Fallback to all paragraphs
    if (!fullContent || fullContent.length < 200) {
      const allParagraphs = $('p')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((t) => t.length > 50)
        .join('\n\n');

      if (allParagraphs.length > 200) {
        fullContent = allParagraphs;
      }
    }

    // Extract description
    let description = '';
    const ogDesc = $('meta[property="og:description"]').attr('content');
    const metaDesc = $('meta[name="description"]').attr('content');
    description = ogDesc || metaDesc || '';

    const domain = new URL(url).hostname;

    return {
      title,
      author,
      publishedAt: pubDate,
      fullContent,
      description,
      url,
      domain,
    };
  } catch (error) {
    console.error(`  ❌ Error extracting article: ${error}`);
    return null;
  }
}

/**
 * Check content completeness
 * Returns issues found
 */
function checkContentCompleteness(content: string): string[] {
  const issues: string[] = [];

  if (!content || content.length === 0) {
    issues.push('Empty content');
    return issues;
  }

  // Check for truncation
  if (content.endsWith('...') || content.endsWith('The qu') || content.endsWith('outcomes don')) {
    issues.push('Content appears truncated');
  }

  // Check minimum length
  if (content.length < 200) {
    issues.push(`Content too short (${content.length} chars)`);
  }

  // Check for incomplete sentences
  const lastSentence = content.split('.').pop();
  if (lastSentence && lastSentence.length > 10 && !lastSentence.match(/[.!?]$/)) {
    issues.push('Last sentence incomplete');
  }

  return issues;
}

/**
 * Fix a single signal
 */
async function fixSignal(signalId: string) {
  console.log(`\n🔧 Fixing signal: ${signalId}`);

  try {
    const signal = await prisma.signal.findUnique({
      where: { id: signalId },
    });

    if (!signal) {
      console.log(`  ❌ Signal not found`);
      return false;
    }

    console.log(`  📄 Current title: ${signal.title}`);
    console.log(`  📏 Current content length: ${signal.rawContent?.length || 0} chars`);
    console.log(`  📅 Current published date: ${signal.publishedAt?.toISOString() || 'null'}`);

    // Check if we have a URL to re-scrape
    if (!signal.sourceUrl) {
      console.log(`  ⚠️  No source URL, cannot re-scrape`);
      return false;
    }

    // Try to extract full article from URL
    console.log(`  🔄 Re-scraping from: ${signal.sourceUrl}`);
    const article = await extractFullArticle(signal.sourceUrl);

    if (!article) {
      console.log(`  ❌ Failed to extract full article`);
      return false;
    }

    // Check content completeness
    const completenessIssues = checkContentCompleteness(article.fullContent);
    if (completenessIssues.length > 0) {
      console.log(`  ⚠️  Content completeness issues: ${completenessIssues.join(', ')}`);
    }

    // Prepare updates
    const updates: any = {};

    // Update content if improved
    if (article.fullContent && (!signal.rawContent || article.fullContent.length > signal.rawContent.length)) {
      updates.rawContent = article.fullContent;
      console.log(`  ✅ Content improved: ${signal.rawContent?.length || 0} → ${article.fullContent.length} chars`);
    }

    // Update title if we got a better one
    if (article.title && article.title !== signal.title) {
      updates.title = article.title;
      console.log(`  ✅ Title updated: ${signal.title} → ${article.title}`);
    }

    // Update publication date if we got a valid one
    if (article.publishedAt && (!signal.publishedAt || signal.publishedAt > new Date())) {
      updates.publishedAt = article.publishedAt;
      console.log(`  ✅ Date updated: ${signal.publishedAt?.toISOString()} → ${article.publishedAt.toISOString()}`);
    }

    // Update metadata
    const currentMetadata = (signal.metadata as Record<string, any>) || {};
    const newMetadata = {
      ...currentMetadata,
      author: article.author || currentMetadata.author,
      domain: article.domain || currentMetadata.domain,
      description: article.description || currentMetadata.description,
      sourceUrl: article.url || currentMetadata.sourceUrl,
      scrapedAt: new Date().toISOString(),
    };
    updates.metadata = newMetadata;

    // Apply updates if there are any
    if (Object.keys(updates).length > 0) {
      await prisma.signal.update({
        where: { id: signalId },
        data: updates,
      });
      console.log(`  ✅ Signal updated successfully`);
      return true;
    } else {
      console.log(`  ℹ️  No improvements found`);
      return false;
    }
  } catch (error) {
    console.error(`  ❌ Error fixing signal: ${error}`);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🔧 Scraper Data Quality Fix Script\n');
  console.log('═'.repeat(80));

  try {
    // Get signals that need fixing
    const signalsToFix = await prisma.signal.findMany({
      where: {
        OR: [
          // Future dates
          { publishedAt: { gt: new Date() } },
          // Missing metadata
          { metadata: { equals: Prisma.JsonNull } },
          // Truncated content (heuristic: ends with common truncation patterns)
          { rawContent: { contains: '...' } },
        ],
      },
      take: 10, // Limit to 10 for testing
      orderBy: { scrapedAt: 'desc' },
    });

    console.log(`📊 Found ${signalsToFix.length} signals that need fixing\n`);

    if (signalsToFix.length === 0) {
      console.log('✅ No signals need fixing!');
      return;
    }

    // Fix each signal
    let fixedCount = 0;
    for (const signal of signalsToFix) {
      const fixed = await fixSignal(signal.id);
      if (fixed) fixedCount++;

      // Add small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log('\n' + '═'.repeat(80));
    console.log(`\n📋 Summary:`);
    console.log(`   Signals processed: ${signalsToFix.length}`);
    console.log(`   Signals fixed: ${fixedCount}`);
    console.log(`   Signals unchanged: ${signalsToFix.length - fixedCount}`);

    console.log('\n💡 Next Steps:');
    console.log('   1. Review the fixed signals for quality');
    console.log('   2. Run embedding generation for updated signals');
    console.log('   3. Re-run analysis pipeline on fixed signals');
    console.log('   4. Deploy improved scrapers to prevent future issues');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
