import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full min-w-0 border-b-2 border-foreground bg-transparent px-3 py-2 font-mono text-sm transition-colors duration-200 outline-none",
        "placeholder:text-neutral-500",
        "focus-visible:bg-neutral-100 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
