import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { inngest } from "@/lib/inngest/client";
import { enrichCompany } from "@/lib/enrichment";
import { requireAdmin } from "@/lib/auth-guard";
import { z } from "zod";

const CompanyCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  ticker: z.string().optional(),
  description: z.string().optional(),
  websiteUrl: z.string().url("Invalid website URL").optional(),
  industry: z.string().optional(),
  sector: z.string().optional(),
});

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
    const rawLimit = parseInt(searchParams.get("limit") || "20");
    const limit = Number.isNaN(rawLimit) ? 20 : Math.min(Math.max(rawLimit, 1), 100);
    const cursor = searchParams.get("cursor");

    const companies = await prisma.company.findMany({
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        _count: {
          select: { signals: true, articles: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const hasMore = companies.length > limit;
    const items = hasMore ? companies.slice(0, limit) : companies;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return NextResponse.json({
      items,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    logger.error("Error fetching companies", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch companies" },
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
    const parseResult = CompanyCreateSchema.safeParse(body);

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

    const { name, slug, ticker, description, websiteUrl, industry, sector } = parseResult.data;

    const existingCompany = await prisma.company.findUnique({
      where: { slug },
    });

    if (existingCompany) {
      return NextResponse.json(
        { error: "conflict", message: "Company with this slug already exists" },
        { status: 409 }
      );
    }

    const company = await prisma.company.create({
      data: {
        name,
        slug,
        ticker,
        description,
        websiteUrl,
        industry,
        sector,
      },
    });

    // Fire-and-forget: run enrichment directly in the background
    enrichCompany(company.id).then((result) => {
      logger.info("enrichment.auto_complete", {
        companyId: company.id,
        status: result.status,
        feedsFound: result.feeds.length,
        socialsFound: result.socials.length,
        blogsFound: result.blogs.length,
      });
    }).catch((err) => {
      logger.error("enrichment.auto_failed", { error: String(err), companyId: company.id });
    });

    // Fire-and-forget: trigger subreddit discovery via Inngest
    inngest.send({
      name: "company.subreddits.discover",
      data: { companyId: company.id },
    }).catch((err) => {
      logger.error("Failed to trigger subreddit discovery", { error: String(err), companyId: company.id });
    });

    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    logger.error("Error creating company", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to create company" },
      { status: 500 }
    );
  }
}
