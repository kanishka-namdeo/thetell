"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Server, Wrench, Activity, Workflow } from "lucide-react";

const tabs = [
  { href: "/dashboard/admin/operations", label: "Health", icon: Server, match: "/dashboard/admin/operations" },
  { href: "/dashboard/admin/operations/scrapers", label: "Scrapers", icon: Wrench, match: "/dashboard/admin/operations/scrapers" },
  { href: "/dashboard/admin/operations/jobs", label: "Jobs", icon: Activity, match: "/dashboard/admin/operations/jobs" },
  { href: "/dashboard/admin/operations/pipelines", label: "Pipelines", icon: Workflow, match: "/dashboard/admin/operations/pipelines" },
];

export function OperationsTabNav() {
  const pathname = usePathname();

  return (
    <div
      data-slot="tabs-list"
      data-variant="default"
      className="inline-flex w-fit items-center justify-center p-0 text-foreground h-10 bg-transparent border-b-2 border-foreground"
    >
      {tabs.map((tab) => {
        const isActive =
          tab.match === "/dashboard/admin/operations"
            ? pathname === tab.match
            : pathname.startsWith(tab.match);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative inline-flex h-full flex-1 items-center justify-center gap-1.5 border border-transparent px-4 py-2 text-xs uppercase tracking-widest font-sans font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
              isActive && "bg-foreground text-background"
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
