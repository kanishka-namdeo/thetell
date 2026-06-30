import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      },
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        // Block suspended users from logging in
        if (user.status === "SUSPENDED") {
          return null;
        }

        // Check account lockout
        if (user.lockoutUntil && user.lockoutUntil > new Date()) {
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValid) {
          // Increment login attempts and lock account if threshold reached
          const attempts = (user.loginAttempts || 0) + 1;
          const updateData: { loginAttempts: number; lockoutUntil?: Date } = {
            loginAttempts: attempts,
          };
          
          if (attempts >= 5) {
            updateData.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
          }
          
          await prisma.user.update({
            where: { id: user.id },
            data: updateData,
          });
          
          return null;
        }

        // Reset login attempts on successful login
        if (user.loginAttempts > 0) {
          await prisma.user.update({
            where: { id: user.id },
            data: { loginAttempts: 0, lockoutUntil: null },
          });
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) {
        return "/sign-in?error=NoEmail";
      }

      // Skip email verification check for credentials provider
      // (credentials users are already verified during signup)
      if (account?.provider === "credentials") {
        return true;
      }

      const dbUser = await prisma.user.findUnique({
        where: { email: user.email },
        select: { emailVerified: true },
      });

      if (!dbUser?.emailVerified) {
        return "/sign-in?error=EmailNotVerified";
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
        token.iat = Math.floor(Date.now() / 1000);
      }
      // Refresh role from DB on every request to prevent stale roles
      // (e.g., demoted admin retaining access until token expires)
      if (token.userId && !user) {
        try {
          const dbPromise = prisma.user.findUnique({
            where: { id: token.userId as string },
            select: { role: true, status: true, passwordChangedAt: true },
          });
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("JWT callback DB timeout after 5s")), 5000)
          );
          const dbUser = await Promise.race([dbPromise, timeoutPromise]);
          if (dbUser) {
            token.role = dbUser.role;
            // Invalidate session if user is suspended
            if (dbUser.status === "SUSPENDED") {
              return {};
            }
            // Invalidate token if issued before password change
            if (dbUser.passwordChangedAt && token.iat) {
              const tokenIssuedAt = new Date((token.iat as number) * 1000);
              if (tokenIssuedAt < dbUser.passwordChangedAt) {
                return {};
              }
            }
          }
        } catch (err) {
          logger.warn("auth.jwt.db_lookup_failed", { userId: token.userId, error: err instanceof Error ? err.message : String(err) });
          // If DB query fails, keep existing role (graceful degradation)
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/sign-in",
  },
});
