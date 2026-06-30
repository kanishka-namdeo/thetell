import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { prisma } = await import("../src/lib/db");

  console.log("=== Checking Data Sources for Tesla and AMD ===\n");

  const tesla = await prisma.company.findFirst({
    where: { name: { contains: "Tesla", mode: "insensitive" } },
    include: {
      dataSources: {
        select: {
          url: true,
          sourceType: true,
          label: true,
          discoveryMethod: true,
          createdAt: true,
        },
      },
    },
  });

  const amd = await prisma.company.findFirst({
    where: { name: { contains: "AMD", mode: "insensitive" } },
    include: {
      dataSources: {
        select: {
          url: true,
          sourceType: true,
          label: true,
          discoveryMethod: true,
          createdAt: true,
        },
      },
    },
  });

  console.log("Tesla, Inc.:");
  console.log(`  Data sources: ${tesla?.dataSources.length || 0}`);
  tesla?.dataSources.forEach((ds, i) => {
    console.log(`  ${i + 1}. [${ds.sourceType}] ${ds.label}`);
    console.log(`     URL: ${ds.url}`);
    console.log(`     Method: ${ds.discoveryMethod}`);
    console.log(`     Created: ${ds.createdAt.toISOString()}`);
  });

  console.log("\nAdvanced Micro Devices, Inc.:");
  console.log(`  Data sources: ${amd?.dataSources.length || 0}`);
  amd?.dataSources.forEach((ds, i) => {
    console.log(`  ${i + 1}. [${ds.sourceType}] ${ds.label}`);
    console.log(`     URL: ${ds.url}`);
    console.log(`     Method: ${ds.discoveryMethod}`);
    console.log(`     Created: ${ds.createdAt.toISOString()}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
