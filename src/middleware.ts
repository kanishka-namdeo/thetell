import { authEdge } from "@/lib/auth-edge";
import { NextResponse } from "next/server";

const PUBLIC_ROUTES = [
  "/",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
];

// Public detail pages (no auth required)
const PUBLIC_PAGE_PATTERNS = [
  /^\/signals\/[^/]+$/,
  /^\/articles\/[^/]+$/,
];

// Public read-only API routes
const PUBLIC_API_GET_PATTERNS = [
  /^\/api\/v1\/signals\/?$/,
  /^\/api\/v1\/signals\/[^/]+$/,
  /^\/api\/v1\/articles\/?$/,
  /^\/api\/v1\/articles\/[^/]+$/,
];

const PUBLIC_API_PREFIXES = [
  "/api/auth",
  "/api/v1/auth/verify-email",
];

const RATE_LIMITED_AUTH_ROUTES = [
  "/api/v1/auth/register",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
];

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 5;

export default authEdge((req) => {
  const { pathname } = req.nextUrl;

  // Public routes — always allow
  if (
    PUBLIC_ROUTES.includes(pathname) ||
    PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    PUBLIC_PAGE_PATTERNS.some((pattern) => pattern.test(pathname))
  ) {
    return NextResponse.next();
  }

  // Public read-only API routes
  if (req.method === "GET" && PUBLIC_API_GET_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return NextResponse.next();
  }

  // Rate-limit headers for sensitive auth endpoints
  if (RATE_LIMITED_AUTH_ROUTES.some((route) => pathname === route)) {
    const response = NextResponse.next();
    response.headers.set(
      "X-RateLimit-Limit",
      String(RATE_LIMIT_MAX_REQUESTS)
    );
    response.headers.set(
      "X-RateLimit-Remaining",
      String(RATE_LIMIT_MAX_REQUESTS - 1)
    );
    response.headers.set(
      "X-RateLimit-Reset",
      String(Math.ceil(Date.now() / 1000) + RATE_LIMIT_WINDOW_SECONDS)
    );
    return response;
  }

  // Protected dashboard routes
  if (pathname.startsWith("/dashboard")) {
    if (!req.auth) {
      const url = new URL("/sign-in", req.url);
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
  }

  // Protected API routes (except auth)
  if (pathname.startsWith("/api/v1/") && !pathname.startsWith("/api/v1/auth")) {
    if (!req.auth) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
