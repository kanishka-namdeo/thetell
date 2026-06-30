"use client";

import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";
import Link from "next/link";
import { PipelinesClient } from "./pipelines-client";
import { PipelineSessionsClient } from "@/components/admin/pipeline-sessions";

export function PipelinesPageClient() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "sessions" ? "sessions" : "pipelines";

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Pipeline Operations Moved</AlertTitle>
        <AlertDescription>
          Trigger new pipeline runs from the{" "}
          <Link href="/dashboard/admin/control-center" className="underline font-medium">
            Control Center
          </Link>
        </AlertDescription>
      </Alert>

      <Tabs value={activeTab} defaultValue="pipelines">
        <TabsList>
          <TabsTrigger value="pipelines">Active Pipelines</TabsTrigger>
          <TabsTrigger value="sessions">Session History</TabsTrigger>
        </TabsList>
        <TabsContent value="pipelines" className="mt-6">
          <PipelinesClient />
        </TabsContent>
        <TabsContent value="sessions" className="mt-6">
          <PipelineSessionsClient />
        </TabsContent>
      </Tabs>
    </div>
  );
}
