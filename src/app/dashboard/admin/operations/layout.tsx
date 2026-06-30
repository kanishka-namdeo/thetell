"use client";

import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabs = [
  { value: "health", label: "Health", href: "/dashboard/admin/operations" },
  { value: "scrapers", label: "Scrapers", href: "/dashboard/admin/operations/scrapers" },
  { value: "jobs", label: "Jobs", href: "/dashboard/admin/operations/jobs" },
  { value: "pipelines", label: "Pipelines", href: "/dashboard/admin/operations/pipelines" },
  { value: "subreddits", label: "Subreddits", href: "/dashboard/admin/operations/subreddits" },
  { value: "observability", label: "Observability", href: "/dashboard/admin/operations/observability" },
];

function getActiveTab(pathname: string): string {
  if (pathname.endsWith("/scrapers")) return "scrapers";
  if (pathname.endsWith("/jobs")) return "jobs";
  if (pathname.includes("/pipelines")) return "pipelines";
  if (pathname.endsWith("/subreddits")) return "subreddits";
  if (pathname.endsWith("/observability")) return "observability";
  return "health";
}

export default function OperationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = getActiveTab(pathname);

  return (
    <div className="space-y-6">
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
