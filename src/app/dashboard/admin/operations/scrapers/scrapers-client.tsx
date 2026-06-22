"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Play,
  TestTube,
  Save,
  Loader2,
  XCircle,
} from "lucide-react";

interface Scraper {
  name: string;
  displayName: string;
  enabled: boolean;
  rateLimitPerMinute: number;
  retryAttempts: number;
  timeout: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  successRate: number;
  errorCount: number;
  signalCount: number;
}

export function ScrapersClient() {
  const [scrapers, setScrapers] = useState<Scraper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedScraper, setSelectedScraper] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchScrapers = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const res = await fetch("/api/v1/admin/scrapers", { signal: controller.signal });
      if (!res.ok) throw new Error("Failed to fetch scrapers");
      const data = await res.json();
      setScrapers(data.scrapers);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      toast.error("Failed to load scrapers");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchScrapers();
    return () => controllerRef.current?.abort();
  }, [fetchScrapers]);

  async function toggleEnabled(scraperName: string, enabled: boolean) {
    try {
      const res = await fetch(`/api/v1/admin/scrapers/${scraperName}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });

      if (!res.ok) throw new Error("Failed to update scraper");

      setScrapers((prev) =>
        prev.map((s) => (s.name === scraperName ? { ...s, enabled } : s))
      );

      toast.success(`Scraper ${enabled ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Failed to update scraper");
    }
  }

  async function updateConfig(
    scraperName: string,
    config: Partial<Pick<Scraper, "rateLimitPerMinute" | "retryAttempts" | "timeout">>
  ) {
    setSaving(scraperName);
    try {
      const res = await fetch(`/api/v1/admin/scrapers/${scraperName}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) throw new Error("Failed to update config");

      setScrapers((prev) =>
        prev.map((s) => (s.name === scraperName ? { ...s, ...config } : s))
      );

      toast.success("Configuration saved");
    } catch {
      toast.error("Failed to save configuration");
    } finally {
      setSaving(null);
    }
  }

  async function testScraper(scraperName: string) {
    setTesting(scraperName);
    try {
      const res = await fetch(`/api/v1/admin/scrapers/${scraperName}/test`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Test failed");
      }

      toast.success(`Test passed: ${data.message}`);
    } catch (error) {
      toast.error(`Test failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setTesting(null);
    }
  }

  async function runScraper(scraperName: string) {
    setRunning(scraperName);
    try {
      const res = await fetch(`/api/v1/admin/scrapers/${scraperName}/run`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Run failed");
      }

      toast.success(`Scraper started: ${data.message}`);
    } catch (error) {
      toast.error(`Run failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setRunning(null);
    }
  }

  const selected = scrapers.find((s) => s.name === selectedScraper);

  return (
    <div className="space-y-6">
      {/* Scraper List */}
      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="text-lg">All Scrapers</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Signals</TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scrapers.map((scraper) => (
                  <TableRow key={scraper.name}>
                    <TableCell className="font-medium">{scraper.displayName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={scraper.enabled}
                          onCheckedChange={(checked) =>
                            toggleEnabled(scraper.name, checked)
                          }
                        />
                        <Badge variant={scraper.enabled ? "default" : "secondary"}>
                          {scraper.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-mono">{scraper.signalCount}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-muted rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full"
                            style={{ width: `${scraper.successRate}%` }}
                          />
                        </div>
                        <span className="text-sm font-mono">{scraper.successRate}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {scraper.lastRunAt
                        ? new Date(scraper.lastRunAt).toLocaleString()
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testScraper(scraper.name)}
                          disabled={testing === scraper.name}
                        >
                          {testing === scraper.name ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <TestTube className="h-4 w-4" />
                          )}
                          <span className="sr-only">Test</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => runScraper(scraper.name)}
                          disabled={running === scraper.name || !scraper.enabled}
                        >
                          {running === scraper.name ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          <span className="sr-only">Run</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedScraper(scraper.name)}
                        >
                          Configure
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Configuration Panel */}
      {selected && (
        <Card className="border-2 border-foreground">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{selected.displayName} Configuration</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedScraper(null)}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Rate Limit */}
            <div className="space-y-2">
              <Label htmlFor="rateLimit">Rate Limit (requests per minute)</Label>
              <Input
                id="rateLimit"
                type="number"
                min="1"
                max="1000"
                value={selected.rateLimitPerMinute}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  setScrapers((prev) =>
                    prev.map((s) =>
                      s.name === selected.name
                        ? { ...s, rateLimitPerMinute: value }
                        : s
                    )
                  );
                }}
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of requests per minute. Helps avoid rate limiting.
              </p>
            </div>

            {/* Retry Attempts */}
            <div className="space-y-2">
              <Label htmlFor="retryAttempts">Retry Attempts</Label>
              <Select
                value={selected.retryAttempts.toString()}
                onValueChange={(value) => {
                  if (!value) return;
                  const numValue = parseInt(value);
                  setScrapers((prev) =>
                    prev.map((s) =>
                      s.name === selected.name
                        ? { ...s, retryAttempts: numValue }
                        : s
                    )
                  );
                }}
              >
                <SelectTrigger id="retryAttempts">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No retries</SelectItem>
                  <SelectItem value="1">1 retry</SelectItem>
                  <SelectItem value="2">2 retries</SelectItem>
                  <SelectItem value="3">3 retries</SelectItem>
                  <SelectItem value="5">5 retries</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Number of times to retry failed requests.
              </p>
            </div>

            {/* Timeout */}
            <div className="space-y-2">
              <Label htmlFor="timeout">Timeout (seconds)</Label>
              <Input
                id="timeout"
                type="number"
                min="5"
                max="300"
                value={selected.timeout}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  setScrapers((prev) =>
                    prev.map((s) =>
                      s.name === selected.name ? { ...s, timeout: value } : s
                    )
                  );
                }}
              />
              <p className="text-xs text-muted-foreground">
                Maximum time to wait for a response before timing out.
              </p>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button
                onClick={() =>
                  updateConfig(selected.name, {
                    rateLimitPerMinute: selected.rateLimitPerMinute,
                    retryAttempts: selected.retryAttempts,
                    timeout: selected.timeout,
                  })
                }
                disabled={saving === selected.name}
              >
                {saving === selected.name ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Configuration
                  </>
                )}
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">{selected.successRate}%</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Error Count</p>
                <p className="text-2xl font-bold">{selected.errorCount}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Last Success</p>
                <p className="text-sm font-medium">
                  {selected.lastSuccessAt
                    ? new Date(selected.lastSuccessAt).toLocaleString()
                    : "Never"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
