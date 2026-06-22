"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface SystemSettings {
  discovery: {
    schedule: string;
    enabled: boolean;
  };
  ai: {
    defaultProvider: "openai" | "anthropic";
    analystModel: string;
    gossipGirlModel: string;
  };
  thresholds: {
    minConfidenceForPublication: number;
    minQualityScore: number;
  };
  features: {
    semanticDeduplication: boolean;
    languageDetection: boolean;
    qualityGate: boolean;
  };
  rateLimiting: {
    requestsPerMinute: number;
    burstLimit: number;
  };
  email: {
    configured: boolean;
    from?: string | null;
    smtpHost?: string | null;
    smtpPort?: number | null;
  };
  correlation: {
    enabled: boolean;
    windowSize: number;
    minSignals: number;
    confidenceThreshold: number;
  };
  calibration: {
    enabled: boolean;
  };
}

export function SettingsClient() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const saveMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const fetchSettings = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    try {
      const response = await fetch("/api/v1/admin/settings", { signal: controller.signal });
      if (!response.ok) throw new Error("Failed to fetch settings");
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Failed to fetch settings";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSettings();
    return () => controllerRef.current?.abort();
  }, [fetchSettings]);

  useEffect(() => {
    return () => {
      if (saveMessageTimerRef.current) clearTimeout(saveMessageTimerRef.current);
    };
  }, []);

  async function handleSave() {
    if (!settings) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/v1/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save settings");
      }

      const updated = await response.json();
      if (!mountedRef.current) return;
      setSettings(updated);
      setSaveMessage({ type: "success", text: "Settings saved successfully" });
      toast.success("Settings saved successfully");
      if (saveMessageTimerRef.current) clearTimeout(saveMessageTimerRef.current);
      saveMessageTimerRef.current = setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      if (!mountedRef.current) return;
      setSaveMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save settings",
      });
    } finally {
      if (mountedRef.current) setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!settings) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground py-12">
            Failed to load settings
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Discovery Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Discovery Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="schedule">Cron Schedule</Label>
            <Input
              id="schedule"
              value={settings.discovery.schedule}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  discovery: { ...settings.discovery, schedule: e.target.value },
                })
              }
              placeholder="0 */6 * * *"
            />
            <p className="text-xs text-muted-foreground">
              Standard cron expression (e.g., &quot;0 */6 * * *&quot; for every 6 hours)
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="discovery-enabled"
              checked={settings.discovery.enabled}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  discovery: { ...settings.discovery, enabled: checked },
                })
              }
            />
            <Label htmlFor="discovery-enabled">Enable automatic discovery</Label>
          </div>
        </CardContent>
      </Card>

      {/* AI Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">AI Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Default Provider</Label>
            <Select
              value={settings.ai.defaultProvider}
              onValueChange={(value) => {
                if (value === "openai" || value === "anthropic") {
                  setSettings({
                    ...settings,
                    ai: { ...settings.ai, defaultProvider: value },
                  });
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="analyst-model">Analyst Model</Label>
              <Input
                id="analyst-model"
                value={settings.ai.analystModel}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    ai: { ...settings.ai, analystModel: e.target.value },
                  })
                }
                placeholder="gpt-4"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gossip-model">Gossip Girl Model</Label>
              <Input
                id="gossip-model"
                value={settings.ai.gossipGirlModel}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    ai: { ...settings.ai, gossipGirlModel: e.target.value },
                  })
                }
                placeholder="gpt-4"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quality Thresholds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="min-confidence">
              Minimum Confidence for Publication
            </Label>
            <Input
              id="min-confidence"
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={settings.thresholds.minConfidenceForPublication}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  thresholds: {
                    ...settings.thresholds,
                    minConfidenceForPublication: parseFloat(e.target.value) || 0,
                  },
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Signals below this confidence won&apos;t be published (0.0 - 1.0)
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="min-quality">Minimum Quality Score</Label>
            <Input
              id="min-quality"
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={settings.thresholds.minQualityScore}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  thresholds: {
                    ...settings.thresholds,
                    minQualityScore: parseFloat(e.target.value) || 0,
                  },
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Minimum quality score for signal acceptance (0.0 - 1.0)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Feature Flags */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Feature Flags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="semantic-dedup"
              checked={settings.features.semanticDeduplication}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  features: { ...settings.features, semanticDeduplication: checked },
                })
              }
            />
            <Label htmlFor="semantic-dedup">Enable semantic deduplication</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="language-detection"
              checked={settings.features.languageDetection}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  features: { ...settings.features, languageDetection: checked },
                })
              }
            />
            <Label htmlFor="language-detection">Enable language detection</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="quality-gate"
              checked={settings.features.qualityGate}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  features: { ...settings.features, qualityGate: checked },
                })
              }
            />
            <Label htmlFor="quality-gate">Enable quality gate</Label>
          </div>
        </CardContent>
      </Card>

      {/* Rate Limiting */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rate Limiting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rpm">Requests Per Minute</Label>
            <Input
              id="rpm"
              type="number"
              min="1"
              value={settings.rateLimiting.requestsPerMinute}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  rateLimiting: {
                    ...settings.rateLimiting,
                    requestsPerMinute: parseInt(e.target.value) || 1,
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="burst">Burst Limit</Label>
            <Input
              id="burst"
              type="number"
              min="1"
              value={settings.rateLimiting.burstLimit}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  rateLimiting: {
                    ...settings.rateLimiting,
                    burstLimit: parseInt(e.target.value) || 1,
                  },
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Email Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Email Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="email-configured"
              checked={settings.email.configured}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  email: { ...settings.email, configured: checked },
                })
              }
            />
            <Label htmlFor="email-configured">Email is configured</Label>
          </div>
          {settings.email.configured && (
            <>
              <div className="space-y-2">
                <Label htmlFor="email-from">From Address</Label>
                <Input
                  id="email-from"
                  type="email"
                  value={settings.email.from || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      email: { ...settings.email, from: e.target.value },
                    })
                  }
                  placeholder="noreply@thetell.com"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtp-host">SMTP Host</Label>
                  <Input
                    id="smtp-host"
                    value={settings.email.smtpHost || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        email: { ...settings.email, smtpHost: e.target.value },
                      })
                    }
                    placeholder="smtp.example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">SMTP Port</Label>
                  <Input
                    id="smtp-port"
                    type="number"
                    value={settings.email.smtpPort || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        email: {
                          ...settings.email,
                          smtpPort: parseInt(e.target.value) || undefined,
                        },
                      })
                    }
                    placeholder="587"
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Correlation Engine */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Correlation Engine</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="correlation-enabled"
              checked={settings.correlation.enabled}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  correlation: { ...settings.correlation, enabled: checked },
                })
              }
            />
            <Label htmlFor="correlation-enabled">Enable correlation engine</Label>
          </div>
          {settings.correlation.enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="correlation-window">Lookback Window (days)</Label>
                <Input
                  id="correlation-window"
                  type="number"
                  min="1"
                  max="365"
                  value={settings.correlation.windowSize}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      correlation: {
                        ...settings.correlation,
                        windowSize: parseInt(e.target.value) || 30,
                      },
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  How many days of signals to consider for correlation analysis
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="correlation-min-signals">
                  Minimum Signals for Correlation
                </Label>
                <Input
                  id="correlation-min-signals"
                  type="number"
                  min="1"
                  max="100"
                  value={settings.correlation.minSignals}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      correlation: {
                        ...settings.correlation,
                        minSignals: parseInt(e.target.value) || 3,
                      },
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Minimum number of signals required to form a correlation
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="correlation-threshold">
                  Confidence Threshold
                </Label>
                <Input
                  id="correlation-threshold"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.correlation.confidenceThreshold}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      correlation: {
                        ...settings.correlation,
                        confidenceThreshold: parseFloat(e.target.value) || 0.6,
                      },
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Minimum confidence score for correlations to be considered (0.0 - 1.0)
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Calibration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Calibration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="calibration-enabled"
              checked={settings.calibration.enabled}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  calibration: { enabled: checked },
                })
              }
            />
            <Label htmlFor="calibration-enabled">
              Enable inference calibration
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            When enabled, the system tracks whether inferences were correct over time,
            allowing accuracy measurement and model improvement.
          </p>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex items-center justify-between">
        {saveMessage && (
          <p
            className={
              saveMessage.type === "success"
                ? "text-sm text-success"
                : "text-sm text-destructive"
            }
          >
            {saveMessage.text}
          </p>
        )}
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="ml-auto"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
