"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TriangleAlert } from "lucide-react";
import { logger } from "@/lib/logger";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("dashboard.error_boundary", { error: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="p-4 lg:p-6 flex items-center justify-center min-h-[400px]">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center">
          <TriangleAlert className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h2 className="text-xl font-serif font-bold mb-2">Something went wrong</h2>
          <p className="text-sm text-muted-foreground font-body mb-6">
            {error.message || "An unexpected error occurred while loading this page."}
          </p>
          <Button onClick={reset} variant="outline">
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
