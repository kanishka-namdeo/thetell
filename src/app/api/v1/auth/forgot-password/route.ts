import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import crypto from "crypto";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    const { email } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000);

      await prisma.verificationToken.create({
        data: {
          identifier: email,
          token,
          expires,
        },
      });

      const resetLink = `http://localhost:3000/reset-password?token=${token}`;
      console.log(`\n=== PASSWORD RESET LINK ===`);
      console.log(`Email: ${email}`);
      console.log(`Reset Link: ${resetLink}`);
      console.log(`Expires: ${expires.toISOString()}`);
      console.log(`==========================\n`);
    }

    return NextResponse.json({
      message: "If an account exists with that email, you will receive a password reset link.",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
