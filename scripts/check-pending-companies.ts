import "dotenv/config";
import { prisma } from "@/lib/db";

async function main() {
  const statusCounts = await prisma.signal.groupBy({
    by: ["status"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  console.log("Signal counts by status:\n");
  let total = 0;
  for (const row of statusCounts) {
    console.log(`  ${row.status}: ${row._count.id}`);
    total += row._count.id;
  }
  console.log(`\n  TOTAL: ${total}`);

  const nonAnalyzed = statusCounts.filter((r) => r.status !== "ANALYZED");
  if (nonAnalyzed.length > 0) {
    console.log("\n--- Breakdown by company for non-ANALYZED signals ---\n");

    for (const statusRow of nonAnalyzed) {
      const byCompany = await prisma.signal.groupBy({
        by: ["companyId"],
        where: { status: statusRow.status },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      });

      const companyIds = byCompany.map((r) => r.companyId);
      const companies = await prisma.company.findMany({
        where: { id: { in: companyIds } },
        select: { id: true, name: true },
      });
      const companyMap = new Map(companies.map((c) => [c.id, c.name]));

      console.log(`[${statusRow.status}] (${statusRow._count.id} total):`);
      for (const row of byCompany) {
        const name = companyMap.get(row.companyId) ?? "Unknown";
        console.log(`  ${name}: ${row._count.id}`);
      }
      console.log();
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
