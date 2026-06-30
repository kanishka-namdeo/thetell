"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

interface ConsensusFilterToggleProps {
  className?: string;
}

export function ConsensusFilterToggle({ className }: ConsensusFilterToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isHighConsensus = searchParams.get("highConsensus") === "true";

  function toggleConsensusFilter() {
    const params = new URLSearchParams(searchParams.toString());
    if (isHighConsensus) {
      params.delete("highConsensus");
    } else {
      params.set("highConsensus", "true");
    }
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "/");
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleConsensusFilter}
      className={cn(
        "h-8 px-3 text-xs gap-1.5",
        isHighConsensus
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground border border-dashed border-foreground/30",
        className
      )}
    >
      <CheckCircle2 className="size-3.5" />
      High consensus only
    </Button>
  );
}
