"use client";

import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface CopyButtonProps {
  text: string;
  className?: string;
  size?: "sm" | "default";
}

export function CopyButton({ text, className, size = "default" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error("clipboard.copy.failed", { error: String(err) });
    }
  };

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={handleCopy}
      className={cn("h-7 px-2", className)}
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? (
        <Check className="size-3 text-success" />
      ) : (
        <Copy className="size-3 text-muted-foreground" />
      )}
    </Button>
  );
}
