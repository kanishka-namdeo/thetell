"use client";

import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabs = [
  { value: "content", label: "All Content", href: "/dashboard/admin/content" },
  { value: "sources", label: "Sources", href: "/dashboard/admin/content/sources" },
];

function getActiveTab(pathname: string): string {
  if (pathname.endsWith("/sources")) return "sources";
  return "content";
}

export default function ContentLayout({
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
