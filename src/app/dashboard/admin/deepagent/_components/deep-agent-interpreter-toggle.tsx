"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Code2, Loader2 } from "lucide-react";
import { logger } from "@/lib/logger";

interface InterpreterStatus {
  enabled: boolean;
  runtime: string;
  tools: string[];
}

export function DeepAgentInterpreterToggle() {
  const [status, setStatus] = useState<InterpreterStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const loadStatus = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const res = await fetch("/api/v1/admin/deepagent/interpreter", { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        if (mountedRef.current) {
          setStatus(data.data);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      logger.error("deepagent.interpreter_status_load_failed", { error: String(error) });
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const handleToggle = async (enabled: boolean) => {
    if (!mountedRef.current) return;
    setIsToggling(true);
    try {
      const res = await fetch("/api/v1/admin/deepagent/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        if (mountedRef.current) {
          setStatus(data.data);
        }
      }
    } catch (error) {
      logger.error("deepagent.interpreter_toggle_failed", { error: String(error) });
    } finally {
      if (mountedRef.current) {
        setIsToggling(false);
      }
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStatus();
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, [loadStatus]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          Failed to load interpreter status
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Code2 className="h-5 w-5" />
          <CardTitle>Code Interpreter</CardTitle>
          <Badge variant={status.enabled ? "default" : "secondary"} className="ml-auto">
            {status.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
        <CardDescription>
          Enable QuickJS runtime for in-process code execution. The agent can use the{" "}
          <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">eval</code> tool to run
          JavaScript snippets.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="interpreter-toggle">Enable Code Interpreter</Label>
            <div className="text-xs text-muted-foreground">
              Runtime: {status.runtime} · Tools: {status.tools.join(", ")}
            </div>
          </div>
          <Switch
            id="interpreter-toggle"
            checked={status.enabled}
            onCheckedChange={handleToggle}
            disabled={isToggling}
          />
        </div>
      </CardContent>
    </Card>
  );
}
