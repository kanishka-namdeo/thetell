import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const FABRICATED_ARTICLE_SLUGS = [
  "apple-ai-push-record-services",
  "tesla-multi-front-expansion",
  "nvidia-ai-dominance-262-growth",
  "amd-ai-ambitions-data-center",
  "microsoft-ai-infrastructure-dominance",
];

const FABRICATED_THEME_LABELS = [
  "Services Growth Acceleration",
  "India Manufacturing Expansion",
  "Autonomous Driving Progress",
  "AI Infrastructure Investment",
  "Cloud AI Dominance",
];

async function main() {
  console.log("Cleaning up fabricated seed data...\n");

  // 1. Find fabricated signals (example.com URLs)
  const fabricatedSignals = await prisma.signal.findMany({
    where: { sourceUrl: { contains: "example.com" } },
    select: { id: true },
  });

  if (fabricatedSignals.length === 0) {
    console.log("No fabricated signals found. Database is clean.");
    return;
  }

  const signalIds = fabricatedSignals.map((s) => s.id);
  console.log(`Found ${signalIds.length} fabricated signals to remove.\n`);

  // 2. Delete fabricated articles by known slugs
  const deletedArticles = await prisma.article.deleteMany({
    where: { slug: { in: FABRICATED_ARTICLE_SLUGS } },
  });
  console.log(`  Deleted ${deletedArticles.count} fabricated articles`);

  // 3. Delete cross-signal debates linked to inferences derived from fabricated signals
  //    (CrossSignalDebate cascades from Inference, so deleting inferences handles it)

  // 4. Delete inference calibrations linked to fabricated inferences
  //    (InferenceCalibration cascades from Inference, so deleting inferences handles it)

  // 5. Delete inferences that reference fabricated signal IDs
  //    Inferences store signal IDs as JSON in supportingSignalIds.
  //    We delete any inference whose supportingSignalIds overlap with fabricated signals.
  const allInferences = await prisma.inference.findMany({
    select: { id: true, supportingSignalIds: true },
  });

  const fabricatedInferenceIds: string[] = [];
  for (const inf of allInferences) {
    const supportingIds = inf.supportingSignalIds as string[];
    if (supportingIds.some((id) => signalIds.includes(id))) {
      fabricatedInferenceIds.push(inf.id);
    }
  }

  if (fabricatedInferenceIds.length > 0) {
    // CrossSignalDebate and InferenceCalibration cascade from Inference
    const deletedInferences = await prisma.inference.deleteMany({
      where: { id: { in: fabricatedInferenceIds } },
    });
    console.log(`  Deleted ${deletedInferences.count} fabricated inferences (and cascading debates/calibrations)`);
  } else {
    console.log("  Deleted 0 fabricated inferences");
  }

  // 6. Delete fabricated signal themes by known labels
  const deletedThemes = await prisma.signalTheme.deleteMany({
    where: { label: { in: FABRICATED_THEME_LABELS } },
  });
  console.log(`  Deleted ${deletedThemes.count} fabricated signal themes`);

  // 7. Delete fabricated signals (analyses and agent debates cascade via onDelete: Cascade)
  const deletedSignals = await prisma.signal.deleteMany({
    where: { id: { in: signalIds } },
  });
  console.log(`  Deleted ${deletedSignals.count} fabricated signals (and cascading analyses/debates)`);

  // Summary
  console.log("\n--- Cleanup Summary ---");
  console.log(`  Signals:    ${deletedSignals.count}`);
  console.log(`  Articles:   ${deletedArticles.count}`);
  console.log(`  Inferences: ${fabricatedInferenceIds.length}`);
  console.log(`  Themes:     ${deletedThemes.count}`);
  console.log(`  (Analyses and AgentDebate records deleted via cascade)`);
  console.log("\nCleanup complete. Companies and users were not modified.");
}

main()
  .catch((e) => {
    console.error("Cleanup failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
