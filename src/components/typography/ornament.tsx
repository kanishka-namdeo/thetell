import * as React from "react";
import { cn } from "@/lib/utils";

export interface OrnamentProps extends React.HTMLAttributes<HTMLDivElement> {
  symbol?: string;
  count?: number;
}

const Ornament = React.forwardRef<HTMLDivElement, OrnamentProps>(
  ({ className, symbol = "✧", count = 3, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "py-8 text-center font-serif text-2xl text-neutral-400 tracking-[1em]",
          className
        )}
        {...props}
      >
        {Array(count).fill(symbol).join(" ")}
      </div>
    );
  }
);
Ornament.displayName = "Ornament";

export { Ornament };
