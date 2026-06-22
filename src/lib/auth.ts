import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
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

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValid) {
          return null;
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
      }
      // Refresh role from DB on every request to prevent stale roles
      // (e.g., demoted admin retaining access until token expires)
      if (token.userId && !user) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.userId as string },
            select: { role: true, status: true },
          });
          if (dbUser) {
            token.role = dbUser.role;
            // Invalidate session if user is suspended
            if (dbUser.status === "SUSPENDED") {
              return {};
            }
          }
        } catch {
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
