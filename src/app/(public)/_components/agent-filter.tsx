"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type AgentFilterValue = "ALL" | "ANALYST" | "GOSSIP_GIRL";

interface AgentFilterProps {
  value: AgentFilterValue;
  onValueChange: (value: AgentFilterValue) => void;
  className?: string;
}

const filters: {
  value: AgentFilterValue;
  label: string;
  description: string;
}[] = [
  {
    value: "ALL",
    label: "All Voices",
    description: "See analyses from both perspectives",
  },
  {
    value: "ANALYST",
    label: "The Analyst",
    description:
      "Data-driven intelligence \u2014 numbers, dates, strategic implications",
  },
  {
    value: "GOSSIP_GIRL",
    label: "Gossip Girl",
    description:
      "The tells beneath the corporate speak \u2014 power moves, hidden agendas, the real story",
  },
];

export function AgentFilter({
  value,
  onValueChange,
  className,
}: AgentFilterProps) {
  return (
    <TooltipProvider>
      <div role="group" aria-label="Filter by agent voice" className={cn("flex items-center gap-2", className)}>
        {filters.map((filter) => (
          <Tooltip key={filter.value}>
            <TooltipTrigger render={<span />}>
              <Button
                variant={value === filter.value ? "default" : "outline"}
                size="xs"
                onClick={() => onValueChange(filter.value)}
                aria-label={`Filter by ${filter.label} agent`}
                aria-pressed={value === filter.value}
              >
                {filter.label}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span className="max-w-48 text-center">{filter.description}</span>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

export type { AgentFilterValue };
