import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";
import { z } from "zod";

const settingsSchema = z.object({
  mode: z.enum(["local", "managed"]),
  remoteUrl: z.string().url().optional().or(z.literal("")),
  langsmithApiKey: z.string().optional().or(z.literal("")),
  langsmithProject: z.string().optional().default("the-tell"),
});

// In-memory settings store (in production, this would be in SystemConfig or similar)
let currentSettings = {
  mode: "local" as "local" | "managed",
  remoteUrl: "",
  langsmithApiKey: "",
  langsmithProject: "the-tell",
};

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    log.info("deepagent.settings.get.start", { method: "GET", path: req.url });

    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    log.info("deepagent.settings.get.success");

    return NextResponse.json({
      settings: {
        ...currentSettings,
        // Mask API key for security
        langsmithApiKey: currentSettings.langsmithApiKey
          ? `${currentSettings.langsmithApiKey.substring(0, 8)}...`
          : "",
      },
    });
  } catch (error) {
    log.error("deepagent.settings.get.error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    log.info("deepagent.settings.update.start", { method: "POST", path: req.url });

    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = settingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Update settings (preserve API key if masked)
    const newSettings = { ...parsed.data };
    if (newSettings.langsmithApiKey?.endsWith("...")) {
      // Keep existing key if it's masked
      newSettings.langsmithApiKey = currentSettings.langsmithApiKey;
    }

    currentSettings = {
      mode: newSettings.mode,
      remoteUrl: newSettings.remoteUrl || "",
      langsmithApiKey: newSettings.langsmithApiKey || "",
      langsmithProject: newSettings.langsmithProject || "the-tell",
    };

    log.info("deepagent.settings.update.success", { mode: currentSettings.mode });

    return NextResponse.json({
      success: true,
      settings: {
        ...currentSettings,
        // Mask API key for security
        langsmithApiKey: currentSettings.langsmithApiKey
          ? `${currentSettings.langsmithApiKey.substring(0, 8)}...`
          : "",
      },
    });
  } catch (error) {
    log.error("deepagent.settings.update.error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
