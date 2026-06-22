"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Database,
  Settings,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DebugEvent } from "@/lib/debug/event-types";

interface DebugRelatedSignalsProps {
  events: DebugEvent[];
  className?: string;
}

interface RelatedItem {
  type: "file" | "table" | "error" | "config";
  label: string;
  href?: string;
  detail?: string;
}

const FILE_PATTERNS = [
  /src\/[a-zA-Z0-9\/_.-]+\.(ts|tsx|js|jsx)/g,
  /prisma\/schema\.prisma/g,
  /package\.json/g,
  /docker-compose\.yml/g,
  /\.env\.\w+/g,
];

const TABLE_PATTERNS = [
  /prisma\.(\w+)\.(findMany|findFirst|findUnique|create|update|delete|count|upsert)/g,
];

const ERROR_PATTERNS = [
  /Error:\s*(.+?)(?:\n|$)/g,
  /failed to (\w+?)(?:\s|$)/gi,
  /TypeError:\s*(.+?)(?:\n|$)/g,
];

function extractRelatedItems(events: DebugEvent[]): RelatedItem[] {
  const items = new Map<string, RelatedItem>();
  const allText = events
    .map((e) => {
      const parts: string[] = [];
      if (e.content) parts.push(e.content);
      if (e.tool_input) parts.push(JSON.stringify(e.tool_input));
      if (e.tool_output) parts.push(JSON.stringify(e.tool_output));
      return parts.join("\n");
    })
    .join("\n");

  // Extract file paths
  for (const pattern of FILE_PATTERNS) {
    const matches = allText.matchAll(pattern);
    for (const match of matches) {
      const filePath = match[0];
      const key = `file:${filePath}`;
      if (!items.has(key)) {
        items.set(key, {
          type: "file",
          label: filePath,
          href: `#file:${filePath}`,
          detail: "Referenced file",
        });
      }
    }
  }

  // Extract Prisma model references
  for (const pattern of TABLE_PATTERNS) {
    const matches = allText.matchAll(pattern);
    for (const match of matches) {
      const modelName = match[1];
      const key = `table:${modelName}`;
      if (!items.has(key)) {
        items.set(key, {
          type: "table",
          label: modelName,
          href: `/dashboard/admin/moderation?table=${modelName}`,
          detail: `prisma.${modelName}`,
        });
      }
    }
  }

  // Extract errors
  for (const pattern of ERROR_PATTERNS) {
    const matches = allText.matchAll(pattern);
    for (const match of matches) {
      const errorMsg = match[1]?.trim().slice(0, 100);
      if (errorMsg) {
        const key = `error:${errorMsg}`;
        if (!items.has(key)) {
          items.set(key, {
            type: "error",
            label: errorMsg,
            detail: "Error found in session",
          });
        }
      }
    }
  }

  // Config file references
  const configPatterns = [
    /OPENCODE_URL/g,
    /DATABASE_URL/g,
    /FAST_MODEL/g,
    /REASONING_MODEL/g,
    /BRAVE_API_KEY/g,
  ];
  for (const pattern of configPatterns) {
    const matches = allText.matchAll(pattern);
    for (const match of matches) {
      const envVar = match[0];
      const key = `config:${envVar}`;
      if (!items.has(key)) {
        items.set(key, {
          type: "config",
          label: envVar,
          detail: "Environment variable",
        });
      }
    }
  }

  return Array.from(items.values()).slice(0, 20);
}

const typeConfig: Record<
  RelatedItem["type"],
  { icon: typeof FileText; badgeVariant: "default" | "secondary" | "destructive" | "outline" }
> = {
  file: { icon: FileText, badgeVariant: "secondary" },
  table: { icon: Database, badgeVariant: "outline" },
  error: { icon: AlertTriangle, badgeVariant: "destructive" },
  config: { icon: Settings, badgeVariant: "default" },
};

export function DebugRelatedSignals({ events, className }: DebugRelatedSignalsProps) {
  const relatedItems = useMemo(() => extractRelatedItems(events), [events]);

  if (relatedItems.length === 0) {
    return null;
  }

  const grouped = relatedItems.reduce<Record<string, RelatedItem[]>>(
    (acc, item) => {
      if (!acc[item.type]) acc[item.type] = [];
      acc[item.type].push(item);
      return acc;
    },
    {}
  );

  return (
    <Card className={cn("mt-6", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Related Signals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(grouped).map(([type, items]) => {
          const config = typeConfig[type as RelatedItem["type"]];
          const Icon = config.icon;
          return (
            <div key={type} className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Icon className="h-3.5 w-3.5" />
                {type === "file" && "Files"}
                {type === "table" && "Database Tables"}
                {type === "error" && "Errors"}
                {type === "config" && "Configuration"}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {items.map((item, idx) => (
                  <Badge
                    key={`${type}-${idx}`}
                    variant={config.badgeVariant}
                    className="font-mono text-xs cursor-default"
                    title={item.detail}
                  >
                    {item.href ? (
                      <a
                        href={item.href}
                        className="flex items-center gap-1 hover:underline"
                        target={item.href.startsWith("http") ? "_blank" : undefined}
                      >
                        {item.label}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      item.label
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
