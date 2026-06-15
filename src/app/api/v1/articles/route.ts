import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const cursor = searchParams.get("cursor");
    const companyId = searchParams.get("companyId");
    const status = searchParams.get("status");

    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (status) where.status = status;

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
            email: true,
          },
        },
      },
      orderBy: { publishedAt: "desc" },
    });

    const hasMore = articles.length > limit;
    const items = hasMore ? articles.slice(0, limit) : articles;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return NextResponse.json({
      items,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error("Error fetching articles:", error);
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

    const body = await request.json();
    const { title, slug, summary, body: articleBody, companyId, analysisIds, status } = body;

    if (!title || !slug || !summary || !articleBody || !companyId) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Missing required fields",
          details: {
            title: !title ? ["Required"] : undefined,
            slug: !slug ? ["Required"] : undefined,
            summary: !summary ? ["Required"] : undefined,
            body: !articleBody ? ["Required"] : undefined,
            companyId: !companyId ? ["Required"] : undefined,
          },
        },
        { status: 400 }
      );
    }

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
        analysisIds: analysisIds || [],
        status: status || "DRAFT",
        authorId: session.user.id,
        publishedAt: status === "PUBLISHED" ? new Date() : null,
      },
    });

    return NextResponse.json(article, { status: 201 });
  } catch (error) {
    console.error("Error creating article:", error);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to create article" },
      { status: 500 }
    );
  }
}
