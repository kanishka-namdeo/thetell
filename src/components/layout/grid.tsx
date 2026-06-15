import * as React from "react";
import { cn } from "@/lib/utils";

export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  cols?: 1 | 2 | 3 | 4 | 5 | 6 | 12;
  collapsed?: boolean;
}

const Grid = React.forwardRef<HTMLDivElement, GridProps>(
  ({ className, cols = 12, collapsed = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "grid",
          `grid-cols-${cols}`,
          collapsed && "[&>*:not(:last-child)]:border-r [&>*]:border-b border-t border-l",
          className
        )}
        {...props}
      />
    );
  }
);
Grid.displayName = "Grid";

export { Grid };
