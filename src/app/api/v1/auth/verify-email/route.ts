import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { error: "Missing verification token" },
      { status: 400 }
    );
  }

  try {
    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      return NextResponse.redirect(
        new URL("/sign-in?error=InvalidToken", req.url)
      );
    }

    if (verificationToken.expires < new Date()) {
      await prisma.verificationToken.delete({ where: { token } });
      return NextResponse.redirect(
        new URL("/sign-in?error=ExpiredToken", req.url)
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: verificationToken.identifier },
    });

    if (!user) {
      return NextResponse.redirect(
        new URL("/sign-in?error=InvalidToken", req.url)
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    });

    await prisma.verificationToken.delete({ where: { token } });

    return NextResponse.redirect(
      new URL("/sign-in?verified=true", req.url)
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to verify email" },
      { status: 500 }
    );
  }
}
