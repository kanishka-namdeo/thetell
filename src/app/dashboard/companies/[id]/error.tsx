"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export default function CompanyDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Company detail error:", error);
  }, [error]);

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="border-2 border-destructive/50">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Something went wrong</h2>
              <p className="text-sm text-muted-foreground">
                An error occurred while loading the company details. Please try again.
              </p>
            </div>
            <Button onClick={reset} variant="outline">
              Try again
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
