/**
 * Test script for individual MCP client functions.
 *
 * Usage:
 *   pnpm tsx scripts/test-mcp-clients.ts [function] [company]
 *
 * Examples:
 *   pnpm tsx scripts/test-mcp-clients.ts callSecEdgar Apple
 *   pnpm tsx scripts/test-mcp-clients.ts callGitHub Tesla
 *   pnpm tsx scripts/test-mcp-clients.ts all Microsoft
 *
 * Requires .env.local to be loaded (dotenv is configured via next.js config).
 */

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(__dirname, "../.env.local") });
import {
  callFreeSearch,
  callFreeSearchForSources,
  callSecEdgar,
  callGitHub,
  callUspto,
  callCourtListener,
  callJobData,
  type McpResult,
} from "../src/lib/pipeline/mcp-clients";

const functions: Record<string, (company: string) => Promise<McpResult>> = {
  callFreeSearch: (c) => callFreeSearch(`${c} company official website ticker`),
  callFreeSearchForSources: callFreeSearchForSources,
  callSecEdgar: callSecEdgar,
  callGitHub: callGitHub,
  callUspto: callUspto,
  callCourtListener: callCourtListener,
  callJobData: callJobData,
};

function printResult(name: string, result: McpResult) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${name} (${result.duration}ms)`);
  console.log("=".repeat(60));

  if (result.error) {
    console.log(`ERROR: ${result.error}`);
  }

  if (result.sources.length === 0) {
    console.log("No sources found.");
  } else {
    console.log(`Found ${result.sources.length} source(s):`);
    for (const source of result.sources) {
      console.log(`  [${source.sourceType}] ${source.label || "Untitled"}`);
      console.log(`    URL: ${source.url}`);
      if (source.priority) console.log(`    Priority: ${source.priority}`);
    }
  }
}

async function main() {
  const fnName = process.argv[2] || "all";
  const company = process.argv[3] || "Apple";

  console.log(`Testing MCP clients for "${company}"`);
  console.log(`Function: ${fnName}`);
  console.log(`BRAVE_API_KEY: ${process.env.BRAVE_API_KEY ? "set" : "NOT SET"}`);
  console.log(`GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? "set" : "NOT SET"}`);
  console.log(`USPTO_API_KEY: ${process.env.USPTO_API_KEY ? "set" : "NOT SET"}`);
  console.log(
    `COURT_LISTENER_API_KEY: ${process.env.COURT_LISTENER_API_KEY ? "set" : "NOT SET"}`
  );

  if (fnName === "all") {
    for (const [name, fn] of Object.entries(functions)) {
      const result = await fn(company);
      printResult(name, result);
    }
  } else {
    const fn = functions[fnName];
    if (!fn) {
      console.error(`Unknown function: ${fnName}`);
      console.error(`Available: ${Object.keys(functions).join(", ")}`);
      process.exit(1);
    }
    const result = await fn(company);
    printResult(fnName, result);
  }
}

main().catch(console.error);
