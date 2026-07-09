/**
 * DeepAgent Memory Search API
 *
 * Full-text search across memory files with relevance ranking.
 * Reads from the /memories/ directory on the filesystem.
 *
 * GET ?q=<query>&sessionId=<optional>
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";

const PROJECT_ROOT = process.cwd().replace(/\\/g, "/");
const MEMORIES_DIR = `${PROJECT_ROOT}/memories`;

interface MatchEntry {
  line: number;
  text: string;
  highlight: string;
}

interface SearchResult {
  fileName: string;
  content: string;
  matches: MatchEntry[];
  relevanceScore: number;
}

interface SearchResponse {
  results: SearchResult[];
  totalMatches: number;
  query: string;
}

async function listMemoryFiles(): Promise<string[]> {
  const fs = await import("fs/promises");
  try {
    await fs.access(MEMORIES_DIR);
  } catch {
    return [];
  }
  const entries = await fs.readdir(MEMORIES_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => e.name);
}

async function readMemoryFile(filename: string): Promise<string | null> {
  try {
    const fs = await import("fs/promises");
    return await fs.readFile(`${MEMORIES_DIR}/${filename}`, "utf-8");
  } catch {
    return null;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchFile(
  fileName: string,
  content: string,
  queryTerms: string[],
  regex: RegExp
): SearchResult | null {
  const lines = content.split("\n");
  const matches: MatchEntry[] = [];
  let totalOccurrences = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineMatches = line.match(regex);
    if (lineMatches) {
      totalOccurrences += lineMatches.length;
      const firstMatch = lineMatches[0];
      matches.push({
        line: i + 1,
        text: line.length > 200 ? line.slice(0, 200) + "…" : line,
        highlight: firstMatch.length > 100 ? firstMatch.slice(0, 100) : firstMatch,
      });
    }
  }

  if (matches.length === 0) return null;

  const termCoverage = queryTerms.filter((term) =>
    content.toLowerCase().includes(term)
  ).length / queryTerms.length;

  const positionBonus = matches.length > 0 && matches[0].line <= 5 ? 0.15 : 0;
  const frequencyScore = Math.min(totalOccurrences / 20, 1) * 0.5;
  const relevanceScore = Math.min(
    1,
    termCoverage * 0.4 + frequencyScore + positionBonus + (matches.length > 3 ? 0.1 : 0)
  );

  return {
    fileName,
    content,
    matches: matches.slice(0, 10),
    relevanceScore: Math.round(relevanceScore * 1000) / 1000,
  };
}

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({
        error: "Query must be at least 2 characters",
        results: [],
        totalMatches: 0,
        query: q ?? "",
      } satisfies SearchResponse & { error: string });
    }

    const queryTerms = q.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
    if (queryTerms.length === 0) {
      return NextResponse.json({
        results: [],
        totalMatches: 0,
        query: q,
      } satisfies SearchResponse);
    }

    const pattern = queryTerms.map(escapeRegex).join("|");
    const regex = new RegExp(pattern, "gi");

    const fileNames = await listMemoryFiles();
    const results: SearchResult[] = [];
    let totalMatches = 0;

    const fileContents = await Promise.all(
      fileNames.map(async (name) => ({ name, content: await readMemoryFile(name) }))
    );

    for (const { name, content } of fileContents) {
      if (!content) continue;
      const result = searchFile(name, content, queryTerms, regex);
      if (result) {
        totalMatches += result.matches.length;
        results.push(result);
      }
    }

    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const top = results.slice(0, 20);

    log.info("deepagent.memory.search", { query: q, resultCount: top.length, totalMatches });

    return NextResponse.json({
      results: top,
      totalMatches,
      query: q,
    } satisfies SearchResponse);
  } catch (error) {
    log.error("deepagent.memory.search.error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
