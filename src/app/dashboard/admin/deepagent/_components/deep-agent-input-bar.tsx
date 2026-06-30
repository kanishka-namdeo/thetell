"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeepAgentFileUpload } from "./deep-agent-file-upload";
import type { DeepAgentFileAttachment } from "@/lib/deepagent/types";

interface DeepAgentInputBarProps {
  onSend: (message: string, files?: DeepAgentFileAttachment[]) => void;
  onStop?: () => void;
  isRunning?: boolean;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function DeepAgentInputBar({
  onSend,
  onStop,
  isRunning,
  isStreaming,
  disabled,
  placeholder = "Ask DeepAgent anything about the codebase...",
  className,
}: DeepAgentInputBarProps) {
  const running = isRunning ?? isStreaming ?? false;
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<DeepAgentFileAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

  const handleSend = useCallback(() => {
    if ((!message.trim() && files.length === 0) || disabled) return;
    onSend(message.trim(), files.length > 0 ? files : undefined);
    setMessage("");
    setFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [message, files, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "border-t border-border bg-background p-2 sm:p-4 relative shrink-0",
        className
      )}
    >
      <div className="flex gap-2 items-end relative">
        <div className="flex-1 relative space-y-2">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="min-h-[44px] max-h-[200px] resize-none w-full text-sm sm:text-base"
            rows={1}
          />
          {/* File upload button and previews */}
          <DeepAgentFileUpload
            files={files}
            onFilesChange={setFiles}
            disabled={disabled}
          />
        </div>
        {running ? (
          <Button
            variant="destructive"
            size="icon"
            onClick={onStop}
            className="shrink-0"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={handleSend}
            disabled={(!message.trim() && files.length === 0) || disabled}
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="mt-2 text-xs text-muted-foreground hidden sm:block">
        Press <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border">Enter</kbd> to send,{" "}
        <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border">Shift+Enter</kbd> for new line
      </div>
    </div>
  );
}
