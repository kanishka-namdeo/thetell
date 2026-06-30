"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
// Layout component for dashboard pages
import { Skeleton } from "@/components/ui/skeleton";
import { Sidebar, MobileSidebarTrigger } from "@/components/layout/sidebar";
import { SearchBar } from "@/components/dashboard/search-bar";
import { usePathname } from "next/navigation";

// Pages that manage their own mobile header/sidebar and should not
// render the default dashboard mobile header.
const SELF_MANAGED_MOBILE_PAGES = ["/dashboard/admin/deepagent"];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated" && !session) {
      router.replace("/sign-in");
    }
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col lg:flex-row bg-background">
        {/* Sidebar skeleton */}
        <div className="hidden lg:flex w-64 shrink-0 border-r-2 border-foreground bg-background">
          <div className="p-4 space-y-4 w-full">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 border-2 border-foreground" />
              <Skeleton className="h-6 w-24" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </div>
        {/* Mobile header skeleton */}
        <div className="lg:hidden border-b-2 border-foreground bg-background px-4 py-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
        {/* Main content skeleton */}
        <main className="flex-1 p-4 lg:p-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </main>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Sidebar - desktop persistent, mobile drawer */}
      <Sidebar />
      <Sidebar mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} />

      {/* Main content area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile header with hamburger and search */}
        {!SELF_MANAGED_MOBILE_PAGES.some((p) => pathname.startsWith(p)) && (
          <header className="lg:hidden border-b-2 border-foreground bg-background sticky top-0 z-50">
            <div className="flex items-center justify-between h-14 px-4">
              <div className="flex items-center gap-3">
                <MobileSidebarTrigger onClick={() => setMobileOpen(true)} />
                <span className="font-serif text-lg font-bold tracking-tight">
                  THE TELL
                </span>
              </div>
              <div className="flex-1 max-w-xs mx-4">
                <SearchBar />
              </div>
            </div>
          </header>
        )}

        {/* Desktop header with search */}
        <header className="hidden lg:flex items-center justify-between h-14 px-6 border-b-2 border-foreground bg-background sticky top-0 z-50">
          <div className="flex-1 max-w-md">
            <SearchBar />
          </div>
        </header>

        {/* Page content */}
        <main
          className="flex-1 p-4 lg:p-6 animate-[fadeIn_0.2s_ease-out]"
          key={pathname}
        >
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-foreground py-3 px-4 lg:px-6">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground">
              The Tell &mdash; Corporate Intelligence Platform
            </p>
            <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground">
              {new Date().getFullYear()}
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
