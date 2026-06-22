"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2, RotateCcw, Server } from "lucide-react";
import { cn } from "@/lib/utils";

interface DebugSessionInfoProps {
  sessionId: string | null;
  isRunning: boolean;
  eventCount: number;
  onReset: () => void;
}

export function DebugSessionInfo({
  sessionId,
  isRunning,
  eventCount,
  onReset,
}: DebugSessionInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Session Info</CardTitle>
        <CardDescription>Current debug session status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Status</span>
            <Badge
              variant={isRunning ? "default" : "secondary"}
              className={cn(
                "gap-1.5",
                isRunning && "bg-primary",
                !isRunning && sessionId && "bg-success text-success-foreground",
                !isRunning && !sessionId && "bg-muted text-muted-foreground"
              )}
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Running
                </>
              ) : sessionId ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  Completed
                </>
              ) : (
                <>
                  <Server className="h-3 w-3" />
                  Idle
                </>
              )}
            </Badge>
          </div>
          {sessionId && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Session ID</span>
              <span className="text-xs font-mono text-muted-foreground">
                {sessionId.slice(0, 8)}...
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Events</span>
            <span className="text-sm">{eventCount}</span>
          </div>
        </div>

        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-2">Available Tools</h4>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-xs">
              Prisma
            </Badge>
            <Badge variant="outline" className="text-xs">
              GitHub
            </Badge>
            <Badge variant="outline" className="text-xs">
              Chrome DevTools
            </Badge>
            <Badge variant="outline" className="text-xs">
              Context7
            </Badge>
            <Badge variant="outline" className="text-xs">
              Sequential Thinking
            </Badge>
          </div>
        </div>

        {sessionId && !isRunning && (
          <div className="pt-4 border-t">
            <Button onClick={onReset} variant="outline" size="sm">
              <RotateCcw className="mr-2 h-3 w-3" />
              Reset Session
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
