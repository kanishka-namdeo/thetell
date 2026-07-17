"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ModerationSettingsClient() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const saveMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const [enabled, setEnabled] = useState(false);
  const [autoApproveThreshold, setAutoApproveThreshold] = useState<number | "">("");
  const [autoApproveSources, setAutoApproveSources] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [notifyOnNewContent, setNotifyOnNewContent] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchSettings = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    try {
      const response = await fetch("/api/v1/admin/moderation/settings", {
credentials: "include",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Failed to fetch settings");

      const data = await response.json();
      setEnabled(data.enabled);
      setAutoApproveThreshold(data.autoApproveConfidenceThreshold ?? "");
      setAutoApproveSources(
        Array.isArray(data.autoApproveSources)
          ? data.autoApproveSources.join(", ")
          : ""
      );
      setNotificationEmail(data.notificationEmail ?? "");
      setNotifyOnNewContent(data.notifyOnNewContent);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      toast.error("Failed to load moderation settings");
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
      mountedRef.current = false;
      if (saveMessageTimerRef.current) clearTimeout(saveMessageTimerRef.current);
    };
  }, []);

  async function handleSave() {
    if (!mountedRef.current) return;
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const payload = {
        enabled,
        autoApproveConfidenceThreshold:
          autoApproveThreshold === "" ? null : Number(autoApproveThreshold),
        autoApproveSources: autoApproveSources
          ? autoApproveSources.split(",").map((s) => s.trim()).filter(Boolean)
          : null,
        notificationEmail: notificationEmail || null,
        notifyOnNewContent,
      };

      const response = await fetch("/api/v1/admin/moderation/settings", {
credentials: "include",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save settings");
      }

      if (!mountedRef.current) return;
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
      if (mountedRef.current) {
        setIsSaving(false);
      }
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="text-lg">Moderation Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Enable Moderation</label>
              <p className="text-xs text-muted-foreground">
                Require admin approval before publishing content
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Auto-Approve Confidence Threshold
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Automatically approve content with confidence above this threshold
              (0.0-1.0)
            </p>
            <Input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={autoApproveThreshold}
              onChange={(e) => {
                const value = e.target.value;
                setAutoApproveThreshold(value === "" ? "" : Number(value));
              }}
              placeholder="e.g., 0.8"
              className="max-w-[200px]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Auto-Approve Sources</label>
            <p className="text-xs text-muted-foreground mb-2">
              Automatically approve content from these source types
              (comma-separated)
            </p>
            <Input
              value={autoApproveSources}
              onChange={(e) => setAutoApproveSources(e.target.value)}
              placeholder="e.g., NEWS, FILING, TRANSCRIPT"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="text-lg">Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">
                Notify on New Content
              </label>
              <p className="text-xs text-muted-foreground">
                Send notifications when new content requires review
              </p>
            </div>
            <Switch
              checked={notifyOnNewContent}
              onCheckedChange={setNotifyOnNewContent}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Notification Email</label>
            <p className="text-xs text-muted-foreground mb-2">
              Email address to receive moderation notifications
            </p>
            <Input
              type="email"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              placeholder="admin@example.com"
              className="max-w-[400px]"
            />
          </div>
        </CardContent>
      </Card>

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
        <Button onClick={handleSave} disabled={isSaving} className="ml-auto">
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
