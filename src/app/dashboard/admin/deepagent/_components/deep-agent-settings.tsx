"use client";

/**
 * DeepAgent deployment settings component
 * 
 * Allows configuration of:
 * - Deployment mode (local vs managed)
 * - LangSmith API key for managed deployments
 * - Remote agent URL for LangGraph Platform
 */

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Settings, Save, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface DeploymentSettings {
  mode: "local" | "managed";
  remoteUrl: string;
  langsmithApiKey: string;
  langsmithProject: string;
}

export function DeepAgentSettings() {
  const [settings, setSettings] = useState<DeploymentSettings>({
    mode: "local",
    remoteUrl: "",
    langsmithApiKey: "",
    langsmithProject: "the-tell",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const response = await fetch("/api/v1/admin/deepagent/settings", {
credentials: "include", signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          setSettings(data.settings);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        logger.error("deepagent.settings_load_failed", { error: String(error) });
      }
    };

    loadSettings();
    return () => controllerRef.current?.abort();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/v1/admin/deepagent/settings", {
credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        toast.success("Settings saved", {
          description: "Deployment configuration updated successfully",
        });
      } else {
        throw new Error("Failed to save settings");
      }
    } catch (error) {
      toast.error("Error", {
        description: "Failed to save settings. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleModeChange = (mode: "local" | "managed") => {
    setSettings((prev) => ({ ...prev, mode }));
  };

  const isManaged = settings.mode === "managed";
  const isValid = isManaged
    ? settings.remoteUrl && settings.langsmithApiKey
    : true;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          <CardTitle>Deployment Settings</CardTitle>
        </div>
        <CardDescription>
          Configure how DeepAgent connects to the LLM backend
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Deployment Mode */}
        <div className="space-y-2">
          <Label htmlFor="mode">Deployment Mode</Label>
          <Select
            value={settings.mode}
            onValueChange={(value) => handleModeChange(value as "local" | "managed")}
          >
            <SelectTrigger id="mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local">
                <div className="flex items-center gap-2">
                  <span>Local</span>
                  <Badge variant="secondary" className="text-xs">
                    In-process
                  </Badge>
                </div>
              </SelectItem>
              <SelectItem value="managed">
                <div className="flex items-center gap-2">
                  <span>Managed</span>
                  <Badge variant="outline" className="text-xs">
                    LangGraph Platform
                  </Badge>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {isManaged
              ? "Connect to a remote LangGraph Platform deployment"
              : "Run DeepAgent locally within this application"}
          </p>
        </div>

        {/* Managed Mode Settings */}
        {isManaged && (
          <>
            <div className="space-y-2">
              <Label htmlFor="remoteUrl">Remote Agent URL</Label>
              <Input
                id="remoteUrl"
                type="url"
                placeholder="https://your-agent.langchain.app"
                value={settings.remoteUrl}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, remoteUrl: e.target.value }))
                }
              />
              <p className="text-sm text-muted-foreground">
                The URL of your LangGraph Platform deployment
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="langsmithApiKey">LangSmith API Key</Label>
              <Input
                id="langsmithApiKey"
                type="password"
                placeholder="lsv2_pt_..."
                value={settings.langsmithApiKey}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    langsmithApiKey: e.target.value,
                  }))
                }
              />
              <p className="text-sm text-muted-foreground">
                API key from LangSmith for authentication
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="langsmithProject">LangSmith Project</Label>
              <Input
                id="langsmithProject"
                placeholder="the-tell"
                value={settings.langsmithProject}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    langsmithProject: e.target.value,
                  }))
                }
              />
              <p className="text-sm text-muted-foreground">
                Project name for tracing in LangSmith
              </p>
            </div>
          </>
        )}

        {/* Status Indicator */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
          {isValid ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm">
                {isManaged ? "Managed deployment configured" : "Local mode ready"}
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <span className="text-sm">
                Please fill in all required fields
              </span>
            </>
          )}
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={isSaving || !isValid}
          className="w-full"
        >
          {isSaving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
