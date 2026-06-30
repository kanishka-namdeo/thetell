"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TriangleAlert } from "lucide-react";
import { logger } from "@/lib/logger";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("auth.error_boundary", { error: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center">
          <TriangleAlert className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h2 className="text-xl font-serif font-bold mb-2">Authentication Error</h2>
          <p className="text-sm text-muted-foreground font-body mb-6">
            {error.message || "An unexpected error occurred. Please try again."}
          </p>
          <Button onClick={reset} variant="outline">
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
