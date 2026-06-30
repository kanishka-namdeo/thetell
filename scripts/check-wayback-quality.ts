/**
 * Check wayback signal quality after re-run.
 */
import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { prisma } = await import("../src/lib/db");

  console.log("=== Wayback Signal Quality Check ===\n");

  // Get recent wayback signals
  const recentSignals = await prisma.signal.findMany({
    where: { sourceType: "WEB_ARCHIVE" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      title: true,
      rawContent: true,
      status: true,
      createdAt: true,
      sourceUrl: true,
      metadata: true,
      company: { select: { name: true } },
      analyses: {
        take: 2,
        orderBy: { analyzedAt: "desc" },
        select: {
          id: true,
          confidence: true,
          keyFacts: true,
          agentPersona: true,
          analyzedAt: true,
        },
      },
    },
  });

  console.log(`Found ${recentSignals.length} recent wayback signals:\n`);

  for (const signal of recentSignals) {
    console.log(`📊 Signal: ${signal.title}`);
    console.log(`   Company: ${signal.company.name}`);
    console.log(`   Status: ${signal.status}`);
    console.log(`   Created: ${signal.createdAt.toISOString()}`);
    console.log(`   URL: ${signal.sourceUrl}`);
    console.log(`   Content length: ${signal.rawContent.length} chars`);
    console.log(`   Content preview: ${signal.rawContent.substring(0, 150)}...`);
    
    if (signal.metadata) {
      console.log(`   Metadata: ${JSON.stringify(signal.metadata, null, 2)}`);
    }

    if (signal.analyses.length > 0) {
      for (const analysis of signal.analyses) {
        console.log(`   ✓ Analysis [${analysis.agentPersona}]:`);
        console.log(`     - Confidence: ${analysis.confidence}`);
        console.log(`     - Status: ${analysis.status}`);
        console.log(`     - Facts count: ${(analysis.keyFacts as any[])?.length || 0}`);
        
        if ((analysis.keyFacts as any[])?.length > 0) {
          console.log(`     - Sample facts:`);
          (analysis.keyFacts as any[]).slice(0, 3).forEach((fact, i) => {
            console.log(`       ${i + 1}. ${fact.text || JSON.stringify(fact).substring(0, 100)}`);
          });
        }
      }
    } else {
      console.log(`   ⚠️  No analysis yet`);
    }
    console.log();
  }

  // Check signal status distribution
  const waybackSignals = await prisma.signal.findMany({
    where: { sourceType: "WEB_ARCHIVE" },
    select: { status: true, title: true },
  });

  const statusCounts = waybackSignals.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log(`\n📊 Signal status distribution (${waybackSignals.length} total):`);
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`   ${status}: ${count}`);
  }

  // Check confidence distribution
  const waybackAnalyses = await prisma.analysis.findMany({
    where: {
      signal: { sourceType: "WEB_ARCHIVE" },
    },
    select: { confidence: true, agentPersona: true },
  });

  if (waybackAnalyses.length > 0) {
    const confidences = waybackAnalyses.map((a) => a.confidence);
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const minConfidence = Math.min(...confidences);
    const maxConfidence = Math.max(...confidences);

    console.log(`\n📈 Confidence distribution for ${waybackAnalyses.length} completed wayback analyses:`);
    console.log(`   Average: ${avgConfidence.toFixed(3)}`);
    console.log(`   Min: ${minConfidence.toFixed(3)}`);
    console.log(`   Max: ${maxConfidence.toFixed(3)}`);
    console.log(`   Above 0.4: ${confidences.filter((c) => c >= 0.4).length}/${confidences.length}`);
    
    // Per persona
    const analystConf = waybackAnalyses.filter(a => a.agentPersona === "ANALYST").map(a => a.confidence);
    const gossipConf = waybackAnalyses.filter(a => a.agentPersona === "GOSSIP_GIRL").map(a => a.confidence);
    if (analystConf.length) {
      console.log(`   Analyst avg: ${(analystConf.reduce((a,b)=>a+b,0)/analystConf.length).toFixed(3)} (${analystConf.length} analyses)`);
    }
    if (gossipConf.length) {
      console.log(`   Gossip Girl avg: ${(gossipConf.reduce((a,b)=>a+b,0)/gossipConf.length).toFixed(3)} (${gossipConf.length} analyses)`);
    }
  }

  await prisma.$disconnect();
}

main();
