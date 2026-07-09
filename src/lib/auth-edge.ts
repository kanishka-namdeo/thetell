import NextAuth from "next-auth";
import type { Role } from "@prisma/client";

/**
 * Edge-compatible auth configuration for proxy.
 * Does NOT import Prisma (which requires Node.js runtime).
 * Uses JWT session strategy only.
 */

export const { auth: authEdge } = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days (reduced from 30 days for security)
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
  providers: [], // No providers needed — edge only validates JWTs
  callbacks: {
    async jwt({ token }) {
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
});