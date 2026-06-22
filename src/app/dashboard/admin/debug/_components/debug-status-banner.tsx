"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  Loader2,
  Radio,
  Server,
  WifiOff,
  XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BackendStatus, StreamStatus } from "@/lib/debug/event-types";

interface DebugStatusBannerProps {
  backendStatus: BackendStatus;
  isRunning: boolean;
  sessionId: string | null;
  streamStatus: StreamStatus;
  activeSessions: number;
}

export function DebugStatusBanner({
  backendStatus,
  isRunning,
  sessionId,
  streamStatus,
  activeSessions,
}: DebugStatusBannerProps) {
  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <div className="grid gap-4 md:grid-cols-3">
          {/* Backend Status */}
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                backendStatus === "connected" && "bg-success/10",
                backendStatus === "disconnected" && "bg-destructive/10",
                backendStatus === "checking" && "bg-muted"
              )}
            >
              {backendStatus === "connected" && (
                <CheckCircle2 className="h-5 w-5 text-success" />
              )}
              {backendStatus === "disconnected" && (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              {backendStatus === "checking" && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Backend Status</div>
              <div className="text-xs text-muted-foreground">
                {backendStatus === "connected" && "OpenCode connected"}
                {backendStatus === "disconnected" && "Backend unavailable"}
                {backendStatus === "checking" && "Checking..."}
              </div>
            </div>
          </div>

          {/* Agent Status */}
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                isRunning && "bg-primary/10",
                !isRunning && sessionId && "bg-success/10",
                !isRunning && !sessionId && "bg-muted"
              )}
            >
              {isRunning && (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              )}
              {!isRunning && sessionId && (
                <CheckCircle2 className="h-5 w-5 text-success" />
              )}
              {!isRunning && !sessionId && (
                <Server className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Agent Status</div>
              <div className="text-xs text-muted-foreground">
                {isRunning && "Running"}
                {!isRunning && sessionId && "Completed"}
                {!isRunning && !sessionId && "Idle"}
              </div>
            </div>
          </div>

          {/* Event Stream */}
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                streamStatus === "connected" && "bg-success/10",
                streamStatus === "reconnecting" && "bg-warning/10",
                streamStatus === "disconnected" && "bg-muted"
              )}
            >
              {streamStatus === "connected" && (
                <Radio className="h-5 w-5 text-success animate-pulse" />
              )}
              {streamStatus === "reconnecting" && (
                <Loader2 className="h-5 w-5 animate-spin text-warning" />
              )}
              {streamStatus === "disconnected" && (
                <WifiOff className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Event Stream</div>
              <div className="text-xs text-muted-foreground">
                {streamStatus === "connected" && "Connected"}
                {streamStatus === "reconnecting" && "Reconnecting..."}
                {streamStatus === "disconnected" &&
                  (sessionId ? "Closed" : "Not started")}
              </div>
            </div>
          </div>
        </div>

        {backendStatus === "connected" && activeSessions > 0 && (
          <>
            <Separator className="my-4" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Zap className="h-3 w-3" />
              <span>
                {activeSessions} active session
                {activeSessions !== 1 ? "s" : ""} on backend
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
