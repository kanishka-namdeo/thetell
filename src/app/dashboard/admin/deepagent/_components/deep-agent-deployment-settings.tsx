"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Server, Laptop, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DeploymentConfig {
  mode: "local" | "managed";
  remoteUrl: string;
  langsmithApiKey: string;
}

interface DeepAgentDeploymentSettingsProps {
  config: DeploymentConfig;
  onConfigChange: (config: DeploymentConfig) => void;
  className?: string;
}

const STORAGE_KEY = "deepagent-deployment-config";

export function loadDeploymentConfig(): DeploymentConfig {
  if (typeof window === "undefined") {
    return { mode: "local", remoteUrl: "", langsmithApiKey: "" };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return { mode: "local", remoteUrl: "", langsmithApiKey: "" };
}

export function saveDeploymentConfig(config: DeploymentConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage errors
  }
}

export function DeepAgentDeploymentSettings({
  config,
  onConfigChange,
  className,
}: DeepAgentDeploymentSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localConfig, setLocalConfig] = useState<DeploymentConfig>(config);

  const handleOpen = () => {
    setLocalConfig(config);
    setIsOpen(true);
  };

  const handleSave = () => {
    onConfigChange(localConfig);
    saveDeploymentConfig(localConfig);
    setIsOpen(false);
  };

  const isManaged = localConfig.mode === "managed";
  const isValid = isManaged
    ? !!(localConfig.remoteUrl && localConfig.langsmithApiKey)
    : true;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleOpen}
        className={cn("h-8", className)}
        title="Deployment settings"
      >
        <Settings className="h-3.5 w-3.5 sm:mr-1.5" />
        <span className="hidden sm:inline">Deploy</span>
        {config.mode === "managed" && (
          <Badge variant="secondary" className="ml-1 hidden lg:inline-flex text-xs">
            Remote
          </Badge>
        )}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Deployment Settings
            </DialogTitle>
            <DialogDescription>
              Configure how DeepAgent connects to the LLM backend
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Deployment Mode */}
            <div className="space-y-2">
              <Label>Deployment Mode</Label>
              <Select
                value={localConfig.mode}
                onValueChange={(value) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    mode: value as "local" | "managed",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">
                    <div className="flex items-center gap-2">
                      <Laptop className="h-4 w-4" />
                      <span>Local</span>
                      <Badge variant="secondary" className="text-xs">
                        In-process
                      </Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="managed">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4" />
                      <span>Managed</span>
                      <Badge variant="outline" className="text-xs">
                        LangGraph Platform
                      </Badge>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
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
                    value={localConfig.remoteUrl}
                    onChange={(e) =>
                      setLocalConfig((prev) => ({
                        ...prev,
                        remoteUrl: e.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    The URL of your LangGraph Platform deployment
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="langsmithApiKey">LangSmith API Key</Label>
                  <Input
                    id="langsmithApiKey"
                    type="password"
                    placeholder="lsv2_pt_..."
                    value={localConfig.langsmithApiKey}
                    onChange={(e) =>
                      setLocalConfig((prev) => ({
                        ...prev,
                        langsmithApiKey: e.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    API key from LangSmith for authentication
                  </p>
                </div>
              </>
            )}

            {/* Local Mode Info */}
            {!isManaged && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-start gap-2">
                  <Laptop className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">Local Mode</p>
                    <p>
                      DeepAgent runs in-process using the configured model from environment variables.
                      No external connection required.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Status Indicator */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
              {isValid ? (
                <>
                  <CheckCircle className="h-4 w-4 text-success" />
                  <span className="text-sm">
                    {isManaged ? "Managed deployment configured" : "Local mode ready"}
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-warning" />
                  <span className="text-sm">Please fill in all required fields</span>
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!isValid}>
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
