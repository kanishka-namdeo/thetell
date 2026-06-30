import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { prisma } = await import("../src/lib/db");

  const counts = {
    inferences: await prisma.inference.count(),
    signalThemes: await prisma.signalTheme.count(),
    crossSignalDebates: await prisma.crossSignalDebate.count(),
    agentDebates: await prisma.agentDebate.count(),
    companyHypotheses: await prisma.companyHypothesis.count(),
  };

  console.log("=== ADVANCED ANALYTICS ===");
  console.log(JSON.stringify(counts, null, 2));

  // Show sample inferences
  const inferences = await prisma.inference.findMany({
    take: 5,
    select: {
      id: true,
      title: true,
      confidence: true,
      status: true,
      supportingSignalIds: true,
      sourceTypesInvolved: true,
      company: { select: { name: true } },
    },
  });

  console.log("\n=== SAMPLE INFERENCES ===");
  for (const inf of inferences) {
    console.log(`\n${inf.title}`);
    console.log(`  Company: ${inf.company.name}`);
    console.log(`  Confidence: ${(inf.confidence * 100).toFixed(1)}%`);
    console.log(`  Status: ${inf.status}`);
    console.log(`  Supporting signals: ${(inf.supportingSignalIds as string[]).length}`);
    console.log(`  Source types: ${(inf.sourceTypesInvolved as string[]).join(", ")}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
