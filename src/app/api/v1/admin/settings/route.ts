import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { logAuditEvent } from "@/lib/audit-logger";
import { z } from "zod";

const UpdateSchema = z.object({
  discovery: z
    .object({
      schedule: z.string().min(1),
      enabled: z.boolean(),
    })
    .optional(),
  ai: z
    .object({
      defaultProvider: z.enum(["openai", "anthropic"]),
      analystModel: z.string().min(1),
      gossipGirlModel: z.string().min(1),
    })
    .optional(),
  thresholds: z
    .object({
      minConfidenceForPublication: z.number().min(0).max(1),
      minQualityScore: z.number().min(0).max(1),
    })
    .optional(),
  features: z
    .object({
      semanticDeduplication: z.boolean(),
      languageDetection: z.boolean(),
      qualityGate: z.boolean(),
    })
    .optional(),
  rateLimiting: z
    .object({
      requestsPerMinute: z.number().int().min(1),
      burstLimit: z.number().int().min(1),
    })
    .optional(),
  email: z
    .object({
      configured: z.boolean(),
      from: z.string().email().optional().nullable(),
      smtpHost: z.string().optional().nullable(),
      smtpPort: z.number().int().optional().nullable(),
    })
    .optional(),
  correlation: z
    .object({
      enabled: z.boolean(),
      windowSize: z.number().int().min(1).max(365),
      minSignals: z.number().int().min(1).max(100),
      confidenceThreshold: z.number().min(0).max(1),
    })
    .optional(),
  calibration: z
    .object({
      enabled: z.boolean(),
    })
    .optional(),
});

async function getOrCreateConfig() {
  let config = await prisma.systemConfig.findFirst();
  if (!config) {
    config = await prisma.systemConfig.create({ data: {} });
  }
  return config;
}

export async function GET() {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/settings" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    log.info("admin.settings.get.start");

    const config = await getOrCreateConfig();

    const response = {
      discovery: {
        schedule: config.discoverySchedule,
        enabled: config.discoveryEnabled,
      },
      ai: {
        defaultProvider: config.defaultAiProvider,
        analystModel: config.analystModel,
        gossipGirlModel: config.gossipGirlModel,
      },
      thresholds: {
        minConfidenceForPublication: config.minConfidenceForPublication,
        minQualityScore: config.minQualityScore,
      },
      features: {
        semanticDeduplication: config.semanticDeduplication,
        languageDetection: config.languageDetection,
        qualityGate: config.qualityGate,
      },
      rateLimiting: {
        requestsPerMinute: config.requestsPerMinute,
        burstLimit: config.burstLimit,
      },
      email: {
        configured: config.emailConfigured,
        from: config.emailFrom,
        smtpHost: config.emailSmtpHost,
        smtpPort: config.emailSmtpPort,
      },
      correlation: {
        enabled: config.correlationWindowSize > 0,
        windowSize: config.correlationWindowSize,
        minSignals: config.minSignalsForCorrelation,
        confidenceThreshold: config.correlationConfidenceThreshold,
      },
      calibration: {
        enabled: true,
      },
      updatedAt: config.updatedAt,
    };

    log.info("admin.settings.get.success");
    return NextResponse.json(response);
  } catch (error) {
    log.error("admin.settings.get.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "PATCH /api/v1/admin/settings" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = UpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Invalid settings data",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    log.info("admin.settings.update.start", { sections: Object.keys(parsed.data) });

    const current = await getOrCreateConfig();
    const data: Record<string, unknown> = {};
    const changes: Record<string, unknown> = {};

    if (parsed.data.discovery) {
      data.discoverySchedule = parsed.data.discovery.schedule;
      data.discoveryEnabled = parsed.data.discovery.enabled;
      changes.discovery = parsed.data.discovery;
    }
    if (parsed.data.ai) {
      data.defaultAiProvider = parsed.data.ai.defaultProvider;
      data.analystModel = parsed.data.ai.analystModel;
      data.gossipGirlModel = parsed.data.ai.gossipGirlModel;
      changes.ai = parsed.data.ai;
    }
    if (parsed.data.thresholds) {
      data.minConfidenceForPublication = parsed.data.thresholds.minConfidenceForPublication;
      data.minQualityScore = parsed.data.thresholds.minQualityScore;
      changes.thresholds = parsed.data.thresholds;
    }
    if (parsed.data.features) {
      data.semanticDeduplication = parsed.data.features.semanticDeduplication;
      data.languageDetection = parsed.data.features.languageDetection;
      data.qualityGate = parsed.data.features.qualityGate;
      changes.features = parsed.data.features;
    }
    if (parsed.data.rateLimiting) {
      data.requestsPerMinute = parsed.data.rateLimiting.requestsPerMinute;
      data.burstLimit = parsed.data.rateLimiting.burstLimit;
      changes.rateLimiting = parsed.data.rateLimiting;
    }
    if (parsed.data.email) {
      data.emailConfigured = parsed.data.email.configured;
      data.emailFrom = parsed.data.email.from;
      data.emailSmtpHost = parsed.data.email.smtpHost;
      data.emailSmtpPort = parsed.data.email.smtpPort;
      changes.email = {
        configured: parsed.data.email.configured,
        from: parsed.data.email.from,
        smtpHost: parsed.data.email.smtpHost,
      };
    }
    if (parsed.data.correlation) {
      data.correlationWindowSize = parsed.data.correlation.enabled
        ? parsed.data.correlation.windowSize
        : 0;
      data.minSignalsForCorrelation = parsed.data.correlation.minSignals;
      data.correlationConfidenceThreshold = parsed.data.correlation.confidenceThreshold;
      changes.correlation = parsed.data.correlation;
    }
    if (parsed.data.calibration) {
      changes.calibration = parsed.data.calibration;
    }

    const updated = await prisma.systemConfig.update({
      where: { id: current.id },
      data,
    });

    const userId = session?.user?.id;
    if (userId) {
      await logAuditEvent({
        userId,
        action: "settings.update",
        resource: "SystemConfig",
        resourceId: current.id,
        details: JSON.parse(JSON.stringify({ changes })),
        request,
      });
    }

    log.info("admin.settings.update.success", { changedSections: Object.keys(changes) });

    const response = {
      discovery: {
        schedule: updated.discoverySchedule,
        enabled: updated.discoveryEnabled,
      },
      ai: {
        defaultProvider: updated.defaultAiProvider,
        analystModel: updated.analystModel,
        gossipGirlModel: updated.gossipGirlModel,
      },
      thresholds: {
        minConfidenceForPublication: updated.minConfidenceForPublication,
        minQualityScore: updated.minQualityScore,
      },
      features: {
        semanticDeduplication: updated.semanticDeduplication,
        languageDetection: updated.languageDetection,
        qualityGate: updated.qualityGate,
      },
      rateLimiting: {
        requestsPerMinute: updated.requestsPerMinute,
        burstLimit: updated.burstLimit,
      },
      email: {
        configured: updated.emailConfigured,
        from: updated.emailFrom,
        smtpHost: updated.emailSmtpHost,
        smtpPort: updated.emailSmtpPort,
      },
      correlation: {
        enabled: updated.correlationWindowSize > 0,
        windowSize: updated.correlationWindowSize,
        minSignals: updated.minSignalsForCorrelation,
        confidenceThreshold: updated.correlationConfidenceThreshold,
      },
      calibration: {
        enabled: true,
      },
      updatedAt: updated.updatedAt,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Invalid request body",
          details: error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    log.error("admin.settings.update.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to update settings" },
      { status: 500 }
    );
  }
}
