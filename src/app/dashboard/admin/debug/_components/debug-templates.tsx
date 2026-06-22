"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Bug,
  SearchX,
  BrainCircuit,
  Clock,
  Database,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DebugTemplate {
  id: string;
  label: string;
  description: string;
  icon: string;
  problemTemplate: string;
  contextFetcher: string | null;
}

interface DebugTemplatesProps {
  onSelectTemplate: (problem: string, context: string) => void;
  className?: string;
}

const iconMap: Record<string, LucideIcon> = {
  Bug,
  SearchX,
  BrainCircuit,
  Clock,
  Database,
};

export function DebugTemplates({ onSelectTemplate, className }: DebugTemplatesProps) {
  const [templates, setTemplates] = useState<DebugTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchTemplates() {
      try {
        const res = await fetch("/api/v1/admin/debug/templates");
        if (!res.ok) throw new Error("Failed to fetch templates");
        const data = await res.json();
        if (!cancelled) {
          setTemplates(data.templates);
        }
      } catch {
        // Silently fail — templates are optional
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchTemplates();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = async (template: DebugTemplate) => {
    setResolvingId(template.id);
    try {
      const res = await fetch("/api/v1/admin/debug/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id }),
      });
      if (!res.ok) throw new Error("Failed to resolve template");
      const data = await res.json();
      onSelectTemplate(data.template.problemTemplate, data.systemContext);
    } catch {
      // Fallback: use the static problem template without system context
      onSelectTemplate(template.problemTemplate, "");
    } finally {
      setResolvingId(null);
    }
  };

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center p-8", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading templates...</span>
      </div>
    );
  }

  if (templates.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="text-sm font-medium text-muted-foreground">
        Quick-start templates
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => {
          const Icon = iconMap[template.icon] ?? Bug;
          const isResolving = resolvingId === template.id;
          return (
            <Card
              key={template.id}
              className="group cursor-pointer transition-colors hover:border-primary/50 hover:bg-accent/50"
              onClick={() => !isResolving && handleSelect(template)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!isResolving) handleSelect(template);
                }
              }}
            >
              <CardHeader className="p-4 pb-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {isResolving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm">{template.label}</CardTitle>
                    <CardDescription className="mt-1 line-clamp-2 text-xs">
                      {template.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
