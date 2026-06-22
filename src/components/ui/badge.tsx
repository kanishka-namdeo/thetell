import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex items-center px-2 py-0.5 text-[11px] uppercase tracking-widest font-mono font-medium whitespace-nowrap transition-all border border-transparent",
  {
    variants: {
      variant: {
        default: "bg-foreground text-background",
        secondary:
          "border border-foreground text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground",
        outline:
          "border border-foreground text-foreground",
        ghost:
          "text-foreground hover:bg-muted",
        link: "text-foreground underline-offset-4 hover:underline",
        accent: "bg-accent text-accent-foreground",
        muted: "bg-muted text-foreground",
        tell: "bg-badge-tell text-badge-tell-foreground",
        theme: "bg-badge-theme text-badge-theme-foreground",
        analyst: "bg-agent-analyst text-agent-analyst-foreground",
        gossip: "bg-agent-gossip text-agent-gossip-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
