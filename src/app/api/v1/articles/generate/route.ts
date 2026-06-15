import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateBackendArticle } from "@/lib/backend-client";

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
    const { companyId, analysisIds, customHeadline } = body;

    if (!companyId || !analysisIds || !Array.isArray(analysisIds) || analysisIds.length === 0) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Company ID and at least one analysis ID are required",
          details: {
            companyId: !companyId ? ["Required"] : undefined,
            analysisIds: !analysisIds || analysisIds.length === 0 ? ["At least one required"] : undefined,
          },
        },
        { status: 400 }
      );
    }

    // Verify company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json(
        { error: "not_found", message: "Company not found" },
        { status: 404 }
      );
    }

    // Verify all analyses exist
    const analyses = await prisma.analysis.findMany({
      where: { id: { in: analysisIds } },
      include: { signal: true },
    });

    if (analyses.length !== analysisIds.length) {
      return NextResponse.json(
        { error: "not_found", message: "One or more analyses not found" },
        { status: 404 }
      );
    }

    // Call backend to generate article
    try {
      const article = await generateBackendArticle({
        companyId,
        analysisIds,
      });

      // Create article in our database
      const dbArticle = await prisma.article.create({
        data: {
          title: customHeadline || article.title,
          slug: article.slug,
          summary: article.summary,
          body: article.body,
          companyId,
          analysisIds: analysisIds,
          status: "DRAFT",
          authorId: session.user.id,
          publishedAt: new Date(),
        },
      });

      return NextResponse.json(dbArticle, { status: 201 });
    } catch (backendError) {
      // If backend is down, create a placeholder article
      console.error("Backend article generation failed:", backendError);

      const fallbackSlug = `article-${Date.now()}`;
      const fallbackTitle = customHeadline || `Article for ${company.name}`;

      const dbArticle = await prisma.article.create({
        data: {
          title: fallbackTitle,
          slug: fallbackSlug,
          summary: "Article generation is pending. The AI backend is currently unavailable.",
          body: "This article will be populated once the AI backend becomes available.",
          companyId,
          analysisIds: analysisIds,
          status: "DRAFT",
          authorId: session.user.id,
          publishedAt: new Date(),
        },
      });

      return NextResponse.json(dbArticle, { status: 201 });
    }
  } catch (error) {
    console.error("Error generating article:", error);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to generate article" },
      { status: 500 }
    );
  }
}
