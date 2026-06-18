import { Container, Headline, Metadata, Icon, Newspaper, Button, Label } from "@/components";
import Link from "next/link";
import { PublicSearch } from "./_components/public-search";
import { Suspense } from "react";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Newspaper Header */}
      <header className="border-b-4 border-foreground bg-background">
        <Container className="py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Icon icon={Newspaper} size="lg" bordered />
              <div>
                <Headline level={1} size="subheading" className="text-3xl">
                  THE TELL
                </Headline>
                <Metadata>{currentDate}</Metadata>
              </div>
            </div>
            <nav className="flex items-center gap-6">
              <Link href="/">
                <Label className="hover:text-accent cursor-pointer transition-colors">
                  Feed
                </Label>
              </Link>
              <Suspense fallback={<div className="w-48 h-8" />}>
                <PublicSearch />
              </Suspense>
              <Link href="/sign-in">
                <Button size="sm">Sign In</Button>
              </Link>
            </nav>
          </div>
        </Container>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-foreground bg-background">
        <Container className="py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <Metadata>© 2026 The Tell. All rights reserved.</Metadata>
            <Link href="/sign-in">
              <Label className="hover:text-accent cursor-pointer transition-colors">
                Sign In
              </Label>
            </Link>
          </div>
        </Container>
      </footer>
    </div>
  );
}
