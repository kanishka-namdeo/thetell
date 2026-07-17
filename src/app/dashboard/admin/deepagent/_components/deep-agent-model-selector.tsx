"use client";

import { useState, useEffect, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Cpu, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  supportsCaching?: boolean;
}

interface DeepAgentModelSelectorProps {
  value?: string;
  onValueChange?: (model: string) => void;
  disabled?: boolean;
  className?: string;
}

export function DeepAgentModelSelector({
  value,
  onValueChange,
  disabled,
  className,
}: DeepAgentModelSelectorProps) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    async function fetchModels() {
      try {
        const res = await fetch("/api/v1/admin/deepagent/models", {
credentials: "include", signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setModels(data.data || []);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        // Silently fail - model selector is optional
      } finally {
        setLoading(false);
      }
    }
    fetchModels();

    return () => {
      controller.abort();
    };
  }, []);

  if (loading || models.length === 0) {
    return null;
  }

  const selectedModel = models.find((m) => m.id === value);
  const tooltipText = selectedModel
    ? `Using ${selectedModel.name} (${selectedModel.provider})`
    : "Select model for new sessions";

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)} title={tooltipText}>
      <Select
        value={value || null}
        onValueChange={(val) => val && onValueChange?.(val)}
        disabled={disabled}
      >
        <SelectTrigger className="h-7 w-auto min-w-[120px] px-2 text-xs gap-1.5 border-border/50">
          <Cpu className="size-3 text-muted-foreground" />
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model.id} value={model.id} className="text-xs">
              <div className="flex items-center gap-2">
                <span>{model.name}</span>
                <span className="text-muted-foreground text-[10px]">{model.provider}</span>
                {model.supportsCaching && (
                  <Badge variant="secondary" className="h-3.5 px-1 text-[9px] gap-0.5">
                    <Zap className="size-2" />
                    cache
                  </Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedModel?.supportsCaching && value && (
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] gap-0.5 text-muted-foreground">
          <Zap className="size-2.5" />
          caching
        </Badge>
      )}
    </div>
  );
}
