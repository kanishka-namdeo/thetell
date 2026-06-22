"use client";

import { Container, Section, Headline, Body, Button, Metadata } from "@/components";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { logger } from "@/lib/logger";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("public.error.unhandled", { error: String(error), digest: error.digest });
  }, [error]);

  return (
    <Section>
      <Container className="max-w-2xl">
        <div className="flex flex-col items-center text-center py-16">
          <AlertTriangle className="h-16 w-16 text-destructive mb-6" />
          <Headline level={1} size="section" className="mb-4">
            Something Went Wrong
          </Headline>
          <Body className="text-muted-foreground mb-6 max-w-md">
            An unexpected error occurred while processing your request.
            Our editorial team has been notified of the disruption.
          </Body>
          {error.digest && (
            <Metadata className="mb-6">
              Error ID: {error.digest}
            </Metadata>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={reset} variant="default">
              Try Again
            </Button>
            <Link href="/">
              <Button variant="outline">Go Home</Button>
            </Link>
          </div>
        </div>
      </Container>
    </Section>
  );
}
