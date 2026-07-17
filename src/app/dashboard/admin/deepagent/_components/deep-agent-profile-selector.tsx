"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings2, Loader2, Shield } from "lucide-react";
import { logger } from "@/lib/logger";

interface HarnessProfile {
  id: string;
  name: string;
  description: string;
  provider: string;
  excludedTools: string[];
  toolDescriptionOverrides: Record<string, string>;
  builtIn: boolean;
  systemPromptAdditions?: string;
}

interface DeepAgentProfileSelectorProps {
  className?: string;
}

export function DeepAgentProfileSelector({ className }: DeepAgentProfileSelectorProps) {
  const [profiles, setProfiles] = useState<HarnessProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("default");
  const [isLoading, setIsLoading] = useState(true);
  const controllerRef = useRef<AbortController | null>(null);

  const loadProfiles = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const res = await fetch("/api/v1/admin/deepagent/profiles", {
credentials: "include", signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.data);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      logger.error("deepagent.profiles_load_failed", { error: String(error) });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfiles();
    return () => controllerRef.current?.abort();
  }, [loadProfiles]);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          <CardTitle className="text-base">Harness Profile</CardTitle>
        </div>
        <CardDescription>
          Select a profile to tune the agent for a specific model or use case.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={selectedProfileId} onValueChange={(value) => value && setSelectedProfileId(value)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a profile" />
          </SelectTrigger>
          <SelectContent>
            {profiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                <div className="flex items-center gap-2">
                  <span>{profile.name}</span>
                  {profile.builtIn && (
                    <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                      Built-in
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedProfile && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {selectedProfile.description}
            </p>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Provider:</span>
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {selectedProfile.provider}
              </Badge>
            </div>

            {selectedProfile.excludedTools.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Shield className="h-3.5 w-3.5" />
                  <span>Excluded tools:</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedProfile.excludedTools.map((tool) => (
                    <Badge
                      key={tool}
                      variant="destructive"
                      className="text-[10px] h-4 px-1.5 bg-destructive/10 text-destructive border-destructive/20"
                    >
                      {tool}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(selectedProfile.toolDescriptionOverrides).length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">
                  Tool overrides:
                </span>
                <div className="space-y-1">
                  {Object.entries(selectedProfile.toolDescriptionOverrides).map(
                    ([tool, desc]) => (
                      <div
                        key={tool}
                        className="text-xs bg-muted/50 rounded px-2 py-1"
                      >
                        <span className="font-mono font-medium">{tool}</span>
                        <span className="text-muted-foreground ml-1">
                          — {desc}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
