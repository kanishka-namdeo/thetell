"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { signOut, useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { isAdmin } from "@/lib/auth-guard";
import {
  mainNavItems,
  userNavItems,
  adminNavItems,
  isNavItemActive,
  type NavItem,
} from "@/lib/nav-config";

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

// Individual nav link with improved active state
function SidebarNavLink({
  item,
  pathname,
  onClick,
  isChild = false,
}: {
  item: NavItem;
  pathname: string;
  onClick?: () => void;
  isChild?: boolean;
}) {
  const active = isNavItemActive(item.href, pathname);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Only show active indicator after hydration to prevent mismatch
  const showActiveIndicator = isMounted && active;

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all rounded-md relative",
        isChild && "pl-9 py-2",
        active
          ? "bg-muted/60 text-foreground"
          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      )}
    >
      {/* Active indicator - left border accent */}
      {showActiveIndicator && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-r-full" />
      )}
      <item.icon
        className={cn(
          "flex-shrink-0 transition-colors",
          isChild ? "h-3.5 w-3.5" : "h-4 w-4",
          active ? "text-foreground" : "text-muted-foreground"
        )}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

// Main sidebar content
function SidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const { data: session } = useSession();
  const userIsAdmin = session ? isAdmin(session) : false;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col h-full p-3 gap-1">
        {/* Logo and app name */}
        <div className="flex items-center gap-3 px-3 py-3 mb-2">
          <div className="h-8 w-8 border-2 border-foreground flex items-center justify-center flex-shrink-0">
            <Logo className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-serif text-lg font-bold tracking-tight leading-none">
              THE TELL
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Intelligence Platform
            </span>
          </div>
        </div>

        {/* Main navigation section */}
        <div className="flex flex-col gap-0.5">
          {mainNavItems.map((item) => (
            <SidebarNavLink
              key={item.href}
              item={item}
              pathname={pathname}
              onClick={onNavigate}
            />
          ))}
        </div>

        {/* Admin section (if user is admin) */}
        {userIsAdmin && (
          <>
            <Separator className="my-3" />
            <div className="px-3 mb-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Admin
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {adminNavItems.map((item) => (
                <SidebarNavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onClick={onNavigate}
                />
              ))}
            </div>
          </>
        )}

        {/* Bottom section - user actions */}
        <div className="mt-auto pt-4">
          <Separator className="mb-3" />

          {/* User info */}
          {session?.user && (
            <div className="px-3 py-2 mb-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium truncate">
                  {session.user.name || session.user.email}
                </span>
                {userIsAdmin && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Admin
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground truncate block">
                {session.user.email}
              </span>
            </div>
          )}

          {/* User nav items */}
          <div className="flex flex-col gap-0.5">
            {userNavItems.map((item) => (
              <SidebarNavLink
                key={item.href}
                item={item}
                pathname={pathname}
                onClick={onNavigate}
              />
            ))}
            <button
              onClick={() => {
                signOut({ callbackUrl: "/" });
                onNavigate?.();
              }}
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-all rounded-md"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

// Main sidebar component
export function Sidebar({ mobileOpen, onMobileOpenChange }: SidebarProps) {
  const pathname = usePathname();
  const isMobile =
    mobileOpen !== undefined && onMobileOpenChange !== undefined;

  if (isMobile) {
    return (
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          className="w-72 p-0 border-r-2 border-foreground bg-background"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Navigate through the dashboard</SheetDescription>
          </SheetHeader>
          <SidebarContent
            pathname={pathname}
            onNavigate={() => onMobileOpenChange?.(false)}
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside className="hidden lg:flex w-64 shrink-0 border-r-2 border-foreground bg-background sticky top-0 h-screen">
      <SidebarContent pathname={pathname} />
    </aside>
  );
}

// Mobile sidebar trigger button
export function MobileSidebarTrigger({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      aria-label="Open navigation menu"
      className="lg:hidden"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <line x1="4" x2="20" y1="12" y2="12" />
        <line x1="4" x2="20" y1="6" y2="6" />
        <line x1="4" x2="20" y1="18" y2="18" />
      </svg>
    </Button>
  );
}
