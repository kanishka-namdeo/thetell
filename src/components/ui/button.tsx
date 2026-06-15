import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding text-xs uppercase tracking-widest font-sans font-medium whitespace-nowrap transition-all duration-200 ease-out outline-none select-none min-h-[44px] min-w-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-foreground text-background hover:bg-background hover:text-foreground hover:border-foreground",
        outline:
          "border border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background",
        secondary:
          "border border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background",
        ghost:
          "border border-transparent text-foreground hover:bg-muted hover:text-foreground",
        accent:
          "bg-accent text-background hover:bg-foreground hover:text-background",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-foreground underline-offset-4 decoration-2 decoration-accent hover:underline border-none bg-transparent min-h-0 min-w-0 p-0",
      },
      size: {
        default: "h-11 px-6 py-2",
        xs: "h-9 px-4 text-[10px]",
        sm: "h-9 px-4 text-[10px]",
        lg: "h-14 px-10 text-sm",
        icon: "h-11 w-11",
        "icon-xs": "h-9 w-9",
        "icon-sm": "h-9 w-9",
        "icon-lg": "h-14 w-14",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
