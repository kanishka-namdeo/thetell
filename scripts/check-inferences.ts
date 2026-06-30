import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const inferences = await prisma.inference.findMany({
    take: 5,
    include: {
      company: true,
      debate: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log('=== Recent Inferences ===\n');
  for (const inf of inferences) {
    console.log(`Title: ${inf.title}`);
    console.log(`Company: ${inf.company.name}`);
    console.log(`Confidence: ${inf.confidence.toFixed(2)}`);
    console.log(`Status: ${inf.status}`);
    
    if (inf.debate) {
      console.log('\nDebate:');
      console.log(`  Analyst Claim: ${inf.debate.analystClaim.substring(0, 100)}...`);
      console.log(`  Gossip Claim: ${inf.debate.gossipClaim.substring(0, 100)}...`);
      console.log(`  Analyst Confidence: ${inf.debate.analystConfidence.toFixed(2)}`);
      console.log(`  Gossip Tell Strength: ${inf.debate.gossipTellStrength.toFixed(2)}`);
      console.log(`  Agreements: ${(inf.debate.agreements as unknown[])?.length || 0}`);
      console.log(`  Contentions: ${(inf.debate.contentions as unknown[])?.length || 0}`);
      console.log(`  Synthesis: ${inf.debate.synthesisText.substring(0, 100)}...`);
    } else {
      console.log('Debate: None');
    }
    console.log('\n---\n');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
