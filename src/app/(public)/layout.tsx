import { Container, Headline, Metadata, Button, Label } from "@/components";
import { Logo } from "@/components/logo";
import { MobileNav } from "@/components/layout/mobile-nav";
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
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Newspaper Header */}
      <header className="border-b-4 border-foreground bg-background">
        <Container className="py-3 md:py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 md:gap-4 hover:opacity-80 transition-opacity">
              <div className="md:hidden">
                <Logo className="h-8 w-8" />
              </div>
              <div className="hidden md:flex">
                <Logo className="h-12 w-12" />
              </div>
              <div>
                <Headline level={1} size="subheading" className="text-xl md:text-3xl">
                  THE TELL
                </Headline>
                <Metadata className="hidden sm:block">{currentDate}</Metadata>
              </div>
            </Link>
            <nav className="hidden md:flex items-center gap-6">
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
            <div className="md:hidden">
              <MobileNav />
            </div>
          </div>
        </Container>
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-1">
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
