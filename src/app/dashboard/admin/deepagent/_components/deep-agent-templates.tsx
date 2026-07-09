"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Edit2, Save, X, Loader2 } from "lucide-react";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

interface DeepAgentTemplate {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  model: string;
  initialContext?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface DeepAgentTemplatesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadTemplate?: (template: DeepAgentTemplate) => void;
}

export function DeepAgentTemplates({
  open,
  onOpenChange,
  onLoadTemplate,
}: DeepAgentTemplatesProps) {
  const [templates, setTemplates] = useState<DeepAgentTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("");

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/v1/admin/deepagent/templates");
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.data);
      } else {
        throw new Error("Failed to load templates");
      }
    } catch (error) {
      logger.error("deepagent.templates.load_failed", { error: String(error) });
      toast.error("Failed to load templates");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadTemplates();
    }
  }, [open]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setSystemPrompt("");
    setModel("");
    setEditingId(null);
    setIsCreating(false);
  };

  const handleCreate = () => {
    resetForm();
    setIsCreating(true);
  };

  const handleEdit = (template: DeepAgentTemplate) => {
    setName(template.name);
    setDescription(template.description || "");
    setSystemPrompt(template.systemPrompt);
    setModel(template.model);
    setEditingId(template.id);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!name.trim() || !systemPrompt.trim() || !model.trim()) {
      toast.error("Name, system prompt, and model are required");
      return;
    }

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        systemPrompt: systemPrompt.trim(),
        model: model.trim(),
      };

      const url = editingId
        ? `/api/v1/admin/deepagent/templates/${editingId}`
        : "/api/v1/admin/deepagent/templates";

      const method = editingId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast.success(editingId ? "Template updated" : "Template created");
        resetForm();
        loadTemplates();
      } else {
        const error = await response.json();
        throw new Error(error.message || "Failed to save template");
      }
    } catch (error) {
      logger.error("deepagent.templates.save_failed", { error: String(error) });
      toast.error("Failed to save template");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;

    try {
      const response = await fetch(`/api/v1/admin/deepagent/templates/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Template deleted");
        loadTemplates();
      } else {
        throw new Error("Failed to delete template");
      }
    } catch (error) {
      logger.error("deepagent.templates.delete_failed", {
        error: String(error),
      });
      toast.error("Failed to delete template");
    }
  };

  const handleLoad = (template: DeepAgentTemplate) => {
    onLoadTemplate?.(template);
    onOpenChange(false);
  };

  const isFormVisible = isCreating || editingId !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Session Templates</DialogTitle>
          <DialogDescription>
            Save and reuse session configurations with predefined prompts and
            settings
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          {!isFormVisible && (
            <Button onClick={handleCreate} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          )}
          {isFormVisible && (
            <Button onClick={resetForm} variant="ghost" size="sm">
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}
        </div>

        {isFormVisible && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">Name *</Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Code Review Assistant"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-description">Description</Label>
                <Input
                  id="template-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of this template's purpose"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-model">Model *</Label>
                <Input
                  id="template-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g., gpt-4-turbo, claude-3-opus"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-prompt">System Prompt *</Label>
                <Textarea
                  id="template-prompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Enter the system prompt that will guide the agent's behavior..."
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {editingId ? "Update" : "Create"} Template
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No templates yet. Create one to get started.
              </div>
            ) : (
              <div className="grid gap-3">
                {templates.map((template) => (
                  <Card key={template.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{template.name}</h3>
                            <Badge variant="secondary" className="text-xs">
                              {template.model}
                            </Badge>
                          </div>
                          {template.description && (
                            <p className="text-sm text-muted-foreground">
                              {template.description}
                            </p>
                          )}
                          <div className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded">
                            {template.systemPrompt.length > 150
                              ? template.systemPrompt.substring(0, 150) + "..."
                              : template.systemPrompt}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleLoad(template)}
                          >
                            Load
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(template)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(template.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
