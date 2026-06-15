import * as React from "react";
import { cn } from "@/lib/utils";

export interface MetadataProps extends React.HTMLAttributes<HTMLSpanElement> {
  as?: React.ElementType;
}

const Metadata = React.forwardRef<HTMLSpanElement, MetadataProps>(
  ({ className, as: Component = "span", ...props }, ref) => {
    return (
      <Component
        ref={ref}
        className={cn(
          "text-xs uppercase tracking-widest font-mono text-neutral-500",
          className
        )}
        {...props}
      />
    );
  }
);
Metadata.displayName = "Metadata";

export { Metadata };
