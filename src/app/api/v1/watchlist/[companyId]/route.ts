import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyId } = await params;

  try {
    const watchedCompany = await prisma.watchedCompany.findUnique({
      where: {
        userId_companyId: {
          userId: session.user.id,
          companyId,
        },
      },
    });

    if (!watchedCompany) {
      return NextResponse.json(
        { error: "Company not in watchlist" },
        { status: 404 }
      );
    }

    await prisma.watchedCompany.delete({
      where: { id: watchedCompany.id },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to remove company from watchlist" },
      { status: 500 }
    );
  }
}
