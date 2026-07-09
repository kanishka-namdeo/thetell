import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { inngest } from "@/lib/inngest/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guard";

const CompanyUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens").optional(),
  ticker: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  websiteUrl: z.string().url("Invalid website URL").nullable().optional(),
  industry: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        signals: {
          take: 10,
          orderBy: { scrapedAt: "desc" },
          include: {
            analyses: true,
          },
        },
        trackedSubreddits: {
          take: 50,
          orderBy: { discoveredAt: "desc" },
        },
        _count: {
          select: { signals: true },
        },
      },
    });

    if (!company) {
      return NextResponse.json(
        { error: "not_found", message: "Company not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(company);
  } catch (error) {
    logger.error("Error fetching company", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch company" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await request.json();
    const parseResult = CompanyUpdateSchema.safeParse(body);

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
      where: { id },
    });

    if (!existingCompany) {
      return NextResponse.json(
        { error: "not_found", message: "Company not found" },
        { status: 404 }
      );
    }

    if (slug && slug !== existingCompany.slug) {
      const slugExists = await prisma.company.findUnique({
        where: { slug },
      });
      if (slugExists) {
        return NextResponse.json(
          { error: "conflict", message: "Company with this slug already exists" },
          { status: 409 }
        );
      }
    }

    const industryChanged = industry !== undefined && industry !== existingCompany.industry;
    const sectorChanged = sector !== undefined && sector !== existingCompany.sector;

    const company = await prisma.company.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
        ...(ticker !== undefined && { ticker }),
        ...(description !== undefined && { description }),
        ...(websiteUrl !== undefined && { websiteUrl }),
        ...(industry !== undefined && { industry }),
        ...(sector !== undefined && { sector }),
      },
    });

    if (industryChanged || sectorChanged) {
      inngest.send({
        name: "company.subreddits.discover",
        data: { companyId: id },
      }).catch((err) => {
        logger.error("Failed to trigger subreddit discovery after update", { error: String(err), companyId: id });
      });
    }

    return NextResponse.json(company);
  } catch (error) {
    logger.error("Error updating company", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to update company" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const existingCompany = await prisma.company.findUnique({
      where: { id },
    });

    if (!existingCompany) {
      return NextResponse.json(
        { error: "not_found", message: "Company not found" },
        { status: 404 }
      );
    }

    await prisma.company.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error deleting company", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to delete company" },
      { status: 500 }
    );
  }
}
