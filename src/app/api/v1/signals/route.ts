import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SourceType, Sentiment, AgentPersona } from "@prisma/client";
import { inngest } from "@/lib/inngest/client";
import { analyzeSignalWithAgent } from "@/lib/ai/agent/pipeline";
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from "@/lib/ai/agent/personas";
import { generateArticleWithAgent } from "@/lib/ai/agent/article-generator";
import type { CrossRefAnalysis } from "@/lib/ai/agent/pipeline";
import { NewsScraper } from "@/lib/scraping/news-scraper";
import { BlogScraper } from "@/lib/scraping/blog-scraper";
import { SocialScraper } from "@/lib/scraping/social-scraper";
import { JobPostingScraper } from "@/lib/scraping/job-scraper";
import { RssScraper } from "@/lib/scraping/rss-scraper";
import { TranscriptScraper } from "@/lib/scraping/transcript-scraper";
import { FilingScraper } from "@/lib/scraping/filing-scraper";
import { getCompanyByFeedUrl } from "@/lib/scraping/feed-registry";
import { normalizeUrl, computeContentHash } from "@/lib/scraping/url-normalizer";
import { logger } from "@/lib/logger";
import { z } from "zod";

const SignalCreateSchema = z.object({
  sourceUrl: z.string().url("Invalid source URL"),
  sourceType: z.enum(["NEWS", "FILING", "TRANSCRIPT", "SOCIAL", "BLOG", "JOB_POSTING", "RSS"], {
    error: "Invalid source type",
  }),
  companyId: z.string().min(1, "Company ID is required"),
  title: z.string().optional(),
  rawContent: z.string().optional(),
  publishedAt: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/signals" });

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const cursor = searchParams.get("cursor");
    const companyId = searchParams.get("companyId");
    const sourceType = searchParams.get("sourceType") as SourceType | null;
    const sentiment = searchParams.get("sentiment") as Sentiment | null;
    const agentPersona = searchParams.get("agentPersona") as AgentPersona | null;

    log.info("api.request.start", { method: "GET", path: "/api/v1/signals" });

    const where: Record<string, unknown> = { status: "ANALYZED" };
    if (companyId) where.companyId = companyId;
    if (sourceType) where.sourceType = sourceType;
    if (sentiment || agentPersona) {
      const analysesWhere: Record<string, unknown> = {};
      if (sentiment) analysesWhere.sentiment = sentiment;
      if (agentPersona) analysesWhere.agentPersona = agentPersona;
      where.analyses = { some: analysesWhere };
    }

    const signals = await prisma.signal.findMany({
      where,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        company: true,
        analyses: agentPersona
          ? { where: { agentPersona } }
          : true,
      },
      orderBy: { scrapedAt: "desc" },
    });

    const hasMore = signals.length > limit;
    const items = hasMore ? signals.slice(0, limit) : signals;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    log.info("api.request.success", { count: items.length, hasMore });

    return NextResponse.json({
      items,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    log.error("api.request.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch signals" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parseResult = SignalCreateSchema.safeParse(body);

    if (!parseResult.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parseResult.error.issues) {
        const key = issue.path.join(".");
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Invalid request body",
          details,
        },
        { status: 400 }
      );
    }

    const { sourceUrl, sourceType, companyId } = parseResult.data;
    let { title, rawContent, publishedAt } = parseResult.data;

    // Task 3: Wire scraper - auto-populate from URL if content not provided
    if (!rawContent && sourceUrl) {
      try {
        const scraper = createScraper(sourceType);
        if (!scraper) {
          return NextResponse.json(
            { error: "unsupported_source", message: `Scraper not available for source type: ${sourceType}` },
            { status: 400 }
          );
        }

        const result = await scrapeWithSource(scraper, sourceType, sourceUrl);
        if (!result) {
          return NextResponse.json(
            { error: "scrape_failed", message: "Could not extract content from URL" },
            { status: 422 }
          );
        }

        title = title || result.title;
        rawContent = result.bodyText;
        publishedAt = publishedAt || result.publishedAt?.toISOString();
      } catch (err) {
        logger.error("Scraping failed", { url: sourceUrl, sourceType, error: String(err) });
        return NextResponse.json(
          { error: "scrape_failed", message: "Failed to scrape URL" },
          { status: 422 }
        );
      }
    }

    if (!title || !rawContent) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Title and content are required (provide rawContent or a scrapeable sourceUrl)",
        },
        { status: 400 }
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json(
        { error: "not_found", message: "Company not found" },
        { status: 404 }
      );
    }

    // Deduplication: compute content hash and check for existing signal
    const normalizedUrl = normalizeUrl(sourceUrl);
    const contentHash = computeContentHash(normalizedUrl, rawContent);

    const existingSignal = await prisma.signal.findUnique({
      where: { contentHash },
      include: { company: true, analyses: true },
    });

    if (existingSignal) {
      logger.info("Duplicate signal detected, returning existing", {
        contentHash,
        existingSignalId: existingSignal.id,
        newUrl: sourceUrl,
      });

      return NextResponse.json(
        { ...existingSignal, deduplicated: true },
        { status: 200 }
      );
    }

    const signal = await prisma.signal.create({
      data: {
        sourceUrl,
        sourceType,
        title,
        rawContent,
        contentHash,
        publishedAt: publishedAt ? new Date(publishedAt) : null,
        companyId,
        status: "PENDING",
      },
    });

    // Task 2: Replace Inngest with synchronous analysis
    const useInngest = !!process.env.INNGEST_SIGNING_KEY;

    if (useInngest) {
      try {
        await inngest.send({
          name: "signal/analysis.requested",
          data: { signalId: signal.id },
        });
      } catch (err) {
        logger.error("Failed to trigger Inngest analysis", { error: String(err) });
      }
    } else {
      // Run analysis synchronously
      await prisma.signal.update({
        where: { id: signal.id },
        data: { status: "ANALYZING" },
      });

      try {
        const signalInput = {
          id: signal.id,
          sourceUrl: signal.sourceUrl,
          sourceType: signal.sourceType,
          title: signal.title,
          rawContent: signal.rawContent,
          publishedAt: signal.publishedAt,
          scrapedAt: signal.scrapedAt,
          companyId: signal.companyId,
          status: signal.status,
          company: {
            id: company.id,
            name: company.name,
            slug: company.slug,
            ticker: company.ticker,
          },
        };

        // Run Analyst agent pipeline
        const analystAnalysis = await analyzeSignalWithAgent(signalInput, ANALYST_CONFIG);

        // Create Analyst analysis record
        await prisma.analysis.create({
          data: {
            id: analystAnalysis.id,
            signalId: signal.id,
            agentPersona: "ANALYST",
            summary: analystAnalysis.summary,
            keyFacts: analystAnalysis.keyFacts,
            sentiment: analystAnalysis.sentiment,
            strategicThemes: analystAnalysis.strategicThemes,
            confidence: analystAnalysis.confidence,
            modelUsed: analystAnalysis.modelUsed,
            analyzedAt: new Date(analystAnalysis.analyzedAt),
          },
        });

        // Run Gossip Girl agent pipeline with cross-reference to Analyst
        const crossRefAnalyses: CrossRefAnalysis[] = [
          {
            id: analystAnalysis.id,
            agentPersona: analystAnalysis.agentPersona,
            summary: analystAnalysis.summary,
            keyFacts: analystAnalysis.keyFacts.map((f) => ({ text: f.text })),
            sentiment: analystAnalysis.sentiment,
            strategicThemes: analystAnalysis.strategicThemes.map((t) => ({
              label: t.label,
            })),
          },
        ];

        const gossipGirlAnalysis = await analyzeSignalWithAgent(
          signalInput,
          GOSSIP_GIRL_CONFIG,
          crossRefAnalyses
        );

        // Create Gossip Girl analysis record
        await prisma.analysis.create({
          data: {
            id: gossipGirlAnalysis.id,
            signalId: signal.id,
            agentPersona: "GOSSIP_GIRL",
            summary: gossipGirlAnalysis.summary,
            keyFacts: gossipGirlAnalysis.keyFacts,
            sentiment: gossipGirlAnalysis.sentiment,
            strategicThemes: gossipGirlAnalysis.strategicThemes,
            confidence: gossipGirlAnalysis.confidence,
            modelUsed: gossipGirlAnalysis.modelUsed,
            crossReferences: gossipGirlAnalysis.crossReferences ?? undefined,
            analyzedAt: new Date(gossipGirlAnalysis.analyzedAt),
          },
        });

        await prisma.signal.update({
          where: { id: signal.id },
          data: { status: "ANALYZED" },
        });

        // Generate articles for both agents
        try {
          // Generate Analyst article with cross-reference to Gossip Girl
          const analystArticleInput = {
            companyId: signal.companyId,
            companyName: company.name,
            analyses: [
              {
                summary: analystAnalysis.summary,
                keyFacts: analystAnalysis.keyFacts.map((f) => ({ text: f.text })),
                sentiment: analystAnalysis.sentiment,
                strategicThemes: analystAnalysis.strategicThemes.map((t) => ({
                  label: t.label,
                })),
              },
            ],
          };

          const crossRefForAnalystArticle = [
            {
              summary: gossipGirlAnalysis.summary,
              agentPersona: gossipGirlAnalysis.agentPersona,
              keyFacts: gossipGirlAnalysis.keyFacts.map((f) => f.text),
            },
          ];

          const analystArticleResult = await generateArticleWithAgent(
            analystArticleInput,
            ANALYST_CONFIG,
            crossRefForAnalystArticle
          );

          await prisma.article.create({
            data: {
              title: analystArticleResult.title,
              slug: analystArticleResult.slug,
              summary: analystArticleResult.summary,
              body: analystArticleResult.body,
              companyId: signal.companyId,
              agentPersona: "ANALYST",
              analysisIds: [analystAnalysis.id],
              status: "PUBLISHED",
              authorId: session.user.id,
              publishedAt: new Date(),
            },
          });

          // Generate Gossip Girl article with cross-reference to Analyst
          const gossipGirlArticleInput = {
            companyId: signal.companyId,
            companyName: company.name,
            analyses: [
              {
                summary: gossipGirlAnalysis.summary,
                keyFacts: gossipGirlAnalysis.keyFacts.map((f) => ({ text: f.text })),
                sentiment: gossipGirlAnalysis.sentiment,
                strategicThemes: gossipGirlAnalysis.strategicThemes.map((t) => ({
                  label: t.label,
                })),
              },
            ],
          };

          const crossRefForArticle = [
            {
              summary: analystAnalysis.summary,
              agentPersona: analystAnalysis.agentPersona,
              keyFacts: analystAnalysis.keyFacts.map((f) => f.text),
            },
          ];

          const gossipGirlArticleResult = await generateArticleWithAgent(
            gossipGirlArticleInput,
            GOSSIP_GIRL_CONFIG,
            crossRefForArticle
          );

          await prisma.article.create({
            data: {
              title: gossipGirlArticleResult.title,
              slug: gossipGirlArticleResult.slug,
              summary: gossipGirlArticleResult.summary,
              body: gossipGirlArticleResult.body,
              companyId: signal.companyId,
              agentPersona: "GOSSIP_GIRL",
              analysisIds: [gossipGirlAnalysis.id],
              status: "PUBLISHED",
              authorId: session.user.id,
              publishedAt: new Date(),
            },
          });
        } catch (articleErr) {
          logger.error("Article generation failed", { error: String(articleErr) });
        }
      } catch (err) {
        logger.error("Analysis failed", { error: String(err) });
        await prisma.signal.update({
          where: { id: signal.id },
          data: { status: "FAILED" },
        });
      }
    }

    return NextResponse.json(signal, { status: 201 });
  } catch (error) {
    logger.error("Error creating signal", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to create signal" },
      { status: 500 }
    );
  }
}

