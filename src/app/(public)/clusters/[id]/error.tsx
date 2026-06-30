"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ClusterDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center text-center space-y-4 py-12">
            <div className="rounded-full bg-destructive/10 p-3">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Failed to load cluster</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                {error.message || "An unexpected error occurred while loading this cluster."}
              </p>
              {error.digest && (
                <p className="text-xs text-muted-foreground font-mono">
                  Error ID: {error.digest}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={reset} variant="outline">
                Try again
              </Button>
              <Button onClick={() => (window.location.href = "/")}>
                Go home
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
