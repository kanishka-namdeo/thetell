"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeepAgentFileAttachment, DeepAgentFileAttachmentType } from "@/lib/deepagent/types";

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const ACCEPTED_TEXT_TYPES = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/xml",
];
const ACCEPTED_PDF_TYPES = ["application/pdf"];

const ALL_ACCEPTED = [
  ...ACCEPTED_IMAGE_TYPES,
  ...ACCEPTED_TEXT_TYPES,
  ...ACCEPTED_PDF_TYPES,
].join(",");

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function getFileAttachmentType(mimeType: string): DeepAgentFileAttachmentType {
  if (ACCEPTED_IMAGE_TYPES.includes(mimeType)) return "image";
  if (ACCEPTED_PDF_TYPES.includes(mimeType)) return "pdf";
  return "text";
}

interface DeepAgentFileUploadProps {
  files: DeepAgentFileAttachment[];
  onFilesChange: (files: DeepAgentFileAttachment[]) => void;
  disabled?: boolean;
  className?: string;
}

export function DeepAgentFileUpload({
  files,
  onFilesChange,
  disabled,
  className,
}: DeepAgentFileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File): Promise<DeepAgentFileAttachment | null> => {
      if (file.size > MAX_FILE_SIZE) {
        setError(`File "${file.name}" exceeds 10MB limit`);
        return null;
      }

      const mimeType = file.type || "text/plain";
      const attachmentType = getFileAttachmentType(mimeType);
      const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (attachmentType === "image") {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(",")[1] || "";
            resolve({
              id,
              name: file.name,
              type: attachmentType,
              mimeType,
              size: file.size,
              data: base64,
              previewUrl: reader.result as string,
            });
          };
          reader.onerror = () => {
            setError(`Failed to read "${file.name}"`);
            resolve(null);
          };
          reader.readAsDataURL(file);
        });
      }

      if (attachmentType === "text") {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              id,
              name: file.name,
              type: attachmentType,
              mimeType,
              size: file.size,
              data: reader.result as string,
            });
          };
          reader.onerror = () => {
            setError(`Failed to read "${file.name}"`);
            resolve(null);
          };
          reader.readAsText(file);
        });
      }

      // PDF: store as base64
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1] || "";
          resolve({
            id,
            name: file.name,
            type: attachmentType,
            mimeType,
            size: file.size,
            data: base64,
          });
        };
        reader.onerror = () => {
          setError(`Failed to read "${file.name}"`);
          resolve(null);
        };
        reader.readAsDataURL(file);
      });
    },
    []
  );

  const handleFiles = useCallback(
    async (fileList: FileList) => {
      setError(null);
      const newFiles: DeepAgentFileAttachment[] = [];

      for (const file of Array.from(fileList)) {
        const attachment = await processFile(file);
        if (attachment) {
          newFiles.push(attachment);
        }
      }

      if (newFiles.length > 0) {
        onFilesChange([...files, ...newFiles]);
      }
    },
    [files, onFilesChange, processFile]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (id: string) => {
    const file = files.find((f) => f.id === id);
    if (file?.previewUrl) {
      URL.revokeObjectURL(file.previewUrl);
    }
    onFilesChange(files.filter((f) => f.id !== id));
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Upload button / drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative",
          isDragOver && "ring-2 ring-primary ring-offset-2 rounded-lg"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ALL_ACCEPTED}
          onChange={(e) => {
            if (e.target.files) {
              handleFiles(e.target.files);
              e.target.value = "";
            }
          }}
          className="hidden"
          disabled={disabled}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="h-8 gap-1.5 text-xs text-muted-foreground"
          aria-label="Attach files"
        >
          <Paperclip className="h-3.5 w-3.5" />
          <span>Attach</span>
        </Button>
      </div>

      {/* Error message */}
      {error && (
        <div className="text-xs text-destructive px-1">{error}</div>
      )}

      {/* File previews */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="group relative flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2 py-1.5 max-w-[200px]"
            >
              {file.type === "image" && file.previewUrl ? (
                <img
                  src={file.previewUrl}
                  alt={file.name}
                  className="h-8 w-8 rounded object-cover shrink-0"
                />
              ) : file.type === "pdf" ? (
                <FileText className="h-6 w-6 text-destructive/70 shrink-0" />
              ) : (
                <FileText className="h-6 w-6 text-muted-foreground shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{file.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {file.size < 1024
                    ? `${file.size}B`
                    : file.size < 1024 * 1024
                      ? `${(file.size / 1024).toFixed(1)}KB`
                      : `${(file.size / (1024 * 1024)).toFixed(1)}MB`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeFile(file.id)}
                className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
