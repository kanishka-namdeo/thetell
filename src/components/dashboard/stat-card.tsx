"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    positive: boolean;
  };
  className?: string;
}

export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs uppercase tracking-widest font-sans text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-8 w-8 border border-foreground flex items-center justify-center">
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-serif font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1 font-body">
            {description}
          </p>
        )}
        {trend && (
          <div
            className={cn(
              "text-xs font-mono mt-2",
              trend.positive ? "text-green-600" : "text-red-600"
            )}
          >
            {trend.positive ? "↑" : "↓"} {trend.value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
