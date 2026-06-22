"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Server, Wrench, Activity, Workflow, MessageCircle } from "lucide-react";

export default function OperationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const tabs = [
    { href: "/dashboard/admin/operations", label: "Health", icon: Server },
    { href: "/dashboard/admin/operations/scrapers", label: "Scrapers", icon: Wrench },
    { href: "/dashboard/admin/operations/subreddits", label: "Subreddits", icon: MessageCircle },
    { href: "/dashboard/admin/operations/jobs", label: "Jobs", icon: Activity },
    { href: "/dashboard/admin/operations/pipelines", label: "Pipelines", icon: Workflow },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b-2 border-foreground">
        <nav className="flex gap-0">
          {tabs.map((tab) => {
            const isActive =
              tab.href === "/dashboard/admin/operations"
                ? pathname === tab.href
                : pathname.startsWith(tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "relative inline-flex items-center justify-center gap-1.5 border border-transparent px-4 py-2 text-xs uppercase tracking-widest font-sans font-medium whitespace-nowrap transition-all",
                  "text-foreground/60 hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
                  isActive && "bg-foreground text-background"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}
