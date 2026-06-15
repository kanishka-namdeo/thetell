import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  inverted?: boolean;
  texture?: boolean;
}

const Section = React.forwardRef<HTMLElement, SectionProps>(
  ({ className, inverted = false, texture = false, ...props }, ref) => {
    return (
      <section
        ref={ref}
        className={cn(
          "relative py-16 md:py-20",
          inverted && "bg-foreground text-background",
          texture && "newsprint-texture",
          className
        )}
        {...props}
      />
    );
  }
);
Section.displayName = "Section";

export { Section };
