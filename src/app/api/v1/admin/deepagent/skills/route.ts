/**
 * DeepAgent Skills API
 *
 * Provides access to available skills configured for the agent.
 *
 * GET - List skills or read a specific skill's content
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";
import fs from "fs/promises";
import path from "path";

const PROJECT_ROOT = process.cwd();
const SKILLS_DIR = path.join(PROJECT_ROOT, ".cursor", "skills");

interface SkillFrontmatter {
  name?: string;
  description?: string;
  triggers?: string[];
}

/**
 * Parse frontmatter from markdown content.
 * Simple parser for YAML-like frontmatter between --- markers.
 */
function parseFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const frontmatter = match[1];
  const result: SkillFrontmatter = {};

  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    if (key === "name" || key === "description") {
      result[key] = value;
    } else if (key === "triggers") {
      // Parse array: triggers: [a, b, c] or triggers:\n  - a\n  - b
      if (value.startsWith("[") && value.endsWith("]")) {
        result.triggers = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
  }

  return result;
}

/**
 * List all available skills from the skills directory.
 */
async function listSkills(): Promise<Array<{ name: string; path: string; description?: string; triggers?: string[] }>> {
  const skills: Array<{ name: string; path: string; description?: string; triggers?: string[] }> = [];

  try {
    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = path.join(SKILLS_DIR, entry.name);
      const skillFile = path.join(skillDir, "SKILL.md");

      try {
        await fs.access(skillFile);
        const content = await fs.readFile(skillFile, "utf-8");
        const frontmatter = parseFrontmatter(content);

        skills.push({
          name: frontmatter.name || entry.name,
          path: skillFile,
          description: frontmatter.description,
          triggers: frontmatter.triggers,
        });
      } catch {
        // SKILL.md doesn't exist in this directory
      }
    }
  } catch (error) {
    logger.error("deepagent.skills.list.error", { error: String(error) });
  }

  return skills;
}

/**
 * Read a specific skill file's content.
 */
async function readSkill(skillPath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(skillPath, "utf-8");
    return content;
  } catch {
    return null;
  }
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
    const skillPath = searchParams.get("path");

    if (skillPath) {
      // Read a specific skill
      const content = await readSkill(skillPath);
      if (content === null) {
        return NextResponse.json({ error: "Skill not found" }, { status: 404 });
      }
      log.info("deepagent.skills.read", { path: skillPath });
      return NextResponse.json({ data: { path: skillPath, content } });
    }

    // List all skills
    const skills = await listSkills();
    log.info("deepagent.skills.list", { count: skills.length });
    return NextResponse.json({ data: skills });
  } catch (error) {
    log.error("deepagent.skills.get.error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
