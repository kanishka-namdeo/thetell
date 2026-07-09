import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json(
      { error: "unauthorized", message: "Admin access required" },
      { status: 401 }
    );
  }

  const companies = await prisma.company.findMany({
    select: { id: true, name: true, ticker: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(companies);
}
