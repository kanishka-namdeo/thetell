"use client";

import { Container, Section, Headline, Body, Button } from "@/components";
import { Card, CardContent } from "@/components/ui/card";

export default function PublicFeedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Section texture>
      <Container className="max-w-2xl py-12">
        <Card className="border-2 border-foreground text-center">
          <CardContent className="pt-8 pb-8">
            <Headline level={2} size="section" className="mb-3">
              Something went wrong
            </Headline>
            <Body className="text-muted-foreground mb-6">
              We couldn&apos;t load the feed. This might be a temporary issue.
            </Body>
            <Button onClick={reset}>Try again</Button>
          </CardContent>
        </Card>
      </Container>
    </Section>
  );
}
