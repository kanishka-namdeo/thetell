import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Role } from "@prisma/client";

/**
 * Edge-compatible auth configuration for proxy.
 * Does NOT import Prisma (which requires Node.js runtime).
 * Uses JWT session strategy only.
 */

export const { auth: authEdge } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // Edge runtime cannot access Prisma, so authorize is stubbed here
      // Actual auth happens in API route via full auth.ts
      async authorize() {
        return null;
      },
    }),
  ],
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