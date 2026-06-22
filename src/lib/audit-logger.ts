import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

interface AuditLogParams {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Prisma.InputJsonValue;
  request?: NextRequest;
}

export async function logAuditEvent({
  userId,
  action,
  resource,
  resourceId,
  details,
  request,
}: AuditLogParams) {
  try {
    const ipAddress = request
      ? (request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        request.headers.get("x-real-ip") ||
        "unknown")
      : undefined;

    const userAgent = request
      ? request.headers.get("user-agent") || undefined
      : undefined;

    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        resourceId,
        details,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    logger.error("audit.log.failed", {
      userId,
      action,
      resource,
      error: String(error),
    });
  }
}
