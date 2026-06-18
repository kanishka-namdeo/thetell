"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AgentFilterValue = "ALL" | "ANALYST" | "GOSSIP_GIRL";

interface AgentFilterProps {
  value: AgentFilterValue;
  onValueChange: (value: AgentFilterValue) => void;
  className?: string;
}

const filters: { value: AgentFilterValue; label: string }[] = [
  { value: "ALL", label: "All Voices" },
  { value: "ANALYST", label: "The Analyst" },
  { value: "GOSSIP_GIRL", label: "Gossip Girl" },
];

export function AgentFilter({ value, onValueChange, className }: AgentFilterProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {filters.map((filter) => (
        <Button
          key={filter.value}
          variant={value === filter.value ? "default" : "outline"}
          size="xs"
          onClick={() => onValueChange(filter.value)}
        >
          {filter.label}
        </Button>
      ))}
    </div>
  );
}

export type { AgentFilterValue };
