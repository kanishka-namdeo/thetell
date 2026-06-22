import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { generateArticleWithAgent } from '../src/lib/ai/agent/article-generator';
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from '../src/lib/ai/agent/personas';
import { logger } from '../src/lib/logger';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function regenerateArticles() {
  logger.info('Starting article regeneration');

  const analyses = await prisma.analysis.findMany({
    include: {
      signal: {
        include: {
          company: true,
        },
      },
    },
  });

  logger.info(`Found ${analyses.length} analyses to process`);

  const analysesBySignal = new Map<string, typeof analyses>();
  for (const analysis of analyses) {
    const signalId = analysis.signalId;
    if (!analysesBySignal.has(signalId)) {
      analysesBySignal.set(signalId, []);
    }
    analysesBySignal.get(signalId)!.push(analysis);
  }

  for (const [signalId, signalAnalyses] of analysesBySignal) {
    const signal = signalAnalyses[0].signal;
    if (!signal.company) {
      logger.warn(`Signal ${signalId} has no company, skipping`);
      continue;
    }

    logger.info(`Regenerating articles for signal ${signalId}`);

    await prisma.article.deleteMany({
      where: {
        companyId: signal.companyId,
        agentPersona: { in: ['ANALYST', 'GOSSIP_GIRL'] },
        id: {
          in: signalAnalyses.map((a) => a.id),
        },
      },
    });

    const analystAnalysis = signalAnalyses.find((a) => a.agentPersona === 'ANALYST');
    const gossipAnalysis = signalAnalyses.find((a) => a.agentPersona === 'GOSSIP_GIRL');

    try {
      if (analystAnalysis) {
        const analystArticleInput = {
          companyId: signal.companyId,
          companyName: signal.company.name,
          analyses: [
            {
              summary: analystAnalysis.summary,
              keyFacts: (analystAnalysis.keyFacts as Array<{ text: string }>).map((f) => ({
                text: f.text,
              })),
              sentiment: analystAnalysis.sentiment,
              strategicThemes: (analystAnalysis.strategicThemes as Array<{ label: string }>).map(
                (t) => ({ label: t.label })
              ),
            },
          ],
        };

        const crossRefForAnalyst = gossipAnalysis
          ? [
              {
                summary: gossipAnalysis.summary,
                agentPersona: gossipAnalysis.agentPersona,
                keyFacts: (gossipAnalysis.keyFacts as Array<{ text: string }>).map((f) => f.text),
              },
            ]
          : undefined;

        const analystArticleResult = await generateArticleWithAgent(
          analystArticleInput,
          ANALYST_CONFIG,
          crossRefForAnalyst
        );

        await prisma.article.create({
          data: {
            title: analystArticleResult.title,
            slug: analystArticleResult.slug,
            summary: analystArticleResult.summary,
            body: analystArticleResult.body,
            companyId: signal.companyId,
            agentPersona: 'ANALYST',
            analysisIds: [analystAnalysis.id],
            status: 'PUBLISHED',
            publishedAt: new Date(),
          },
        });

        logger.info(`Generated Analyst article for signal ${signalId}`);
      }

      if (gossipAnalysis) {
        const gossipArticleInput = {
          companyId: signal.companyId,
          companyName: signal.company.name,
          analyses: [
            {
              summary: gossipAnalysis.summary,
              keyFacts: (gossipAnalysis.keyFacts as Array<{ text: string }>).map((f) => ({
                text: f.text,
              })),
              sentiment: gossipAnalysis.sentiment,
              strategicThemes: (gossipAnalysis.strategicThemes as Array<{ label: string }>).map(
                (t) => ({ label: t.label })
              ),
            },
          ],
        };

        const crossRefForGossip = analystAnalysis
          ? [
              {
                summary: analystAnalysis.summary,
                agentPersona: analystAnalysis.agentPersona,
                keyFacts: (analystAnalysis.keyFacts as Array<{ text: string }>).map((f) => f.text),
              },
            ]
          : undefined;

        const gossipArticleResult = await generateArticleWithAgent(
          gossipArticleInput,
          GOSSIP_GIRL_CONFIG,
          crossRefForGossip
        );

        await prisma.article.create({
          data: {
            title: gossipArticleResult.title,
            slug: gossipArticleResult.slug,
            summary: gossipArticleResult.summary,
            body: gossipArticleResult.body,
            companyId: signal.companyId,
            agentPersona: 'GOSSIP_GIRL',
            analysisIds: [gossipAnalysis.id],
            status: 'PUBLISHED',
            publishedAt: new Date(),
          },
        });

        logger.info(`Generated Gossip Girl article for signal ${signalId}`);
      }
    } catch (error) {
      logger.error(`Failed to regenerate articles for signal ${signalId}`, {
        error: String(error),
      });
    }
  }

  logger.info('Article regeneration complete');
  await prisma.$disconnect();
}

regenerateArticles().catch((error) => {
  logger.error('Regeneration script failed', { error: String(error) });
  process.exit(1);
});
