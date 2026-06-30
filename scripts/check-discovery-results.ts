import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { prisma } = await import("../src/lib/db");

  console.log("=== Signal Discovery Results ===\n");

  // Check pipeline runs
  const pipelineRuns = await prisma.pipelineRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    select: {
      id: true,
      scraperName: true,
      sourceType: true,
      status: true,
      signalsCreated: true,
      duplicatesSkipped: true,
      startedAt: true,
      completedAt: true,
      error: true,
      company: {
        select: {
          name: true,
        },
      },
    },
  });

  console.log("Recent Pipeline Runs:");
  console.log("-".repeat(100));
  for (const run of pipelineRuns) {
    const duration = run.completedAt && run.startedAt
      ? Math.round((run.completedAt.getTime() - run.startedAt.getTime()) / 1000)
      : "running";
    const status = run.status === "completed" ? "✓" : run.status === "failed" ? "✗" : "⏳";
    console.log(
      `${status} ${run.scraperName.padEnd(20)} | ${run.company.name.padEnd(25)} | ${run.sourceType.padEnd(15)} | ${run.signalsCreated} signals | ${duration}s`
    );
    if (run.error) {
      console.log(`  Error: ${run.error}`);
    }
  }

  // Check signal counts per company
  console.log("\n\n=== Signal Counts by Company ===\n");
  console.log("-".repeat(60));

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          signals: true,
        },
      },
    },
    orderBy: {
      signals: {
        _count: "desc",
      },
    },
  });

  for (const company of companies) {
    console.log(`${company.name.padEnd(30)} ${company._count.signals} signals`);
  }

  // Check signal types
  console.log("\n\n=== Signal Types Distribution ===\n");
  console.log("-".repeat(60));

  const signalTypes = await prisma.signal.groupBy({
    by: ["sourceType"],
    _count: {
      sourceType: true,
    },
    orderBy: {
      _count: {
        sourceType: "desc",
      },
    },
  });

  for (const type of signalTypes) {
    console.log(`${type.sourceType.padEnd(20)} ${type._count.sourceType} signals`);
  }

  // Total signals
  const totalSignals = await prisma.signal.count();
  console.log(`\nTotal signals: ${totalSignals}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
