import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { logAuditEvent } from "@/lib/audit-logger";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const UpdateSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  autoApproveConfidenceThreshold: z.number().min(0).max(1).nullable().optional(),
  autoApproveSources: z.array(z.string()).nullable().optional(),
  notificationEmail: z.string().email().nullable().optional(),
  notifyOnNewContent: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/moderation/settings" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    log.info("admin.moderation.settings.get.start");

    let settings = await prisma.moderationSettings.findFirst();

    if (!settings) {
      settings = await prisma.moderationSettings.create({
        data: {
          enabled: false,
          autoApproveConfidenceThreshold: null,
          autoApproveSources: Prisma.JsonNull,
          notificationEmail: null,
          notifyOnNewContent: false,
        },
      });
    }

    log.info("admin.moderation.settings.get.success");

    return NextResponse.json(settings);
  } catch (error) {
    log.error("admin.moderation.settings.get.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "PATCH /api/v1/admin/moderation/settings" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parseResult = UpdateSettingsSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Invalid request body",
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    log.info("admin.moderation.settings.update.start", { changes: parseResult.data });

    let settings = await prisma.moderationSettings.findFirst();

    if (!settings) {
      settings = await prisma.moderationSettings.create({
        data: {
          enabled: false,
          autoApproveConfidenceThreshold: null,
          autoApproveSources: Prisma.JsonNull,
          notificationEmail: null,
          notifyOnNewContent: false,
        },
      });
    }

    const updateData = {
      ...parseResult.data,
      autoApproveSources: parseResult.data.autoApproveSources ?? Prisma.JsonNull,
    };

    const updatedSettings = await prisma.moderationSettings.update({
      where: { id: settings.id },
      data: updateData,
    });

    await logAuditEvent({
      userId: session.user.id,
      action: "moderation.settings.update",
      resource: "moderation_settings",
      resourceId: settings.id,
      details: { changes: parseResult.data },
      request,
    });

    log.info("admin.moderation.settings.update.success");

    return NextResponse.json(updatedSettings);
  } catch (error) {
    log.error("admin.moderation.settings.update.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to update settings" },
      { status: 500 }
    );
  }
}
