"use client";

import { useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, WifiOff } from "lucide-react";
import type { DebugEvent, StreamStatus } from "@/lib/debug/event-types";
import { DebugEventRenderer } from "./debug-event-renderer";

interface DebugEventStreamProps {
  events: DebugEvent[];
  streamStatus: StreamStatus;
}

export function DebugEventStream({ events, streamStatus }: DebugEventStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  if (events.length === 0) {
    return null;
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Debug Output</CardTitle>
            <CardDescription>Real-time output from the debug agent</CardDescription>
          </div>
          {streamStatus === "reconnecting" && (
            <div className="flex items-center gap-2 text-xs text-warning">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Reconnecting...</span>
            </div>
          )}
          {streamStatus === "disconnected" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <WifiOff className="h-3 w-3" />
              <span>Disconnected</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4" ref={scrollRef}>
          <div className="space-y-3">
            {events.map((event, idx) => (
              <DebugEventRenderer key={idx} event={event} />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
