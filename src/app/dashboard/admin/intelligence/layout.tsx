"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdmin } from "@/lib/auth-guard";
import { Brain } from "lucide-react";

const tabs = [
  { value: "overview", label: "Overview", href: "/dashboard/admin/intelligence" },
  { value: "themes", label: "Themes", href: "/dashboard/admin/intelligence/themes" },
  { value: "hypotheses", label: "Hypotheses", href: "/dashboard/admin/intelligence/hypotheses" },
  { value: "inferences", label: "Inferences", href: "/dashboard/admin/intelligence/inferences" },
];

function getActiveTab(pathname: string): string {
  if (pathname.endsWith("/themes")) return "themes";
  if (pathname.endsWith("/hypotheses")) return "hypotheses";
  if (pathname.endsWith("/inferences")) return "inferences";
  return "overview";
}

export default function IntelligenceLayout({
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
        <Brain className="h-4 w-4 text-muted-foreground" />
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
