import * as React from "react";
import { cn } from "@/lib/utils";

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

export const Logo = React.forwardRef<SVGSVGElement, LogoProps>(
  ({ className, ...props }, ref) => {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        fill="none"
        role="img"
        aria-label="The Tell logo"
        className={cn("h-8 w-8", className)}
        {...props}
      >
        <title>The Tell logo</title>
        {/* Top bar */}
        <rect x="8" y="12" width="48" height="8" fill="currentColor" />
        {/* Middle bar with gap forming T's vertical */}
        <rect x="8" y="28" width="20" height="8" fill="currentColor" />
        <rect x="36" y="28" width="20" height="8" fill="currentColor" />
        {/* Bottom bar */}
        <rect x="8" y="44" width="48" height="8" fill="currentColor" />
      </svg>
    );
  }
);

Logo.displayName = "Logo";
