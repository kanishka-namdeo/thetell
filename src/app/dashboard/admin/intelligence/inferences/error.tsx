"use client";

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminInferencesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to load inferences</AlertTitle>
          <AlertDescription className="space-y-4">
            <p>{error.message || "An unexpected error occurred"}</p>
            <Button onClick={reset} variant="outline">
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
