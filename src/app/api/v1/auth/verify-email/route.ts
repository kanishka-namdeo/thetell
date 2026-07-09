import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const verifyEmailSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export async function POST(req: Request) {
  let token: string;

  try {
    const body = await req.json();
    const parsed = verifyEmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Missing verification token" },
        { status: 400 }
      );
    }
    token = parsed.data.token;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
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
  } catch {
    return NextResponse.json(
      { error: "Failed to verify email" },
      { status: 500 }
    );
  }
}
