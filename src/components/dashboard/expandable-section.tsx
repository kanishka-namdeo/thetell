"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpandableSectionProps {
  /** Content always visible at the top */
  children: ReactNode;
  /** Content revealed when expanded */
  expandableContent: ReactNode;
  /** Label for the expand/collapse toggle button */
  expandLabel: string;
  collapseLabel: string;
  /** Accent color for the border-left of list items */
  accentClass?: string;
  className?: string;
}

export function ExpandableSection({
  children,
  expandableContent,
  expandLabel,
  collapseLabel,
  className,
}: ExpandableSectionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn("space-y-3", className)}>
      {children}

      {expanded && expandableContent}

      <Button
        variant="ghost"
        size="xs"
        onClick={() => setExpanded((prev) => !prev)}
        className="gap-1 text-xs"
      >
        {expanded ? (
          <>
            {collapseLabel} <ChevronUp className="h-3 w-3" />
          </>
        ) : (
          <>
            {expandLabel} <ChevronDown className="h-3 w-3" />
          </>
        )}
      </Button>
    </div>
  );
}
