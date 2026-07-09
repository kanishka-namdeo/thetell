import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;

    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      return NextResponse.json(
        { error: "Invalid or expired reset token" },
        { status: 400 }
      );
    }

    if (verificationToken.expires < new Date()) {
      await prisma.verificationToken.delete({
        where: { token },
      });
      return NextResponse.json(
        { error: "Reset token has expired" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: verificationToken.identifier },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordChangedAt: now,
        loginAttempts: 0,
        lockoutUntil: null,
      },
    });

    // JWT sessions are invalidated via passwordChangedAt check in auth.ts jwt callback.
    // No database session cleanup needed — JWT strategy is stateless.

    await prisma.verificationToken.delete({
      where: { token },
    });

    return NextResponse.json({
      message: "Password reset successfully",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to reset password" },
      { status: 500 }
    );
  }
}
