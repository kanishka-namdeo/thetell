import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { logAuditEvent } from "@/lib/audit-logger";
import { z } from "zod";

const UpdateUserSchema = z.object({
  role: z.enum(["USER", "ADMIN"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/users/[id]" });

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
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            watchedCompanies: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "not_found", message: "User not found" },
        { status: 404 }
      );
    }

    log.info("admin.user.get.success", { userId: id });

    return NextResponse.json(user);
  } catch (error) {
    log.error("admin.user.get.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch user" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "PATCH /api/v1/admin/users/[id]" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const updates = UpdateUserSchema.parse(body);

    // Validation: cannot demote last admin
    if (updates.role === "USER") {
      const targetUser = await prisma.user.findUnique({
        where: { id },
        select: { role: true },
      });

      if (targetUser?.role === "ADMIN") {
        const adminCount = await prisma.user.count({
          where: { role: "ADMIN" },
        });

        if (adminCount <= 1) {
          return NextResponse.json(
            {
              error: "validation_error",
              message: "Cannot demote the last admin user",
            },
            { status: 400 }
          );
        }
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updates,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        updatedAt: true,
      },
    });

    await logAuditEvent({
      userId: session!.user.id,
      action: "user.update",
      resource: "user",
      resourceId: id,
      details: { updates },
      request,
    });

    log.info("admin.user.update.success", { userId: id, updates });

    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Invalid input data",
          details: error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    log.error("admin.user.update.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to update user" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "DELETE /api/v1/admin/users/[id]" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Validation: cannot delete self
    if (session!.user.id === id) {
      return NextResponse.json(
        { error: "validation_error", message: "Cannot delete your own account" },
        { status: 400 }
      );
    }

    // Validation: cannot delete last admin
    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { role: true, email: true },
    });

    if (targetUser?.role === "ADMIN") {
      const adminCount = await prisma.user.count({
        where: { role: "ADMIN" },
      });

      if (adminCount <= 1) {
        return NextResponse.json(
          {
            error: "validation_error",
            message: "Cannot delete the last admin user",
          },
          { status: 400 }
        );
      }
    }

    await prisma.user.delete({
      where: { id },
    });

    await logAuditEvent({
      userId: session!.user.id,
      action: "user.delete",
      resource: "user",
      resourceId: id,
      details: { deletedUserEmail: targetUser?.email },
      request,
    });

    log.info("admin.user.delete.success", { userId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("admin.user.delete.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to delete user" },
      { status: 500 }
    );
  }
}
