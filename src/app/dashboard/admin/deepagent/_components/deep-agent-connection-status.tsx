"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/hooks/use-deepagent-stream";

interface DeepAgentConnectionStatusProps {
  status: ConnectionStatus;
  onReconnect?: () => void;
  className?: string;
}

const statusConfig: Record<ConnectionStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Wifi; pulse?: boolean }> = {
  connected: { label: "Connected", variant: "default", icon: Wifi },
  connecting: { label: "Connecting...", variant: "secondary", icon: RefreshCw, pulse: true },
  reconnecting: { label: "Reconnecting...", variant: "outline", icon: RefreshCw, pulse: true },
  disconnected: { label: "Disconnected", variant: "secondary", icon: WifiOff },
};

export function DeepAgentConnectionStatus({
  status,
  onReconnect,
  className,
}: DeepAgentConnectionStatusProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const isActive = status === "connected";
  const isReconnecting = status === "reconnecting" || status === "connecting";

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <Badge
        variant={config.variant}
        className={cn(
          "h-5 px-1.5 text-[10px] gap-1",
          isActive && "bg-success/10 text-success border-success/20",
          isReconnecting && "animate-pulse"
        )}
      >
        <Icon className={cn("size-2.5", config.pulse && "animate-spin")} />
        {config.label}
      </Badge>
      {status === "disconnected" && onReconnect && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-[10px] gap-1"
          onClick={onReconnect}
        >
          <RefreshCw className="size-2.5" />
          Reconnect
        </Button>
      )}
    </div>
  );
}
