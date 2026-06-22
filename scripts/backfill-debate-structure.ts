import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Starting debate backfill...");
  
  const debates = await prisma.crossSignalDebate.findMany({
    where: { analystClaim: "" },
  });
  
  console.log(`Found ${debates.length} debates to backfill`);
  
  let backfilled = 0;
  let skipped = 0;
  
  for (const debate of debates) {
    try {
      const parsed = JSON.parse(debate.debateTranscript);
      
      // Handle possible field name variations (camelCase vs snake_case)
      const analystPos = parsed.analystPosition ?? parsed.analyst_position ?? {};
      const gossipPos = parsed.gossipGirlPosition ?? parsed.gossip_girl_position ?? {};
      const agreements = parsed.pointsOfAgreement ?? parsed.points_of_agreement ?? [];
      const contentions = parsed.pointsOfContention ?? parsed.points_of_contention ?? [];
      const synthesis = parsed.synthesis ?? "";
      
      await prisma.crossSignalDebate.update({
        where: { id: debate.id },
        data: {
          analystClaim: analystPos.claim ?? "",
          analystEvidence: analystPos.evidence ?? [],
          analystConfidence: analystPos.confidence ?? 0.5,
          gossipClaim: gossipPos.claim ?? "",
          gossipEvidence: gossipPos.evidence ?? [],
          gossipTellStrength: gossipPos.tellStrength ?? gossipPos.tell_strength ?? 0.5,
          agreements: Array.isArray(agreements) ? agreements : [],
          contentions: Array.isArray(contentions) ? contentions : [],
          synthesisText: typeof synthesis === "string" ? synthesis : "",
        },
      });
      
      backfilled++;
      console.log(`  Backfilled: ${debate.id}`);
    } catch (err) {
      skipped++;
      console.warn(`  Skipped ${debate.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  
  console.log(`\nDone. Backfilled: ${backfilled}, Skipped: ${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
