"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  Database,
  GitBranch,
  Globe,
  Search,
  FileText,
  Terminal,
  Wrench,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

interface ToolCallCardProps {
  tool: string;
  input?: unknown;
  output?: unknown;
  success?: boolean;
  duration?: number;
  isResult?: boolean;
}

function ToolIcon({ toolName, className }: { toolName: string; className?: string }) {
  const lower = toolName.toLowerCase();
  
  if (lower.includes("prisma") || lower.includes("database")) {
    return <Database className={className} />;
  }
  if (lower.includes("github") || lower.includes("git")) {
    return <GitBranch className={className} />;
  }
  if (lower.includes("chrome") || lower.includes("browser") || lower.includes("web")) {
    return <Globe className={className} />;
  }
  if (lower.includes("search") || lower.includes("grep") || lower.includes("find")) {
    return <Search className={className} />;
  }
  if (lower.includes("file") || lower.includes("read") || lower.includes("write")) {
    return <FileText className={className} />;
  }
  if (lower.includes("shell") || lower.includes("bash") || lower.includes("exec") || lower.includes("command")) {
    return <Terminal className={className} />;
  }
  
  return <Wrench className={className} />;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isLargeContent(value: unknown): boolean {
  const str = typeof value === "string" ? value : formatJson(value);
  return str.length > 500;
}

function CollapsibleSection({
  label,
  content,
  defaultOpen,
}: {
  label: string;
  content: unknown;
  defaultOpen: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const text = typeof content === "string" ? content : formatJson(content);

  return (
    <div className="mt-2">
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {label}
        <CopyButton text={text} size="sm" />
      </button>
      {isOpen && (
        <pre className="mt-1.5 text-xs bg-muted/50 p-3 rounded-md overflow-x-auto border border-border/50 whitespace-pre-wrap break-words">
          {text}
        </pre>
      )}
    </div>
  );
}

function ShellOutput({ output }: { output: unknown }) {
  const text = typeof output === "string" ? output : formatJson(output);

  // Try to extract exit code from output
  const exitMatch = text.match(/exit[_\s]?code[:\s]*(\d+)/i);
  const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : null;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1.5">
        <span>Output</span>
        {exitCode !== null && (
          <Badge
            variant={exitCode === 0 ? "default" : "destructive"}
            className="text-[10px] h-4 px-1.5"
          >
            exit: {exitCode}
          </Badge>
        )}
        <CopyButton text={text} />
      </div>
      <pre className="text-xs bg-muted/50 p-3 rounded-md overflow-x-auto border border-border/50 whitespace-pre-wrap break-words font-mono">
        {text}
      </pre>
    </div>
  );
}

function FileReadOutput({ output }: { output: unknown }) {
  const text = typeof output === "string" ? output : formatJson(output);

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1.5">
        <span>Content</span>
        <CopyButton text={text} />
      </div>
      <pre className="text-xs bg-muted/50 p-3 rounded-md overflow-x-auto border border-border/50 whitespace-pre-wrap break-words font-mono max-h-[400px] overflow-y-auto">
        {text}
      </pre>
    </div>
  );
}

function isToolType(tool: string, types: string[]): boolean {
  const lower = tool.toLowerCase();
  return types.some((t) => lower.includes(t));
}

export function ToolCallCard({
  tool,
  input,
  output,
  success,
  duration,
  isResult = false,
}: ToolCallCardProps) {
  const isLargeInput = isLargeContent(input);
  const isLargeOutput = isLargeContent(output);

  const isShell = isToolType(tool, ["shell", "bash", "exec", "command"]);
  const isFileRead = isToolType(tool, ["read", "file_read", "cat"]);

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-1",
        isResult && success === false && "border-destructive/30 bg-destructive/5",
        isResult && success === true && "border-success/30 bg-success/5",
        !isResult && "border-border/50 bg-muted/20"
      )}
    >
      <div className="flex items-center gap-2">
        <ToolIcon toolName={tool} className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium font-mono truncate">
          {tool}
        </span>
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          {success !== undefined && (
            <>
              {success ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-destructive" />
              )}
            </>
          )}
          {duration !== undefined && duration > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {duration < 1000
                ? `${duration}ms`
                : `${(duration / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>
      </div>

      {input !== undefined &&
        input !== null &&
        !(typeof input === "object" && Object.keys(input as object).length === 0) && (
          <CollapsibleSection
            label="Input"
            content={input}
            defaultOpen={!isLargeInput}
          />
        )}

      {isResult && output !== undefined && output !== null && (
        <>
          {isShell ? (
            <ShellOutput output={output} />
          ) : isFileRead ? (
            <FileReadOutput output={output} />
          ) : (
            <CollapsibleSection
              label="Output"
              content={output}
              defaultOpen={!isLargeOutput}
            />
          )}
        </>
      )}
    </div>
  );
}
