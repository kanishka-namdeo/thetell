import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { logAuditEvent } from "@/lib/audit-logger";
import bcrypt from "bcryptjs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({
    requestId,
    route: "POST /api/v1/admin/users/[id]/reset-password",
  });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "not_found", message: "User not found" },
        { status: 404 }
      );
    }

    // Generate a temporary password
    const tempPassword = crypto.randomUUID().slice(0, 12);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    await logAuditEvent({
      userId: session!.user.id,
      action: "user.password_reset",
      resource: "user",
      resourceId: id,
      details: { userEmail: user.email },
      request,
    });

    log.info("admin.user.password_reset.success", { userId: id });

    return NextResponse.json({
      success: true,
      message: "Password has been reset",
    });
  } catch (error) {
    log.error("admin.user.password_reset.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to reset password" },
      { status: 500 }
    );
  }
}
