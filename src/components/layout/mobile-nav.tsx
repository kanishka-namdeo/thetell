"use client";

import { useState } from "react";
import Link from "next/link";
import { Home, LogIn, Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";

interface MobileNavLinkProps {
  href: string;
  icon: React.ElementType;
  children: React.ReactNode;
  onClick?: () => void;
}

function MobileNavLink({ href, icon: Icon, children, onClick }: MobileNavLinkProps) {
  return (
    <Link href={href} onClick={onClick} className="block">
      <div className="min-h-11 flex items-center gap-3 px-2 py-3 border-b border-border hover:bg-muted transition-colors">
        <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <Label className="text-base font-serif cursor-pointer">{children}</Label>
      </div>
    </Link>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden min-h-11 min-w-11"
            aria-label="Open navigation menu"
          />
        }
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="right" className="w-72 sm:max-w-sm">
        <SheetHeader className="pb-4">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Logo className="h-8 w-8" />
            <SheetTitle className="text-lg font-serif">The Tell</SheetTitle>
          </Link>
        </SheetHeader>
        <nav className="flex flex-col gap-0 p-4">
          <MobileNavLink href="/" icon={Home} onClick={() => setOpen(false)}>
            Feed
          </MobileNavLink>
          <MobileNavLink href="/sign-in" icon={LogIn} onClick={() => setOpen(false)}>
            Sign In
          </MobileNavLink>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
