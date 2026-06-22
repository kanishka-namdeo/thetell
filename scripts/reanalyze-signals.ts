import { config } from 'dotenv';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { analyzeSignalWithAgent } from '../src/lib/ai/agent/pipeline';
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from '../src/lib/ai/agent/personas';
import { extractSentimentLabel } from '../src/lib/ai/agent/types';
import { logger } from '../src/lib/logger';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function reanalyzeSignals() {
  logger.info('Starting signal re-analysis');

  const signals = await prisma.signal.findMany({
    where: { status: 'ANALYZED' },
    include: {
      company: true,
      analyses: true,
    },
  });

  logger.info(`Found ${signals.length} signals to re-analyze`);

  for (const signal of signals) {
    logger.info(`Re-analyzing signal ${signal.id}: ${signal.title}`);

    await prisma.analysis.deleteMany({
      where: { signalId: signal.id },
    });

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
      company: signal.company
        ? {
            id: signal.company.id,
            name: signal.company.name,
            slug: signal.company.slug,
            ticker: signal.company.ticker,
          }
        : undefined,
    };

    try {
      const analystAnalysis = await analyzeSignalWithAgent(
        signalInput,
        ANALYST_CONFIG
      );

      const analystSentimentLabel = extractSentimentLabel(analystAnalysis);

      await prisma.analysis.create({
        data: {
          id: analystAnalysis.id,
          signalId: signal.id,
          agentPersona: 'ANALYST',
          summary: analystAnalysis.summary,
          keyFacts: analystAnalysis.keyFacts as unknown as Prisma.InputJsonValue,
          sentiment: analystSentimentLabel,
          sentimentData: analystAnalysis.sentiment as unknown as Prisma.InputJsonValue,
          strategicThemes: analystAnalysis.strategicThemes as unknown as Prisma.InputJsonValue,
          confidence: analystAnalysis.confidence,
          modelUsed: analystAnalysis.modelUsed,
          analyzedAt: new Date(analystAnalysis.analyzedAt),
        },
      });

      const crossRefAnalyses = [
        {
          id: analystAnalysis.id,
          agentPersona: analystAnalysis.agentPersona,
          summary: analystAnalysis.summary,
          keyFacts: analystAnalysis.keyFacts.map((f) => ({ text: f.text })),
          sentiment: analystSentimentLabel,
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

      const gossipSentimentLabel = extractSentimentLabel(gossipGirlAnalysis);

      await prisma.analysis.create({
        data: {
          id: gossipGirlAnalysis.id,
          signalId: signal.id,
          agentPersona: 'GOSSIP_GIRL',
          summary: gossipGirlAnalysis.summary,
          keyFacts: gossipGirlAnalysis.keyFacts as unknown as Prisma.InputJsonValue,
          sentiment: gossipSentimentLabel,
          sentimentData: gossipGirlAnalysis.sentiment as unknown as Prisma.InputJsonValue,
          strategicThemes: gossipGirlAnalysis.strategicThemes as unknown as Prisma.InputJsonValue,
          confidence: gossipGirlAnalysis.confidence,
          modelUsed: gossipGirlAnalysis.modelUsed,
          crossReferences: gossipGirlAnalysis.crossReferences ?? undefined,
          analyzedAt: new Date(gossipGirlAnalysis.analyzedAt),
        },
      });

      logger.info(`Completed re-analysis for signal ${signal.id}`);
    } catch (error) {
      logger.error(`Failed to re-analyze signal ${signal.id}`, {
        error: String(error),
      });
    }
  }

  logger.info('Signal re-analysis complete');
  await prisma.$disconnect();
}

reanalyzeSignals().catch((error) => {
  logger.error('Re-analysis script failed', { error: String(error) });
  process.exit(1);
});
