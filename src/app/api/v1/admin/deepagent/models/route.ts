import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  supportsCaching: boolean;
}

function getAvailableModels(): ModelInfo[] {
  const models: ModelInfo[] = [];

  // Add models from environment variables
  const fastModel = process.env.FAST_MODEL;
  const reasoningModel = process.env.REASONING_MODEL;
  const visionModel = process.env.VISION_MODEL;
  const anthropicModel = process.env.ANTHROPIC_MODEL;

  if (fastModel) {
    models.push({
      id: fastModel,
      name: fastModel,
      provider: process.env.AI_PROVIDER || "openai",
      supportsCaching: false,
    });
  }

  if (reasoningModel && reasoningModel !== fastModel) {
    models.push({
      id: reasoningModel,
      name: reasoningModel,
      provider: process.env.AI_PROVIDER || "openai",
      supportsCaching: false,
    });
  }

  if (visionModel && visionModel !== fastModel && visionModel !== reasoningModel) {
    models.push({
      id: visionModel,
      name: visionModel,
      provider: process.env.AI_PROVIDER || "openai",
      supportsCaching: false,
    });
  }

  if (anthropicModel) {
    models.push({
      id: anthropicModel,
      name: anthropicModel,
      provider: "anthropic",
      supportsCaching: true,
    });
  }

  // Fallback if no models configured - use placeholder to indicate missing config
  if (models.length === 0) {
    models.push({
      id: "not-configured",
      name: "No models configured - set FAST_MODEL env var",
      provider: "none",
      supportsCaching: false,
    });
  }

  return models;
}

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const currentModel = process.env.DEEPAGENT_MODEL || process.env.FAST_MODEL || "";
    const availableModels = getAvailableModels();

    const models = availableModels.map((m) => ({
      ...m,
      isDefault: m.id === currentModel,
    }));

    log.info("deepagent.models.listed", { count: models.length });

    return NextResponse.json({ data: models });
  } catch (error) {
    log.error("deepagent.models.error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
