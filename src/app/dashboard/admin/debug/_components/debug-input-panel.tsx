"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Play, Square } from "lucide-react";

interface DebugInputPanelProps {
  problem: string;
  context: string;
  isRunning: boolean;
  error: string | null;
  onProblemChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}

export function DebugInputPanel({
  problem,
  context,
  isRunning,
  error,
  onProblemChange,
  onContextChange,
  onStart,
  onStop,
  onReset,
}: DebugInputPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Describe the Problem</CardTitle>
        <CardDescription>
          Tell the debug agent what&apos;s wrong. Be specific about symptoms and expected behavior.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Problem Description *</label>
          <Textarea
            placeholder="e.g., Company 'AMD' has zero signals fetched, but it should have signals from RSS feeds and news scrapers..."
            value={problem}
            onChange={(e) => onProblemChange(e.target.value)}
            rows={4}
            disabled={isRunning}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            Additional Context (Optional)
          </label>
          <Textarea
            placeholder="e.g., The company was added yesterday, I've checked the database and CompanyDataSource records exist..."
            value={context}
            onChange={(e) => onContextChange(e.target.value)}
            rows={3}
            disabled={isRunning}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="flex gap-2">
          {!isRunning ? (
            <Button onClick={onStart} disabled={!problem.trim()}>
              <Play className="mr-2 h-4 w-4" />
              Start Debug Session
            </Button>
          ) : (
            <Button onClick={onStop} variant="destructive">
              <Square className="mr-2 h-4 w-4" />
              Stop
            </Button>
          )}
          {(problem || context) && (
            <Button onClick={onReset} variant="outline">
              Reset
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
