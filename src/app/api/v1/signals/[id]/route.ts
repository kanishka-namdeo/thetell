import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
    const signal = await prisma.signal.findUnique({
      where: { id },
      include: {
        company: true,
        analysis: true,
      },
    });

    if (!signal) {
      return NextResponse.json(
        { error: "not_found", message: "Signal not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(signal);
  } catch (error) {
    console.error("Error fetching signal:", error);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch signal" },
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

    const { id } = await params;
    const signal = await prisma.signal.findUnique({
      where: { id },
    });

    if (!signal) {
      return NextResponse.json(
        { error: "not_found", message: "Signal not found" },
        { status: 404 }
      );
    }

    await prisma.signal.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting signal:", error);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to delete signal" },
      { status: 500 }
    );
  }
}
