import { Container, Section, Headline, Body, Button, Metadata } from "@/components";
import Link from "next/link";

export default function NotFound() {
  return (
    <Section>
      <Container className="max-w-2xl">
        <div className="flex flex-col items-center text-center py-16">
          <Metadata className="mb-4 text-2xl font-bold">404</Metadata>
          <Headline level={1} size="hero" className="mb-4 text-6xl">
            Page Not Found
          </Headline>
          <Body className="text-muted-foreground mb-8 max-w-md italic">
            This story has yet to be written. The page you&apos;re looking for
            has either been moved, removed, or never existed in our archives.
          </Body>
          <Link href="/">
            <Button variant="default" size="lg">
              Return to Front Page
            </Button>
          </Link>
          <Metadata className="mt-6">
            The Tell — Corporate Intelligence Daily
          </Metadata>
        </div>
      </Container>
    </Section>
  );
}
