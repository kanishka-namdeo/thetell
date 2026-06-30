"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabs = [
  { value: "themes", label: "Themes", href: "/dashboard/admin/intelligence/themes" },
  { value: "hypotheses", label: "Hypotheses", href: "/dashboard/admin/intelligence/hypotheses" },
  { value: "inferences", label: "Inferences", href: "/dashboard/admin/intelligence/inferences" },
];

function getActiveTab(pathname: string): string {
  if (pathname.endsWith("/hypotheses")) return "hypotheses";
  if (pathname.endsWith("/inferences")) return "inferences";
  return "themes";
}

export default function IntelligenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Redirect /dashboard/admin/intelligence to themes
  useEffect(() => {
    if (pathname === "/dashboard/admin/intelligence") {
      router.replace("/dashboard/admin/intelligence/themes");
    }
  }, [pathname, router]);

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
