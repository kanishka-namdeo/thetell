"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface Settings {
  emailAlerts: boolean;
  highConfidenceAlerts: boolean;
  confidenceThreshold: number;
}

const defaultSettings: Settings = {
  emailAlerts: false,
  highConfidenceAlerts: true,
  confidenceThreshold: 0.7,
};

function getInitialSettings(): Settings {
  if (typeof window === "undefined") return defaultSettings;
  const saved = localStorage.getItem("user-settings");
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return defaultSettings;
    }
  }
  return defaultSettings;
}

export function SettingsSection() {
  const [settings, setSettings] = useState<Settings>(getInitialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSave = () => {
    setIsSaving(true);
    setMessage(null);

    try {
      localStorage.setItem("user-settings", JSON.stringify(settings));
      setMessage("Settings saved successfully");
    } catch {
      setMessage("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Separator />

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-alerts">Email Alerts</Label>
              <p className="text-sm text-muted-foreground font-body">
                Receive email notifications for new signals and analyses
              </p>
            </div>
            <Switch
              id="email-alerts"
              checked={settings.emailAlerts}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, emailAlerts: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="high-confidence-alerts">High-Confidence Alerts</Label>
              <p className="text-sm text-muted-foreground font-body">
                Get notified when high-confidence inferences are detected
              </p>
            </div>
            <Switch
              id="high-confidence-alerts"
              checked={settings.highConfidenceAlerts}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, highConfidenceAlerts: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Analysis Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Analysis Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label>Confidence Threshold</Label>
              <p className="text-sm text-muted-foreground font-body mt-1 mb-4">
                Minimum confidence level for inferences to be highlighted
              </p>
            </div>
            <div className="space-y-2">
              <Slider
                value={[settings.confidenceThreshold]}
                onValueChange={(value) => {
                  const newValue = Array.isArray(value) ? value[0] : value;
                  setSettings({ ...settings, confidenceThreshold: newValue as number });
                }}
                min={0}
                max={1}
                step={0.05}
                className="w-full"
              />
              <div className="flex items-center justify-between text-sm font-mono">
                <span className="text-muted-foreground">0.0</span>
                <span className="font-semibold">
                  {Math.round(settings.confidenceThreshold * 100)}%
                </span>
                <span className="text-muted-foreground">1.0</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
        {message && (
          <p className="text-sm text-success">{message}</p>
        )}
      </div>
    </>
  );
}
