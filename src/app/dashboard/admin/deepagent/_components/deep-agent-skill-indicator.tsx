"use client";

import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeepAgentSkillIndicatorProps {
  isLoading?: boolean;
  activeSkills?: string[];
  className?: string;
}

export function DeepAgentSkillIndicator({
  isLoading,
  activeSkills = [],
  className,
}: DeepAgentSkillIndicatorProps) {
  if (!isLoading && activeSkills.length === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground flex-wrap",
        className
      )}
    >
      {isLoading && (
        <div className="flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Loading skills...</span>
        </div>
      )}
      {activeSkills.length > 0 && (
        <>
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>Active skills:</span>
          {activeSkills.map((skill) => (
            <Badge
              key={skill}
              variant="secondary"
              className="text-[10px] h-5 px-2 bg-primary/10 text-primary border-primary/20"
            >
              {skill}
            </Badge>
          ))}
        </>
      )}
    </div>
  );
}
