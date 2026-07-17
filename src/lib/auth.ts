import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const roleCache = new Map<string, { role: string; status: string; fetchedAt: number }>();
const ROLE_CACHE_TTL = 60_000;
const ROLE_CACHE_MAX_SIZE = 1_000;

function cleanupRoleCache(): void {
  const now = Date.now();
  for (const [key, entry] of roleCache.entries()) {
    if (now - entry.fetchedAt > ROLE_CACHE_TTL) {
      roleCache.delete(key);
    }
  }
  if (roleCache.size > ROLE_CACHE_MAX_SIZE) {
    const excess = roleCache.size - ROLE_CACHE_MAX_SIZE;
    const keys = roleCache.keys();
    for (let i = 0; i < excess; i++) {
      const result = keys.next();
      if (result.done) break;
      roleCache.delete(result.value);
    }
  }
}

if (typeof globalThis.setInterval !== "undefined") {
  const globalKey = "__roleCacheCleanupInterval";
  if (!(globalKey in globalThis)) {
    const timer = setInterval(cleanupRoleCache, 5 * 60 * 1000);
    timer.unref?.();
    (globalThis as Record<string, unknown>)[globalKey] = timer;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
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
      // Refresh role from DB with short cache to reduce per-request DB load
      if (token.userId && !user) {
        const cached = roleCache.get(token.userId as string);
        const now = Date.now();
        if (cached && now - cached.fetchedAt < ROLE_CACHE_TTL) {
          token.role = cached.role;
          if (cached.status === "SUSPENDED") return {};
          return token;
        }
        let timeoutId: NodeJS.Timeout | undefined;
        try {
          const dbPromise = prisma.user.findUnique({
            where: { id: token.userId as string },
            select: { role: true, status: true, passwordChangedAt: true },
          });
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("JWT callback DB timeout after 5s")), 5000);
          });
          const dbUser = await Promise.race([dbPromise, timeoutPromise]);
          if (dbUser) {
            token.role = dbUser.role;
            if (roleCache.size >= ROLE_CACHE_MAX_SIZE) cleanupRoleCache();
            roleCache.set(token.userId as string, {
              role: dbUser.role,
              status: dbUser.status,
              fetchedAt: now,
            });
            if (dbUser.status === "SUSPENDED") {
              return {};
            }
            if (dbUser.passwordChangedAt && token.iat) {
              const tokenIssuedAt = new Date((token.iat as number) * 1000);
              if (tokenIssuedAt < dbUser.passwordChangedAt) {
                return {};
              }
            }
          }
        } catch (err) {
          logger.warn("auth.jwt.db_lookup_failed", { userId: token.userId, error: err instanceof Error ? err.message : String(err) });
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
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
