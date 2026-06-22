"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdmin } from "@/lib/auth-guard";
import { Flag } from "lucide-react";

const tabs = [
  { value: "queue", label: "Queue", href: "/dashboard/admin/content" },
  { value: "library", label: "Library", href: "/dashboard/admin/content/library" },
  { value: "settings", label: "Settings", href: "/dashboard/admin/content/settings" },
];

function getActiveTab(pathname: string): string {
  if (pathname.endsWith("/library")) return "library";
  if (pathname.endsWith("/settings")) return "settings";
  return "queue";
}

export default function ContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated" || (status === "authenticated" && !isAdmin(session))) {
      router.replace("/dashboard");
    }
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!session || !isAdmin(session)) {
    return null;
  }

  const activeTab = getActiveTab(pathname);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-1">
        <Flag className="h-4 w-4 text-muted-foreground" />
        <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground">
          Admin
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const tab = tabs.find((t) => t.value === value);
          if (tab) router.push(tab.href);
        }}
      >
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {children}
    </div>
  );
}
