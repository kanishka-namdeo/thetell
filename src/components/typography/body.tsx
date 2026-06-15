import * as React from "react";
import { cn } from "@/lib/utils";

export interface BodyProps extends React.HTMLAttributes<HTMLParagraphElement> {
  dropCap?: boolean;
  justify?: boolean;
}

const Body = React.forwardRef<HTMLParagraphElement, BodyProps>(
  ({ className, dropCap = false, justify = false, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={cn(
          "font-body text-base leading-relaxed text-foreground",
          justify && "text-justify",
          dropCap && "drop-cap",
          className
        )}
        {...props}
      />
    );
  }
);
Body.displayName = "Body";

export { Body };
