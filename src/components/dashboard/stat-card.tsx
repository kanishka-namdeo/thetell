"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BarChart3, Building2, FileText, TrendingUp, Users, Activity, ShieldCheck, Server, Flag, Brain } from "lucide-react";
import { motion, useInView } from "motion/react";

type IconName = "BarChart3" | "Building2" | "FileText" | "TrendingUp" | "Users" | "Activity" | "ShieldCheck" | "Server" | "Flag" | "Brain";

const ICON_MAP = {
  BarChart3,
  Building2,
  FileText,
  TrendingUp,
  Users,
  Activity,
  ShieldCheck,
  Server,
  Flag,
  Brain,
};

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: IconName;
  trend?: {
    value: string;
    positive: boolean;
  };
  className?: string;
}

function useCountUp(target: number, duration: number = 700) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  useEffect(() => {
    if (!isInView) return;

    let startTime: number;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        setCount(target);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isInView, target, duration]);

  return { count, ref };
}

export function StatCard({
  title,
  value,
  description,
  icon,
  trend,
  className,
}: StatCardProps) {
  const numericValue = typeof value === "number" ? value : null;
  const { count, ref } = useCountUp(numericValue || 0);
  const Icon = ICON_MAP[icon];

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
        <div ref={ref} className="text-3xl font-serif font-bold">
          {numericValue !== null ? count : value}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1 font-body">
            {description}
          </p>
        )}
        {trend && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.5 }}
            className={cn(
              "text-xs font-mono mt-2",
              trend.positive ? "text-success" : "text-destructive"
            )}
          >
            {trend.positive ? "↑" : "↓"} {trend.value}
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
