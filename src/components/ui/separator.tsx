"use client"

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"

import { cn } from "@/lib/utils"

function Separator({
  className,
  orientation = "horizontal",
  weight = "thin",
  ...props
}: SeparatorPrimitive.Props & { weight?: "thin" | "medium" | "heavy" }) {
  const weights = {
    thin: "data-horizontal:border-t data-vertical:border-l",
    medium: "data-horizontal:border-t-2 data-vertical:border-l-2",
    heavy: "data-horizontal:border-t-4 data-vertical:border-l-4",
  }
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 border-foreground",
        weights[weight],
        "data-horizontal:w-full data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
