// Load all required environment variables from .env.local
process.env.DATABASE_URL = "postgresql://thell_user:thell_password@localhost:5433/the_tell";
process.env.API_KEY = "sk-sp-a1b32acc93a04c858a4395c2685eab86";
process.env.BASE_URL = "https://irhnglwoxe.a.pinggy.link/v1";
process.env.FAST_MODEL = "qwen3-coder-next";
process.env.REASONING_MODEL = "MiniMax-M2.5";
process.env.VISION_MODEL = "kimi-k2.5";
process.env.INNGEST_DEV = "1";

import { analyzeSignalWithTriage } from "../src/lib/ai/agent/analysis-router";
import { prisma } from "../src/lib/db";

async function main() {
  const signalId = "cmqw39ut2004ea8lnuhoixjw3";
  
  console.log("=== Analyzing signal", signalId, "===\n");

  // Check current signal status
  const signal = await prisma.signal.findUnique({
    where: { id: signalId },
    select: { id: true, title: true, status: true, rawContent: true }
  });

  if (!signal) {
    console.error("Signal not found");
    process.exit(1);
  }

  console.log("Current signal:");
  console.log("  Title:", signal.title);
  console.log("  Status:", signal.status);
  console.log("  Content length:", signal.rawContent?.length ?? 0);
  console.log();

  // Set status to PENDING if needed
  if (signal.status !== "PENDING") {
    console.log("Setting status to PENDING...");
    await prisma.signal.update({
      where: { id: signalId },
      data: { status: "PENDING" }
    });
  }

  try {
    console.log("Starting analysis...\n");
    const result = await analyzeSignalWithTriage(signalId);
    
    console.log("\n✓ Analysis complete:");
    console.log("  Path:", result.path);
    console.log("  Cluster ID:", result.clusterId || "none");
    
    console.log("\n=== Done ===");
    process.exit(0);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
