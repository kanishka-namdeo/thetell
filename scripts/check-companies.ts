import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { prisma } = await import("../src/lib/db");

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      ticker: true,
      _count: { select: { dataSources: true, signals: true } },
    },
  });

  console.log("=== Company Details ===");
  for (const c of companies) {
    console.log(c.name);
    console.log("  ID:", c.id);
    console.log("  Website:", c.websiteUrl || "NONE");
    console.log("  Ticker:", c.ticker || "NONE");
    console.log("  Data Sources:", c._count.dataSources);
    console.log("  Signals:", c._count.signals);
    console.log();
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
