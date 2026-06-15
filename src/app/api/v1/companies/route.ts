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
    console.error("Error fetching companies:", error);
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

    const body = await request.json();
    const { name, slug, ticker, description, websiteUrl } = body;

    if (!name || !slug) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Name and slug are required",
          details: {
            name: !name ? ["Required"] : undefined,
            slug: !slug ? ["Required"] : undefined,
          },
        },
        { status: 400 }
      );
    }

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
      },
    });

    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    console.error("Error creating company:", error);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to create company" },
      { status: 500 }
    );
  }
}
