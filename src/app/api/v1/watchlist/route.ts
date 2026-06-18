import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const watchedCompanies = await prisma.watchedCompany.findMany({
    where: { userId: session.user.id },
    include: {
      company: {
        include: {
          _count: {
            select: {
              signals: true,
              articles: true,
            },
          },
          signals: {
            take: 5,
            orderBy: { scrapedAt: "desc" },
            include: {
              analyses: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: watchedCompanies });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { companyId } = body;

    if (!companyId || typeof companyId !== "string") {
      return NextResponse.json(
        { error: "Invalid request: companyId is required" },
        { status: 400 }
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const existing = await prisma.watchedCompany.findUnique({
      where: {
        userId_companyId: {
          userId: session.user.id,
          companyId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Company already in watchlist" },
        { status: 409 }
      );
    }

    const watchedCompany = await prisma.watchedCompany.create({
      data: {
        userId: session.user.id,
        companyId,
      },
    });

    return NextResponse.json({ data: watchedCompany }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to add company to watchlist" },
      { status: 500 }
    );
  }
}
