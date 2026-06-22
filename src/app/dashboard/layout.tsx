"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  Bookmark,
  User,
  Settings,
  TrendingUp,
  Globe,
  ShieldCheck,
  Server,
  Flag,
  ClipboardList,
  BarChartBig,
  Brain,
  Bug,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { useState, useEffect } from "react";
import { SearchBar } from "@/components/dashboard/search-bar";
import { isAdmin } from "@/lib/auth-guard";

const navItems = [
  { href: "/", label: "Public Feed", icon: Globe },
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/signals", label: "Signals", icon: BarChart3 },
  { href: "/dashboard/companies", label: "Companies", icon: Building2 },
  { href: "/dashboard/articles", label: "Articles", icon: FileText },
  { href: "/dashboard/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/dashboard/watchlist", label: "Watchlist", icon: Bookmark },
];

const adminNavItems: Array<{ href: string; label: string; icon: typeof LayoutDashboard }> = [
  { href: "/dashboard/admin", label: "Overview", icon: ShieldCheck },
  { href: "/dashboard/admin/intelligence", label: "Intelligence", icon: Brain },
  { href: "/dashboard/admin/content", label: "Content", icon: Flag },
  { href: "/dashboard/admin/operations", label: "Operations", icon: Server },
  { href: "/dashboard/admin/analytics", label: "Analytics", icon: BarChartBig },
  { href: "/dashboard/admin/audit", label: "Audit", icon: ClipboardList },
  { href: "/dashboard/admin/debug", label: "Debug Agent", icon: Bug },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated" && !session) {
      router.replace("/sign-in");
    }
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="border-b-2 border-foreground bg-background sticky top-0 z-50">
          <div className="flex items-center justify-between h-14 px-4 lg:px-6">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 border-2 border-foreground" />
              <Skeleton className="h-6 w-24" />
            </div>
            <div className="hidden lg:flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-20" />
              ))}
            </div>
            <Skeleton className="h-8 w-32" />
          </div>
        </header>
        <main className="flex-1 p-6">
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

  const showAdminNav = isAdmin(session);
  const visibleNavItems = [
    ...navItems,
    ...(showAdminNav ? adminNavItems : []),
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Navigation Bar */}
      <header className="border-b-2 border-foreground bg-background sticky top-0 z-50">
        <div className="flex items-center justify-between h-14 px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="h-8 w-8 border-2 border-foreground flex items-center justify-center">
                <Logo className="h-4 w-4" />
              </div>
              <span className="font-serif text-xl font-bold tracking-tight hidden sm:inline">
                THE TELL
              </span>
            </Link>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {visibleNavItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-widest font-sans transition-colors",
                    isActive
                      ? "bg-foreground text-background"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Search */}
          <div className="hidden md:block">
            <SearchBar />
          </div>

          <div className="flex items-center gap-3">
            {session?.user && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="flex items-center gap-2 rounded-md border-2 border-foreground bg-background px-3 py-1.5 text-sm font-sans transition-colors hover:bg-muted"
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {session.user.name || session.user.email}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {isAdmin(session) && (
                    <div className="px-2 py-1.5 mb-1">
                      <Badge variant="default" className="text-xs flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        Admin
                      </Badge>
                    </div>
                  )}
                  <DropdownMenuItem>
                    <Link href="/dashboard/profile" className="flex items-center gap-2 w-full">
                      <User className="h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Link href="/dashboard/settings" className="flex items-center gap-2 w-full">
                      <Settings className="h-4 w-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-foreground bg-background">
            <nav className="flex flex-col p-2">
              {visibleNavItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href ||
                      (item.href !== "/dashboard" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 text-xs uppercase tracking-widest font-sans transition-colors",
                      isActive
                        ? "bg-foreground text-background"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 animate-[fadeIn_0.2s_ease-out]" key={pathname}>
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-foreground py-4 px-4">
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
  );
}
