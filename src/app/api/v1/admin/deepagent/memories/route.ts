/**
 * DeepAgent Memory File Browser API
 *
 * Provides read/write access to the /memories/ directory
 * managed by the StoreBackend (cross-thread persistent memory).
 *
 * GET  - List memory files or read a specific file
 * POST - Create or update a memory file
 * DELETE - Remove a memory file
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";
import { z } from "zod";

const PROJECT_ROOT = process.cwd().replace(/\\/g, "/");
const MEMORIES_DIR = `${PROJECT_ROOT}/memories`;

/**
 * List all memory files in the /memories/ directory.
 * Falls back to an empty list if the directory doesn't exist.
 */
async function listMemoryFiles(): Promise<string[]> {
  try {
    const fs = await import("fs/promises");
    try {
      await fs.access(MEMORIES_DIR);
    } catch {
      // Directory doesn't exist yet — create it
      await fs.mkdir(MEMORIES_DIR, { recursive: true });
      return [];
    }
    const entries = await fs.readdir(MEMORIES_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile())
      .map((e) => e.name);
  } catch (error) {
    logger.error("deepagent.memories.list.error", { error: String(error) });
    return [];
  }
}

/**
 * Read a memory file's contents.
 */
async function readMemoryFile(filename: string): Promise<string | null> {
  try {
    const fs = await import("fs/promises");
    const path = `${MEMORIES_DIR}/${filename}`;
    const content = await fs.readFile(path, "utf-8");
    return content;
  } catch {
    return null;
  }
}

/**
 * Write content to a memory file.
 */
async function writeMemoryFile(filename: string, content: string): Promise<boolean> {
  try {
    const fs = await import("fs/promises");
    await fs.mkdir(MEMORIES_DIR, { recursive: true });
    const path = `${MEMORIES_DIR}/${filename}`;
    await fs.writeFile(path, content, "utf-8");
    return true;
  } catch (error) {
    logger.error("deepagent.memories.write.error", { error: String(error), filename });
    return false;
  }
}

/**
 * Delete a memory file.
 */
async function deleteMemoryFile(filename: string): Promise<boolean> {
  try {
    const fs = await import("fs/promises");
    const path = `${MEMORIES_DIR}/${filename}`;
    await fs.unlink(path);
    return true;
  } catch {
    return false;
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
    const file = searchParams.get("file");

    if (file) {
      // Read a specific file
      const content = await readMemoryFile(file);
      if (content === null) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      log.info("deepagent.memories.read", { file });
      return NextResponse.json({ data: { name: file, content } });
    }

    // List all memory files
    const files = await listMemoryFiles();
    log.info("deepagent.memories.list", { count: files.length });
    return NextResponse.json({ data: files });
  } catch (error) {
    log.error("deepagent.memories.get.error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const writeSchema = z.object({
  file: z.string().min(1).max(255),
  content: z.string(),
});

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = writeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { file, content } = parsed.data;

    // Sanitize filename — no path traversal
    const safeName = file.replace(/[\/\\]/g, "_");
    if (safeName !== file) {
      return NextResponse.json(
        { error: "Invalid filename: path separators not allowed" },
        { status: 400 }
      );
    }

    const success = await writeMemoryFile(safeName, content);
    if (!success) {
      return NextResponse.json({ error: "Failed to write file" }, { status: 500 });
    }

    log.info("deepagent.memories.write", { file: safeName });
    return NextResponse.json({ data: { name: safeName, written: true } });
  } catch (error) {
    log.error("deepagent.memories.post.error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const file = searchParams.get("file");

    if (!file) {
      return NextResponse.json({ error: "Missing file parameter" }, { status: 400 });
    }

    const success = await deleteMemoryFile(file);
    if (!success) {
      return NextResponse.json({ error: "File not found or delete failed" }, { status: 404 });
    }

    log.info("deepagent.memories.delete", { file });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    log.error("deepagent.memories.delete.error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
