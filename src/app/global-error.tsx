"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full space-y-6 text-center">
            <AlertTriangle className="h-16 w-16 text-destructive mx-auto" />
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Application Error</h1>
              <p className="text-muted-foreground">
                A critical error occurred. Please try refreshing the page.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <Button onClick={reset} variant="outline">
                Try again
              </Button>
              <Button onClick={() => window.location.reload()}>
                Refresh page
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
