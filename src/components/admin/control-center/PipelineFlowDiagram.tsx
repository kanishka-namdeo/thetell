import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineFlowDiagramProps {
  stageCount: number;
  className?: string;
}

export function PipelineFlowDiagram({
  stageCount,
  className,
}: PipelineFlowDiagramProps) {
  return (
    <div
      className={cn(
        "hidden lg:flex items-center justify-center gap-1 py-2",
        className
      )}
      aria-hidden="true"
    >
      {Array.from({ length: stageCount - 1 }).map((_, i) => (
        <div key={i} className="flex items-center">
          <div className="h-px w-8 bg-border" />
          <ArrowRight className="size-4 text-muted-foreground" />
          <div className="h-px w-8 bg-border" />
        </div>
      ))}
    </div>
  );
}
