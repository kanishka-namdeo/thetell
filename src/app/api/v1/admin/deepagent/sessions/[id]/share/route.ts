import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { z } from "zod";

const shareSchema = z.object({
  expiresInHours: z.number().min(1).max(720).optional().default(24),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    log.info("deepagent.share.create.start", { method: "POST", path: req.url });

    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    const deepAgentSession = await prisma.deepAgentSession.findUnique({
      where: { id },
    });

    if (!deepAgentSession) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (deepAgentSession.userId !== userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = shareSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { expiresInHours } = parsed.data;
    const shareToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    const share = await prisma.deepAgentShare.create({
      data: {
        sessionId: id,
        token: shareToken,
        expiresAt,
        createdBy: userId,
      },
    });

    log.info("deepagent.share.create.success", {
      sessionId: id,
      shareId: share.id,
      expiresAt: expiresAt.toISOString(),
    });

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const shareUrl = `${baseUrl}/deepagent/shared/${shareToken}`;

    return NextResponse.json(
      {
        data: {
          id: share.id,
          token: share.token,
          shareUrl,
          expiresAt: share.expiresAt.toISOString(),
          createdAt: share.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    log.error("deepagent.share.create.error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    log.info("deepagent.share.get.start", { method: "GET", path: req.url });

    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    const deepAgentSession = await prisma.deepAgentSession.findUnique({
      where: { id },
    });

    if (!deepAgentSession) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (deepAgentSession.userId !== userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const shares = await prisma.deepAgentShare.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const formattedShares = shares.map((share) => ({
      id: share.id,
      token: share.token,
      shareUrl: `${baseUrl}/deepagent/shared/${share.token}`,
      expiresAt: share.expiresAt.toISOString(),
      createdAt: share.createdAt.toISOString(),
      revokedAt: share.revokedAt?.toISOString() || null,
      isActive: !share.revokedAt && share.expiresAt > new Date(),
    }));

    log.info("deepagent.share.get.success", {
      sessionId: id,
      count: formattedShares.length,
    });

    return NextResponse.json({ data: formattedShares });
  } catch (error) {
    log.error("deepagent.share.get.error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    log.info("deepagent.share.revoke.start", { method: "DELETE", path: req.url });

    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    const { searchParams } = new URL(req.url);
    const shareId = searchParams.get("shareId");

    if (!shareId) {
      return NextResponse.json(
        { error: "Missing shareId parameter" },
        { status: 400 }
      );
    }

    const deepAgentSession = await prisma.deepAgentSession.findUnique({
      where: { id },
    });

    if (!deepAgentSession) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (deepAgentSession.userId !== userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const share = await prisma.deepAgentShare.findUnique({
      where: { id: shareId },
    });

    if (!share) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (share.sessionId !== id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    await prisma.deepAgentShare.update({
      where: { id: shareId },
      data: { revokedAt: new Date() },
    });

    log.info("deepagent.share.revoke.success", { shareId, sessionId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("deepagent.share.revoke.error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
