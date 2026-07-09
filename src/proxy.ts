import { authEdge } from "@/lib/auth-edge";
import { checkRateLimit } from "@/lib/rate-limiter";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
  /^\/clusters\/[^/]+$/,
];

// Public read-only API routes (only GET method is allowed)
const PUBLIC_API_GET_PATTERNS = [
  /^\/api\/v1\/signals\/?$/,
  /^\/api\/v1\/signals\/[^/]+\/?$/,
  /^\/api\/v1\/public\/search\/?$/,
  /^\/api\/v1\/search\/?$/,
  /^\/api\/v1\/companies\/?$/,
  /^\/api\/v1\/companies\/[^/]+\/?$/,
  /^\/api\/v1\/themes\/?$/,
  /^\/api\/v1\/clusters\/?$/,
  /^\/api\/v1\/clusters\/[^/]+\/?$/,
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

// Brute-force protection on credentials callback
const CREDENTIALS_CALLBACK_PATTERN = /^\/api\/auth\/callback\/credentials/;

const ADMIN_PAGE_PATTERN = /^\/dashboard\/admin(\/.*)?$/;
const ADMIN_API_PATTERN = /^\/api\/v1\/admin\/.*$/;

// Admin-only write endpoint patterns
const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

const ADMIN_WRITE_PATTERNS = [
  /^\/api\/v1\/admin\/signals/,
  /^\/api\/v1\/admin\/companies/,
  /^\/api\/v1\/admin\/themes/,
];

// Bot detection — block known scraper User-Agents
const BLOCKED_USER_AGENTS = [
  "python-requests",
  "scrapy",
  "httpclient",
  "java/",
  "libwww-perl",
  "lwp-trivial",
  "grab",
  "curl/",
];

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map(ip => ip.trim());
    return process.env.VERCEL ? ips[0] : ips[ips.length - 1];
  }
  return req.headers.get("x-real-ip") || "unknown";
}

function isBlockedBot(req: NextRequest): boolean {
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  return BLOCKED_USER_AGENTS.some((bot) => ua.includes(bot));
}

const authHandler = authEdge((req) => {
  const { pathname } = req.nextUrl;

  // Public routes — always allow
  if (
    PUBLIC_ROUTES.includes(pathname) ||
    PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    PUBLIC_PAGE_PATTERNS.some((pattern) => pattern.test(pathname))
  ) {
    return NextResponse.next();
  }

  // Admin-only write endpoint guard — block non-admin writes on data-mutating routes
  if (WRITE_METHODS.includes(req.method)) {
    const isAdminWrite = ADMIN_WRITE_PATTERNS.some((p) => p.test(pathname));
    if (isAdminWrite) {
      if (!req.auth) {
        return NextResponse.json(
          { error: "unauthorized", message: "Authentication required" },
          { status: 401 }
        );
      }
      const role = (req.auth.user as { role?: string } | undefined)?.role;
      if (role !== "ADMIN") {
        return NextResponse.json(
          { error: "forbidden", message: "Admin access required" },
          { status: 403 }
        );
      }
    }
  }

  // Public read-only API routes (only GET method is allowed)
  if (PUBLIC_API_GET_PATTERNS.some((pattern) => pattern.test(pathname))) {
    // Non-GET requests require authentication
    if (req.method !== "GET") {
      if (!req.auth) {
        return NextResponse.json(
          { error: "unauthorized", message: "Authentication required" },
          { status: 401 }
        );
      }
    }
    
    // Bot detection + rate limiting on public API GET endpoints
    if (req.method === "GET") {
      if (isBlockedBot(req)) {
        return NextResponse.json(
          { error: "forbidden", message: "Access denied" },
          { status: 403 }
        );
      }

      const ip = getClientIp(req);
      const result = checkRateLimit(`api:${ip}`, 60, 60);
      if (!result.allowed) {
        return NextResponse.json(
          { error: "rate_limited", message: "Too many requests" },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))),
              "X-RateLimit-Limit": String(result.limit),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
            },
          }
        );
      }
      const response = NextResponse.next();
      response.headers.set("X-RateLimit-Limit", String(result.limit));
      response.headers.set(
        "X-RateLimit-Remaining",
        String(result.remaining)
      );
      response.headers.set(
        "X-RateLimit-Reset",
        String(Math.ceil(result.resetAt / 1000))
      );
      return response;
    }
  }

  // Rate limiting on sensitive auth endpoints
  if (RATE_LIMITED_AUTH_ROUTES.some((route) => pathname === route)) {
    const ip = getClientIp(req);
    const result = checkRateLimit(`auth:${ip}`, 5, 60);
    if (!result.allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
          },
        }
      );
    }
    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Limit", String(result.limit));
    response.headers.set(
      "X-RateLimit-Remaining",
      String(result.remaining)
    );
    response.headers.set(
      "X-RateLimit-Reset",
      String(Math.ceil(result.resetAt / 1000))
    );
    return response;
  }

  // Brute-force protection on credentials callback
  if (CREDENTIALS_CALLBACK_PATTERN.test(pathname) && req.method === "POST") {
    const ip = getClientIp(req);
    const result = checkRateLimit(`login:${ip}`, 5, 60);
    if (!result.allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many login attempts" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
          },
        }
      );
    }
  }

  // Admin route protection — pages
  if (ADMIN_PAGE_PATTERN.test(pathname)) {
    if (!req.auth) {
    const url = new URL("/sign-in", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
    }
    const role = (req.auth.user as { role?: string } | undefined)?.role;
    if (role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // Admin route protection — API
  if (ADMIN_API_PATTERN.test(pathname)) {
    if (!req.auth) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }
    const role = (req.auth.user as { role?: string } | undefined)?.role;
    if (role !== "ADMIN") {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

  // Protected dashboard routes
  if (pathname.startsWith("/dashboard")) {
    if (!req.auth) {
      const url = new URL("/sign-in", req.url);
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
    const ip = getClientIp(req);
    const userId = (req.auth.user as { id?: string } | undefined)?.id || "unknown";
    const result = checkRateLimit(`dashboard:${userId}:${ip}`, 120, 60);
    if (!result.allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many requests" },
        { status: 429 }
      );
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

  // Allow the request to proceed
  return NextResponse.next();
});

export function proxy(request: NextRequest, event: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return authHandler(request, event as any);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
