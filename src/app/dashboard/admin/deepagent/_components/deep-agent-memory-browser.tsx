"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText,
  RefreshCw,
  Save,
  Trash2,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { DeepAgentMemorySearch } from "./deep-agent-memory-search";

export function DeepAgentMemoryBrowser({ className }: { className?: string }) {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  const loadFiles = async () => {
    setIsLoading(true);
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const res = await fetch("/api/v1/admin/deepagent/memories", {
credentials: "include", signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        setFiles(data.data);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      logger.error("deepagent.memory_files_load_failed", { error: String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const loadFileContent = async (filename: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const res = await fetch(
        `/api/v1/admin/deepagent/memories?file=${encodeURIComponent(filename)}`,
        {
credentials: "include", signal: controller.signal }
      );
      if (res.ok) {
        const data = await res.json();
        setFileContent(data.data.content);
        setEditContent(data.data.content);
        setSelectedFile(filename);
        setIsEditing(false);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      logger.error("deepagent.file_content_load_failed", { filename, error: String(error) });
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    try {
      const res = await fetch("/api/v1/admin/deepagent/memories", {
credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: selectedFile, content: editContent }),
      });
      if (res.ok) {
        setFileContent(editContent);
        setIsEditing(false);
      }
    } catch (error) {
      logger.error("deepagent.file_save_failed", { file: selectedFile, error: String(error) });
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete memory file "${filename}"?`)) return;
    try {
      const res = await fetch(
        `/api/v1/admin/deepagent/memories?file=${encodeURIComponent(filename)}`,
        {
credentials: "include", method: "DELETE" }
      );
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f !== filename));
        if (selectedFile === filename) {
          setSelectedFile(null);
          setFileContent("");
          setEditContent("");
        }
      }
    } catch (error) {
      logger.error("deepagent.file_delete_failed", { filename, error: String(error) });
    }
  };

  const handleSearchSelect = (filename: string) => {
    loadFileContent(filename);
    setShowSearch(false);
  };

  const handleCreateNew = async () => {
    const filename = prompt("Enter filename (e.g., preferences.md):");
    if (!filename) return;

    try {
      const res = await fetch("/api/v1/admin/deepagent/memories", {
credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: filename, content: "" }),
      });
      if (res.ok) {
        await loadFiles();
        await loadFileContent(filename);
        setIsEditing(true);
      }
    } catch (error) {
      logger.error("deepagent.file_create_failed", { filename, error: String(error) });
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFiles();
    return () => controllerRef.current?.abort();
  }, []);

  if (isCollapsed) {
    return (
      <div className={cn("border-t border-border bg-card", className)}>
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
          <FileText className="h-4 w-4" />
          <span>Memory Files ({files.length})</span>
        </button>
      </div>
    );
  }

  return (
    <div className={cn("border-t border-border bg-card flex flex-col", className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex-1"
        >
          <ChevronDown className="h-4 w-4" />
          <FileText className="h-4 w-4" />
          <span>Memory Files</span>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
            {files.length}
          </Badge>
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCreateNew}
          className="h-7 w-7 p-0"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowSearch(!showSearch)}
          className={cn("h-7 w-7 p-0", showSearch && "bg-accent")}
          aria-label="Toggle search"
        >
          <Search className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadFiles}
          disabled={isLoading}
          className="h-7 w-7 p-0"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>
      </div>

      {showSearch && (
        <div className="px-3 py-2 border-b border-border">
          <DeepAgentMemorySearch onFileSelect={handleSearchSelect} />
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* File list */}
        <div className="w-48 border-r border-border">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-1">
              {files.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-4">
                  No memory files
                </div>
              ) : (
                files.map((filename) => (
                  <div
                    key={filename}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer hover:bg-accent transition-colors",
                      selectedFile === filename && "bg-accent border border-border"
                    )}
                    onClick={() => loadFileContent(filename)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        loadFileContent(filename);
                      }
                    }}
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate font-mono">{filename}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(filename);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* File content */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedFile ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a file to view
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <span className="text-sm font-mono font-medium flex-1 truncate">
                  {selectedFile}
                </span>
                {!isEditing ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    className="h-7 text-xs"
                  >
                    Edit
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditContent(fileContent);
                        setIsEditing(false);
                      }}
                      className="h-7 text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      className="h-7 text-xs"
                    >
                      <Save className="h-3.5 w-3.5 mr-1" />
                      Save
                    </Button>
                  </>
                )}
              </div>
              <ScrollArea className="flex-1">
                {isEditing ? (
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="min-h-[300px] font-mono text-xs resize-none border-0 rounded-none"
                  />
                ) : (
                  <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words text-foreground">
                    {fileContent || "(empty)"}
                  </pre>
                )}
              </ScrollArea>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
