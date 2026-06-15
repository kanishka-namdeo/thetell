import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Public routes
  if (
    pathname === "/" ||
    pathname === "/sign-in" ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  // Protected dashboard routes
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/(dashboard)")) {
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
