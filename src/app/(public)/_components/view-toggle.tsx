"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Metadata } from "@/components";
import { cn } from "@/lib/utils";

interface ViewToggleProps {
  currentView: "signal" | "tactical";
}

export function ViewToggle({ currentView }: ViewToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function switchView(view: "signal" | "tactical") {
    const params = new URLSearchParams(searchParams.toString());
    if (view === "tactical") {
      params.set("view", "tactical");
    } else {
      params.delete("view");
    }
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "/");
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Metadata>VIEW</Metadata>
      <div className="inline-flex border border-foreground">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => switchView("signal")}
          className={cn(
            "transition-colors border-0 min-h-9 min-w-0 h-9 px-4",
            currentView === "signal"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Signal Feed
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => switchView("tactical")}
          className={cn(
            "transition-colors border-0 border-l border-foreground min-h-9 min-w-0 h-9 px-4",
            currentView === "tactical"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Tactical View
        </Button>
      </div>
    </div>
  );
}
