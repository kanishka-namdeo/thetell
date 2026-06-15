import * as React from "react";
import { cn } from "@/lib/utils";

export interface HeadlineProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  size?: "hero" | "section" | "card" | "subheading";
}

const Headline = React.forwardRef<HTMLHeadingElement, HeadlineProps>(
  ({ className, level = 1, size = "card", ...props }, ref) => {
    const sizes = {
      hero: "text-5xl sm:text-6xl lg:text-9xl font-black leading-[0.9] tracking-tighter",
      section: "text-4xl lg:text-5xl font-black",
      card: "text-2xl lg:text-3xl font-bold",
      subheading: "text-xl lg:text-2xl font-bold",
    };

    const Tag = `h${level}` as const;

    return (
      <Tag
        ref={ref}
        className={cn(
          "font-serif text-foreground",
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Headline.displayName = "Headline";

export { Headline };
