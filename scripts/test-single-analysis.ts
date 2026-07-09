import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Testing Single Signal Analysis ===\n");

  // Pick one PENDING signal
  const signal = await prisma.signal.findFirst({
    where: { status: "PENDING" },
    include: { company: true },
  });

  if (!signal) {
    console.log("No PENDING signals found");
    await prisma.$disconnect();
    return;
  }

  console.log(`Testing signal: ${signal.id}`);
  console.log(`Title: ${signal.title.substring(0, 60)}...`);
  console.log(`Company: ${signal.company?.name}`);
  console.log(`Content length: ${signal.rawContent.length} chars\n`);

  // Test language detection
  console.log("Testing language detection...");
  try {
    const { detectLanguage } = await import("@/lib/nlp");
    const langResult = await detectLanguage(signal.rawContent);
    console.log(`Language: ${langResult.language} (confidence: ${langResult.confidence})`);
  } catch (error) {
    console.log(`Language detection failed: ${error}`);
  }

  // Test quality assessment
  console.log("\nTesting quality assessment...");
  try {
    const { assessContentQuality } = await import("@/lib/nlp");
    const qualityResult = await assessContentQuality(signal.rawContent, signal.company?.name ?? "");
    console.log(`Quality score: ${qualityResult.score}`);
    console.log(`Pass: ${qualityResult.pass}`);
    console.log(`Reasons: ${qualityResult.reasons.join(", ")}`);
  } catch (error) {
    console.log(`Quality assessment failed: ${error}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
