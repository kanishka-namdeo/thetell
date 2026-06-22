import { NextRequest, NextResponse } from "next/server";
import { AgentPersona } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { z } from "zod";

const ArticleCreateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  summary: z.string().min(1, "Summary is required"),
  body: z.string().min(1, "Body is required"),
  companyId: z.string().min(1, "Company ID is required"),
  agentPersona: z.enum(["ANALYST", "GOSSIP_GIRL"], { error: "Invalid agent persona" }),
  analysisIds: z.array(z.string()).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "PENDING_REVIEW"]).optional(),
});

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/articles" });

  try {
    const session = await auth();
    const isAuthenticated = !!session?.user;
    const maxLimit = isAuthenticated ? 100 : 20;

    const { searchParams } = new URL(request.url);
    const rawLimit = parseInt(searchParams.get("limit") || "20");
    const limit = Number.isNaN(rawLimit) ? 20 : Math.min(Math.max(rawLimit, 1), maxLimit);
    const cursor = searchParams.get("cursor");
    const companyId = searchParams.get("companyId");
    const agentPersona = searchParams.get("agentPersona") as AgentPersona | null;
    const status = searchParams.get("status") || "PUBLISHED";

    log.info("api.request.start", { method: "GET", path: "/api/v1/articles" });

    const where: Record<string, unknown> = { status };
    if (companyId) where.companyId = companyId;
    if (agentPersona) where.agentPersona = agentPersona;

    const articles = await prisma.article.findMany({
      where,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        company: true,
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { publishedAt: "desc" },
    });

    const hasMore = articles.length > limit;
    const items = hasMore ? articles.slice(0, limit) : articles;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    log.info("api.request.success", { count: items.length, hasMore });

    return NextResponse.json({
      items,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    log.error("api.request.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch articles" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parseResult = ArticleCreateSchema.safeParse(body);

    if (!parseResult.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parseResult.error.issues) {
        const key = issue.path.join(".");
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Invalid request body",
          details,
        },
        { status: 400 }
      );
    }

    const { title, slug, summary, body: articleBody, companyId, agentPersona, analysisIds, status } = parseResult.data;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json(
        { error: "not_found", message: "Company not found" },
        { status: 404 }
      );
    }

    const existingArticle = await prisma.article.findUnique({
      where: { slug },
    });

    if (existingArticle) {
      return NextResponse.json(
        { error: "conflict", message: "Article with this slug already exists" },
        { status: 409 }
      );
    }

    const article = await prisma.article.create({
      data: {
        title,
        slug,
        summary,
        body: articleBody,
        companyId,
        agentPersona,
        analysisIds: analysisIds || [],
        status: status || "DRAFT",
        authorId: session.user.id,
        publishedAt: status === "PUBLISHED" ? new Date() : null,
      },
    });

    return NextResponse.json(article, { status: 201 });
  } catch (error) {
    logger.error("Error creating article", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to create article" },
      { status: 500 }
    );
  }
}
