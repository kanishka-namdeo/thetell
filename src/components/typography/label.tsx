import * as React from "react";
import { cn } from "@/lib/utils";

export interface LabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  as?: React.ElementType;
}

const Label = React.forwardRef<HTMLSpanElement, LabelProps>(
  ({ className, as: Component = "span", ...props }, ref) => {
    return (
      <Component
        ref={ref}
        className={cn(
          "text-xs uppercase tracking-widest font-mono font-medium",
          className
        )}
        {...props}
      />
    );
  }
);
Label.displayName = "Label";

export { Label };
