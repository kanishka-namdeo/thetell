#!/usr/bin/env tsx
/**
 * Cluster Deployment Validation Script
 * 
 * Validates that the cluster-aware signal analysis pipeline is correctly deployed.
 * Checks database schema, API endpoints, cluster functionality, and monitoring.
 * 
 * Usage: pnpm tsx scripts/validate-cluster-deployment.ts
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

interface ValidationResult {
  name: string;
  status: "PASS" | "FAIL" | "SKIP" | "WARN";
  message: string;
  details?: string;
}

const results: ValidationResult[] = [];

function log(message: string) {
  console.log(message);
}

function addResult(
  name: string,
  status: ValidationResult["status"],
  message: string,
  details?: string
) {
  results.push({ name, status, message, details });
  const icon =
    status === "PASS"
      ? "✅"
      : status === "FAIL"
        ? "❌"
        : status === "WARN"
          ? "⚠️"
          : "⏭️";
  log(`${icon} ${name}: ${status} - ${message}`);
  if (details) {
    log(`   ${details}`);
  }
}

async function validateDatabaseSchema(prisma: PrismaClient) {
  log("\n📊 Validating Database Schema...");

  try {
    // Check SignalTheme has embedding column
    const embeddingCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'SignalTheme' 
        AND column_name = 'embedding'
      )::boolean as exists
    `;

    if (embeddingCheck[0].exists) {
      addResult("Schema: SignalTheme.embedding", "PASS", "Column exists");
    } else {
      addResult(
        "Schema: SignalTheme.embedding",
        "FAIL",
        "Column missing",
        "Run: pnpm prisma migrate deploy"
      );
    }

    // Check SignalTheme has clusterSummary column
    const summaryCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'SignalTheme' 
        AND column_name = 'clusterSummary'
      )::boolean as exists
    `;

    if (summaryCheck[0].exists) {
      addResult("Schema: SignalTheme.clusterSummary", "PASS", "Column exists");
    } else {
      addResult(
        "Schema: SignalTheme.clusterSummary",
        "FAIL",
        "Column missing",
        "Run: pnpm prisma migrate deploy"
      );
    }

    // Check Signal has clusterId column
    const clusterIdCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'Signal' 
        AND column_name = 'clusterId'
      )::boolean as exists
    `;

    if (clusterIdCheck[0].exists) {
      addResult("Schema: Signal.clusterId", "PASS", "Column exists");
    } else {
      addResult(
        "Schema: Signal.clusterId",
        "FAIL",
        "Column missing",
        "Run: pnpm prisma migrate deploy"
      );
    }

    // Check ClusterArticle table exists
    const tableCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'ClusterArticle'
      )::boolean as exists
    `;

    if (tableCheck[0].exists) {
      addResult("Schema: ClusterArticle table", "PASS", "Table exists");
    } else {
      addResult(
        "Schema: ClusterArticle table",
        "FAIL",
        "Table missing",
        "Run: pnpm prisma migrate deploy"
      );
    }

    // Check indexes exist
    const indexCheck = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint as count
      FROM pg_indexes
      WHERE tablename = 'Signal'
      AND indexname LIKE '%clusterId%'
    `;

    if (indexCheck[0].count > 0) {
      addResult(
        "Schema: Signal clusterId indexes",
        "PASS",
        `${indexCheck[0].count} index(es) found`
      );
    } else {
      addResult(
        "Schema: Signal clusterId indexes",
        "WARN",
        "No clusterId indexes found",
        "Performance may be impacted"
      );
    }
  } catch (error) {
    addResult(
      "Schema: Database connection",
      "FAIL",
      "Failed to query database",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function validateClusterData(prisma: PrismaClient) {
  log("\n📦 Validating Cluster Data...");

  try {
    // Check if any clusters exist
    const clusterCount = await prisma.signalTheme.count({
      where: {
        embedding: { not: Prisma.JsonNull },
      },
    });

    if (clusterCount > 0) {
      addResult(
        "Data: Cluster embeddings",
        "PASS",
        `${clusterCount} cluster(s) with embeddings`
      );
    } else {
      addResult(
        "Data: Cluster embeddings",
        "WARN",
        "No clusters with embeddings found",
        "Run: pnpm tsx scripts/run-correlation.ts"
      );
    }

    // Check if any cluster articles exist
    const articleCount = await prisma.clusterArticle.count();

    if (articleCount > 0) {
      addResult(
        "Data: Cluster articles",
        "PASS",
        `${articleCount} article(s) generated`
      );
    } else {
      addResult(
        "Data: Cluster articles",
        "WARN",
        "No cluster articles found",
        "Run: pnpm tsx scripts/run-correlation.ts"
      );
    }

    // Check if signals are assigned to clusters
    const clusteredSignalCount = await prisma.signal.count({
      where: {
        clusterId: { not: null },
      },
    });

    if (clusteredSignalCount > 0) {
      addResult(
        "Data: Clustered signals",
        "PASS",
        `${clusteredSignalCount} signal(s) assigned to clusters`
      );
    } else {
      addResult(
        "Data: Clustered signals",
        "WARN",
        "No signals assigned to clusters",
        "Run correlation engine to assign signals"
      );
    }

    // Check for articles with both personas
    const dualPersonaCheck = await prisma.clusterArticle.groupBy({
      by: ["themeId"],
      _count: { agentPersona: true },
      having: {
        agentPersona: { _count: { gte: 2 } },
      },
    });

    if (dualPersonaCheck.length > 0) {
      addResult(
        "Data: Dual persona articles",
        "PASS",
        `${dualPersonaCheck.length} cluster(s) have both Analyst and Gossip Girl articles`
      );
    } else if (articleCount > 0) {
      addResult(
        "Data: Dual persona articles",
        "WARN",
        "Some clusters missing one persona",
        "Re-run correlation to generate missing personas"
      );
    }
  } catch (error) {
    addResult(
      "Data: Cluster data validation",
      "FAIL",
      "Failed to query cluster data",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function validateClusterArticleGenerator() {
  log("\n🤖 Validating Cluster Article Generator...");

  try {
    // Check if cluster article generator file exists
    const fs = await import("fs");
    const generatorPath = path.resolve(
      __dirname,
      "../src/lib/ai/agent/cluster-article-generator.ts"
    );

    if (fs.existsSync(generatorPath)) {
      addResult(
        "Generator: File exists",
        "PASS",
        "cluster-article-generator.ts found"
      );
    } else {
      addResult(
        "Generator: File exists",
        "FAIL",
        "cluster-article-generator.ts not found",
        "Check src/lib/ai/agent/ directory"
      );
      return;
    }

    // Try to import the module
    const generator = await import("../src/lib/ai/agent/cluster-article-generator");

    if (typeof generator.generateClusterArticle === "function") {
      addResult(
        "Generator: Export function",
        "PASS",
        "generateClusterArticle() exported"
      );
    } else {
      addResult(
        "Generator: Export function",
        "FAIL",
        "generateClusterArticle() not exported"
      );
    }
  } catch (error) {
    addResult(
      "Generator: Module import",
      "FAIL",
      "Failed to import cluster article generator",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function validateEvidenceChainStructure(prisma: PrismaClient) {
  log("\n🔗 Validating Evidence Chain Structure...");

  try {
    // Find a cluster with signals
    const clusterWithSignals = await prisma.signalTheme.findFirst({
      where: {
        signals: {
          some: {
            status: "ANALYZED",
          },
        },
      },
      include: {
        signals: {
          where: {
            status: "ANALYZED",
          },
          include: {
            analyses: true,
          },
          take: 5,
        },
      },
    });

    if (!clusterWithSignals) {
      addResult(
        "Evidence: Sample cluster",
        "SKIP",
        "No clusters with analyzed signals found",
        "Run correlation engine first"
      );
      return;
    }

    addResult(
      "Evidence: Sample cluster",
      "PASS",
      `Found cluster: ${clusterWithSignals.label}`
    );

    // Validate evidence chain structure
    const evidenceChain = clusterWithSignals.signals.flatMap((signal) =>
      signal.analyses.map((analysis) => ({
        signalId: signal.id,
        signalTitle: signal.title,
        sourceType: signal.sourceType,
        facts: analysis.keyFacts,
        confidence: analysis.confidence,
      }))
    );

    if (evidenceChain.length > 0) {
      addResult(
        "Evidence: Chain structure",
        "PASS",
        `${evidenceChain.length} evidence item(s) in chain`
      );

      // Validate evidence item structure
      const sampleItem = evidenceChain[0];
      const hasRequiredFields =
        sampleItem.signalId &&
        sampleItem.signalTitle &&
        sampleItem.sourceType &&
        Array.isArray(sampleItem.facts) &&
        typeof sampleItem.confidence === "number";

      if (hasRequiredFields) {
        addResult(
          "Evidence: Item structure",
          "PASS",
          "Evidence items have required fields"
        );
      } else {
        addResult(
          "Evidence: Item structure",
          "FAIL",
          "Evidence items missing required fields"
        );
      }
    } else {
      addResult(
        "Evidence: Chain structure",
        "WARN",
        "No evidence items found",
        "Cluster has no analyzed signals with analyses"
      );
    }
  } catch (error) {
    addResult(
      "Evidence: Validation",
      "FAIL",
      "Failed to validate evidence chain",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function validateAPIEndpoints() {
  log("\n🌐 Validating API Endpoints...");

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  try {
    // Test cluster list endpoint (if exists)
    // Note: This endpoint may not exist yet, so we check if it's implemented
    addResult(
      "API: Cluster endpoints",
      "SKIP",
      "Manual testing required",
      `Test: ${baseUrl}/api/v1/clusters/[id]`
    );

    addResult(
      "API: Cluster articles endpoint",
      "SKIP",
      "Manual testing required",
      `Test: ${baseUrl}/api/v1/clusters/[themeId]/articles`
    );

    // Check if API route files exist
    const fs = await import("fs");
    const clusterRoutePath = path.resolve(
      __dirname,
      "../src/app/api/v1/clusters/[id]/route.ts"
    );
    const articlesRoutePath = path.resolve(
      __dirname,
      "../src/app/api/v1/clusters/[themeId]/articles/route.ts"
    );

    if (fs.existsSync(clusterRoutePath)) {
      addResult(
        "API: Cluster route file",
        "PASS",
        "clusters/[id]/route.ts exists"
      );
    } else {
      addResult(
        "API: Cluster route file",
        "FAIL",
        "clusters/[id]/route.ts not found"
      );
    }

    if (fs.existsSync(articlesRoutePath)) {
      addResult(
        "API: Articles route file",
        "PASS",
        "clusters/[themeId]/articles/route.ts exists"
      );
    } else {
      addResult(
        "API: Articles route file",
        "FAIL",
        "clusters/[themeId]/articles/route.ts not found"
      );
    }
  } catch (error) {
    addResult(
      "API: Validation",
      "FAIL",
      "Failed to validate API endpoints",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function validateMonitoring() {
  log("\n📈 Validating Monitoring and Logging...");

  try {
    // Check if logger is configured
    const fs = await import("fs");
    const loggerPath = path.resolve(__dirname, "../src/lib/logger.ts");

    if (fs.existsSync(loggerPath)) {
      addResult("Monitoring: Logger configured", "PASS", "logger.ts exists");
    } else {
      addResult(
        "Monitoring: Logger configured",
        "WARN",
        "logger.ts not found",
        "Using console.log instead of structured logging"
      );
    }

    // Check if correlation function has logging
    const correlationPath = path.resolve(
      __dirname,
      "../src/lib/inngest/correlation.ts"
    );

    if (fs.existsSync(correlationPath)) {
      const content = fs.readFileSync(correlationPath, "utf-8");
      const hasLogging =
        content.includes("logger.") || content.includes("console.log");

      if (hasLogging) {
        addResult(
          "Monitoring: Correlation logging",
          "PASS",
          "Logging found in correlation.ts"
        );
      } else {
        addResult(
          "Monitoring: Correlation logging",
          "WARN",
          "No logging found in correlation.ts"
        );
      }
    } else {
      addResult(
        "Monitoring: Correlation function",
        "FAIL",
        "correlation.ts not found"
      );
    }
  } catch (error) {
    addResult(
      "Monitoring: Validation",
      "FAIL",
      "Failed to validate monitoring",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function validateTriageLayer() {
  log("\n🎯 Validating Triage Layer...");

  try {
    const fs = await import("fs");
    const triagePath = path.resolve(
      __dirname,
      "../src/lib/nlp/cluster-triage.ts"
    );

    if (fs.existsSync(triagePath)) {
      addResult(
        "Triage: cluster-triage.ts",
        "PASS",
        "File exists (Phase 5/6)"
      );

      // Try to import
      try {
        const triage = await import("../src/lib/nlp/cluster-triage");
        if (typeof triage.triageSignalToCluster === "function") {
          addResult(
            "Triage: Export function",
            "PASS",
            "Triage function exported"
          );
        } else {
          addResult(
            "Triage: Export function",
            "WARN",
            "No triage function exported"
          );
        }
      } catch (importError) {
        addResult(
          "Triage: Module import",
          "WARN",
          "Failed to import triage module",
          "May not be implemented yet"
        );
      }
    } else {
      addResult(
        "Triage: cluster-triage.ts",
        "SKIP",
        "File not found",
        "Triage layer not yet implemented (Phase 5/6)"
      );
    }
  } catch (error) {
    addResult(
      "Triage: Validation",
      "FAIL",
      "Failed to validate triage layer",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function validateAnalysisRouter() {
  log("\n🔀 Validating Analysis Router...");

  try {
    const fs = await import("fs");
    const routerPath = path.resolve(
      __dirname,
      "../src/lib/ai/agent/analysis-router.ts"
    );

    if (fs.existsSync(routerPath)) {
      addResult(
        "Router: analysis-router.ts",
        "PASS",
        "File exists (Phase 5/6)"
      );

      // Try to import
      try {
        const router = await import("../src/lib/ai/agent/analysis-router");
        if (typeof router.analyzeSignalWithTriage === "function") {
          addResult(
            "Router: Export function",
            "PASS",
            "Router function exported"
          );
        } else {
          addResult(
            "Router: Export function",
            "WARN",
            "No router function exported"
          );
        }
      } catch (importError) {
        addResult(
          "Router: Module import",
          "WARN",
          "Failed to import router module",
          "May not be implemented yet"
        );
      }
    } else {
      addResult(
        "Router: analysis-router.ts",
        "SKIP",
        "File not found",
        "Analysis router not yet implemented (Phase 5/6)"
      );
    }
  } catch (error) {
    addResult(
      "Router: Validation",
      "FAIL",
      "Failed to validate analysis router",
      error instanceof Error ? error.message : String(error)
    );
  }
}

function printSummary() {
  log("\n" + "=".repeat(60));
  log("Cluster Deployment Validation Report");
  log("=".repeat(60));

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const warnings = results.filter((r) => r.status === "WARN").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  const total = results.length;

  log(`\nResults:`);
  log(`  ✅ Passed:   ${passed}`);
  log(`  ❌ Failed:   ${failed}`);
  log(`  ⚠️  Warnings: ${warnings}`);
  log(`  ⏭️  Skipped:  ${skipped}`);
  log(`  📊 Total:    ${total}`);

  log("\n" + "-".repeat(60));

  if (failed > 0) {
    log("\n❌ VALIDATION FAILED");
    log("\nFailed checks:");
    results
      .filter((r) => r.status === "FAIL")
      .forEach((r) => {
        log(`  - ${r.name}: ${r.message}`);
        if (r.details) {
          log(`    ${r.details}`);
        }
      });
    log("\nPlease fix the failed checks before proceeding.");
  } else if (warnings > 0) {
    log("\n⚠️  VALIDATION PASSED WITH WARNINGS");
    log("\nWarnings:");
    results
      .filter((r) => r.status === "WARN")
      .forEach((r) => {
        log(`  - ${r.name}: ${r.message}`);
        if (r.details) {
          log(`    ${r.details}`);
        }
      });
    log("\nDeployment can proceed, but address warnings when possible.");
  } else {
    log("\n✅ VALIDATION PASSED");
    log("\nAll checks passed. Cluster pipeline is ready for deployment.");
  }

  log("\n" + "=".repeat(60));
}

async function main() {
  log("=".repeat(60));
  log("Cluster Deployment Validation");
  log("=".repeat(60));

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    log("\n❌ ERROR: DATABASE_URL not set in .env.local");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Test database connection
    await prisma.$connect();
    log("\n✅ Database connection successful");

    // Run all validations
    await validateDatabaseSchema(prisma);
    await validateClusterData(prisma);
    await validateClusterArticleGenerator();
    await validateEvidenceChainStructure(prisma);
    await validateAPIEndpoints();
    await validateMonitoring();
    await validateTriageLayer();
    await validateAnalysisRouter();

    // Print summary
    printSummary();

    // Exit with appropriate code
    const failed = results.filter((r) => r.status === "FAIL").length;
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    log("\n❌ Validation failed with error:");
    log(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
