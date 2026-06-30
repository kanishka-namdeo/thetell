import { TrendingUp, Minus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface MomentumArrowProps {
  momentum: number;
  className?: string;
  showValue?: boolean;
}

export function MomentumArrow({
  momentum,
  className,
  showValue = false,
}: MomentumArrowProps) {
  const isUp = momentum > 0;
  const isStrong = momentum > 0.5;

  const Icon = isUp ? TrendingUp : Minus;
  const toneClass = isUp ? "text-success" : "text-muted-foreground";
  const opacityClass = isUp && !isStrong ? "opacity-70" : "";

  const label = `Momentum: ${momentum.toFixed(2)}`;

  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        <span
          className={cn(
            "inline-flex items-center gap-0.5",
            toneClass,
            opacityClass,
            className
          )}
          aria-label={label}
        >
          <Icon className="h-3 w-3" />
          {showValue && (
            <span className="text-[10px] font-mono">{momentum.toFixed(2)}</span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
