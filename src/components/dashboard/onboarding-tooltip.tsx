"use client";

import { useState, useEffect, type ReactNode } from "react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingTooltipProps {
  /** Unique identifier for this tooltip */
  id: string;
  /** Tooltip headline */
  title: string;
  /** Tooltip body content */
  content: string;
  /** Position relative to trigger element */
  position?: "top" | "bottom" | "left" | "right";
  /** localStorage key to track dismissal (defaults to `onboarding-${id}`) */
  dismissKey?: string;
  /** Optional className for the trigger wrapper */
  className?: string;
  /** The element the tooltip wraps (typically a heading or info icon) */
  children?: ReactNode;
  /** Whether to show an info icon as trigger if no children provided */
  showInfoIcon?: boolean;
}

/**
 * Reusable onboarding tooltip for first-time users.
 *
 * - Wraps content (or an info icon) with a tooltip
 * - Tracks dismissal in localStorage so it doesn't reappear
 * - Uses shadcn/ui Tooltip component
 *
 * Usage:
 * ```tsx
 * <OnboardingTooltip
 *   id="signals-intro"
 *   title="What are Signals?"
 *   content="Raw public information collected and analyzed by AI"
 *   position="right"
 * >
 *   <h1>Signals</h1>
 * </OnboardingTooltip>
 * ```
 */
export function OnboardingTooltip({
  id,
  title,
  content,
  position = "top",
  dismissKey,
  className,
  children,
  showInfoIcon = false,
}: OnboardingTooltipProps) {
  const storageKey = dismissKey || `onboarding-${id}`;
  const [isDismissed, setIsDismissed] = useState(true); // Start dismissed to prevent flash
  const [isLoading, setIsLoading] = useState(true);

  // Check localStorage on mount (client-side only)
   
  useEffect(() => {
    const dismissed = localStorage.getItem(storageKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDismissed(dismissed === "true");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(false);
  }, [storageKey]);

  const handleDismiss = () => {
    localStorage.setItem(storageKey, "true");
    setIsDismissed(true);
  };

  // Don't render during SSR/loading to prevent hydration mismatch
  if (isLoading) {
    return (
      <div className={cn("inline-flex items-center gap-2", className)}>
        {children}
      </div>
    );
  }

  // If dismissed, just render children without tooltip
  if (isDismissed) {
    return (
      <div className={cn("inline-flex items-center gap-2", className)}>
        {children}
        {showInfoIcon && !children && (
          <Info className="h-4 w-4 text-muted-foreground opacity-50" />
        )}
      </div>
    );
  }

  // Active tooltip with title and content
  return (
    <TooltipProvider delay={300}>
      <Tooltip>
        <TooltipTrigger
          className={cn("inline-flex items-center gap-2 cursor-help", className)}
          onClick={handleDismiss}
        >
          {children}
          {showInfoIcon && !children && (
            <Info className="h-4 w-4 text-brand animate-pulse" />
          )}
        </TooltipTrigger>
        <TooltipContent side={position} className="max-w-xs p-3">
          <div className="space-y-2">
            <p className="font-sans font-semibold text-background text-sm">
              {title}
            </p>
            <p className="text-xs text-background/80 leading-relaxed">
              {content}
            </p>
            <button
              onClick={handleDismiss}
              className="text-xs text-background/60 hover:text-background underline underline-offset-2"
            >
              Got it, dismiss
            </button>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Predefined tooltip content for each page type.
 * Use these constants when instantiating OnboardingTooltip.
 */
export const ONBOARDING_CONTENT = {
  signals: {
    title: "What are Signals?",
    content:
      "Raw public information — news, filings, social posts — collected and analyzed by AI agents",
  },
  overview: {
    title: "How it works",
    content:
      "Signals are collected from public sources, analyzed by AI, and synthesized into Strategic Insights (cross-signal patterns)",
  },
} as const;