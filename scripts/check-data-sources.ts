import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { prisma } = await import("../src/lib/db");

  console.log("=== Data Sources by Company ===\n");

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      dataSources: {
        select: {
          id: true,
          sourceType: true,
          url: true,
        }
      }
    }
  });

  for (const company of companies) {
    console.log(`${company.name}:`);
    console.log(`  Data sources: ${company.dataSources.length}`);
    if (company.dataSources.length > 0) {
      const byType = company.dataSources.reduce((acc, ds) => {
        acc[ds.sourceType] = (acc[ds.sourceType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log(`  Types:`, byType);
    }
    console.log();
  }

  console.log("\n=== Signal Types by Company ===\n");

  for (const company of companies) {
    const signals = await prisma.signal.findMany({
      where: { companyId: company.id },
      select: { sourceType: true }
    });
    
    const byType = signals.reduce((acc, s) => {
      acc[s.sourceType] = (acc[s.sourceType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log(`${company.name}:`);
    console.log(`  Total signals: ${signals.length}`);
    console.log(`  Types:`, byType);
    console.log();
  }

  await prisma.$disconnect();
}

main().catch(console.error);
