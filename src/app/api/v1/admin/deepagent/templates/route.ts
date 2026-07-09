import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit-logger";
import { z } from "zod";

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  systemPrompt: z.string().min(1),
  model: z.string().min(1),
  initialContext: z.unknown().optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  systemPrompt: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  initialContext: z.unknown().optional(),
});

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    log.info("deepagent.templates.list.start", { method: "GET", path: req.url });

    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const templates = await prisma.deepAgentTemplate.findMany({
      orderBy: { createdAt: "desc" },
    });

    const formatted = templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      systemPrompt: t.systemPrompt,
      model: t.model,
      initialContext: t.initialContext,
      createdBy: t.createdBy,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    log.info("deepagent.templates.list.success", { count: formatted.length });

    return NextResponse.json({ data: formatted });
  } catch (error) {
    log.error("deepagent.templates.list.error", { error: String(error) });
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
    log.info("deepagent.templates.create.start", { method: "POST", path: req.url });

    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createTemplateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const userId = session.user.id;
    const { name, description, systemPrompt, model, initialContext } = parsed.data;

    const template = await prisma.deepAgentTemplate.create({
      data: {
        name,
        description,
        systemPrompt,
        model,
        initialContext: initialContext !== undefined ? JSON.parse(JSON.stringify(initialContext)) : undefined,
        createdBy: userId,
      },
    });

    await logAuditEvent({
      userId,
      action: "deepagent.template.created",
      resource: "DeepAgentTemplate",
      resourceId: template.id,
      details: { name, model },
      request: req,
    });

    log.info("deepagent.templates.create.success", { templateId: template.id });

    return NextResponse.json(
      {
        data: {
          id: template.id,
          name: template.name,
          description: template.description,
          systemPrompt: template.systemPrompt,
          model: template.model,
          initialContext: template.initialContext,
          createdBy: template.createdBy,
          createdAt: template.createdAt.toISOString(),
          updatedAt: template.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    log.error("deepagent.templates.create.error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

