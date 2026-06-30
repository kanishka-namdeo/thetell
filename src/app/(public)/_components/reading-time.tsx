import { Clock } from "lucide-react";
import { Metadata } from "@/components";
import { cn } from "@/lib/utils";

interface ReadingTimeProps {
  wordCount?: number;
  wordsPerMinute?: number;
  className?: string;
}

export function ReadingTime({
  wordCount,
  wordsPerMinute = 230,
  className,
}: ReadingTimeProps) {
  if (!wordCount || wordCount <= 0) return null;
  const minutes = Math.max(1, Math.ceil(wordCount / wordsPerMinute));
  const label = `${minutes} min read`;

  return (
    <Metadata className={cn("inline-flex items-center gap-1", className)}>
      <Clock className="h-3 w-3" />
      {label}
    </Metadata>
  );
}