type ScraperInstance =
  | { scrapeArticle: (url: string) => Promise<{ title: string; bodyText: string; publishedAt: Date | null } | null> }
  | { scrapePost: (url: string) => Promise<{ bodyText: string; publishedAt: Date | null } | null> }
  | { scrapeJob: (url: string) => Promise<{ title: string; description: string; postedAt: Date | null } | null> }
  | { scrapeFeed: (url: string) => Promise<{ title: string; link: string; description: string; lastBuildDate: Date | null; items: Array<{ title: string; link: string; description: string; content: string; pubDate: Date | null; guid?: string }> } | null> };

function createScraper(sourceType: SourceType): ScraperInstance | null {
  switch (sourceType) {
    case "NEWS":
      return new NewsScraper();
    case "BLOG":
      return new BlogScraper();
    case "SOCIAL":
      return new SocialScraper();
    case "JOB_POSTING":
      return new JobPostingScraper();
    case "FILING":
      return new FilingScraper();
    case "TRANSCRIPT":
      return new TranscriptScraper();
    case "RSS":
      return new RssScraper();
    default:
      return null;
  }
}

async function scrapeWithSource(
  scraper: ScraperInstance,
  sourceType: SourceType,
  url: string,
): Promise<{ title: string; bodyText: string; publishedAt: Date | null } | null> {
  if ("scrapeArticle" in scraper) {
    const article = await scraper.scrapeArticle(url);
    if (!article || !article.bodyText) return null;
    return { title: article.title, bodyText: article.bodyText, publishedAt: article.publishedAt };
  }

  if ("scrapePost" in scraper) {
    const post = await scraper.scrapePost(url);
    if (!post || !post.bodyText) return null;
    const title = post.bodyText.length > 100 ? post.bodyText.slice(0, 100) : post.bodyText;
    return { title, bodyText: post.bodyText, publishedAt: post.publishedAt };
  }

  if ("scrapeJob" in scraper) {
    const job = await scraper.scrapeJob(url);
    if (!job || !job.description) return null;
    return { title: job.title, bodyText: job.description, publishedAt: job.postedAt };
  }

  if ("scrapeFeed" in scraper) {
    // For RSS feeds, check if this URL is a known feed
    const companyFeed = getCompanyByFeedUrl(url);
    if (companyFeed) {
      // This is a feed URL - return feed metadata as the signal
      const feed = await scraper.scrapeFeed(url);
      if (!feed) return null;
      
      // Use the most recent item from the feed
      const latestItem = feed.items[0];
      if (!latestItem) return null;
      
      return {
        title: latestItem.title,
        bodyText: latestItem.content || latestItem.description,
        publishedAt: latestItem.pubDate,
      };
    }
    
    // Not a known feed - try to scrape as a regular article
    return null;
  }

  return null;
}
