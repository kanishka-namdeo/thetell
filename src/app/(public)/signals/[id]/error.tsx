"use client";

import { Container, Section, Headline, Body, Button } from "@/components";
import { Card, CardContent } from "@/components/ui/card";

export default function SignalDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Section>
      <Container className="max-w-2xl py-12">
        <Card className="border-2 border-foreground text-center">
          <CardContent className="pt-8 pb-8">
            <Headline level={2} size="section" className="mb-3">
              Couldn&apos;t load signal
            </Headline>
            <Body className="text-muted-foreground mb-6">
              This signal may no longer be available or we encountered an error loading it.
            </Body>
            <Button onClick={reset}>Try again</Button>
          </CardContent>
        </Card>
      </Container>
    </Section>
  );
}
