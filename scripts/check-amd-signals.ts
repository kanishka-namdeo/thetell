import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { prisma } = await import("../src/lib/db");

  console.log("=== AMD Company Record ===\n");

  const amd = await prisma.company.findFirst({
    where: { name: { contains: "Advanced Micro Devices", mode: "insensitive" } },
    include: {
      signals: {
        take: 10,
        select: {
          id: true,
          title: true,
          sourceUrl: true,
          sourceType: true,
        },
      },
    },
  });

  console.log("Company ID:", amd?.id);
  console.log("Name:", amd?.name);
  console.log("Ticker:", amd?.ticker);
  console.log("Website:", amd?.websiteUrl);
  console.log("Signals count:", amd?.signals.length);

  console.log("\n=== Signals attributed to AMD ===");
  amd?.signals.forEach((s, i) => {
    console.log(`${i + 1}. [${s.sourceType}] ${s.title}`);
    console.log(`   URL: ${s.sourceUrl}`);
  });

  // Check if these signals actually mention AMD
  console.log("\n=== Checking signal content for AMD mentions ===");
  for (const signal of amd?.signals.slice(0, 5) || []) {
    const fullSignal = await prisma.signal.findUnique({
      where: { id: signal.id },
      select: { rawContent: true, title: true },
    });
    
    const content = (fullSignal?.title + " " + fullSignal?.rawContent).toLowerCase();
    const mentionsAmd = content.includes("amd") || content.includes("advanced micro devices");
    console.log(`\nSignal: ${signal.title}`);
    console.log(`  Mentions AMD: ${mentionsAmd}`);
    console.log(`  URL: ${signal.sourceUrl}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
