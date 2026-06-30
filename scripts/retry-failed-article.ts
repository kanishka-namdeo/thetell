import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";
import * as dotenv from "dotenv";
import * as path from "path";
import { generateArticleWithAgent } from "../src/lib/ai/agent/article-generator";
import { ANALYST_CONFIG } from "../src/lib/ai/agent/personas";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const connectionString = process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const signalId = "cmqpkjgdh0008tklnb9z2a0mf";
  console.log(`Retrying ANALYST article for signal: ${signalId}`);

  const signal = await prisma.signal.findUnique({
    where: { id: signalId },
    include: {
      analyses: {
        select: { id: true, agentPersona: true, summary: true, keyFacts: true, sentiment: true, strategicThemes: true, confidence: true },
      },
      company: { select: { id: true, name: true } },
    },
  });

  if (!signal || !signal.company) {
    console.error("Signal or company not found");
    process.exit(1);
  }

  const analysis = signal.analyses.find((a) => a.agentPersona === "ANALYST");
  if (!analysis) {
    console.error("ANALYST analysis not found");
    process.exit(1);
  }

  const article = await generateArticleWithAgent(
    {
      companyId: signal.company.id,
      companyName: signal.company.name,
      analyses: [{
        summary: analysis.summary,
        keyFacts: (analysis.keyFacts as any[]) || [],
        sentiment: analysis.sentiment as string,
        strategicThemes: (analysis.strategicThemes as any[]) || [],
      }],
      agentPersona: "ANALYST",
      sourceType: signal.sourceType,
    },
    ANALYST_CONFIG,
    undefined,
    "openai"
  );

  console.log(`Generated: ${article.title}`);

  const saved = await prisma.article.create({
    data: {
      title: article.title,
      slug: article.slug,
      summary: article.summary,
      body: article.body,
      agentPersona: "ANALYST",
      analysisIds: [analysis.id],
      company: { connect: { id: signal.company!.id } },
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  console.log(`Saved: ${saved.id}`);
  console.log(`Total articles now: ${await prisma.article.count()}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch(async (e) => { console.error(e); process.exit(1); });
