"use client";

import { useState } from "react";
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
  Maximize2,
  Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { Highlight, themes } from "prism-react-renderer";

interface DeepAgentToolCallCardProps {
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
    const result = JSON.stringify(value, null, 2);
    return result ?? String(value);
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
      <div className="flex items-center gap-1.5">
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
        </button>
        <CopyButton text={text} size="sm" />
      </div>
      {isOpen && <SyntaxHighlightedBlock content={text} maxHeight={15} />}
    </div>
  );
}

function detectLanguage(content: string): string {
  const trimmed = content.trim();

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // Not valid JSON
    }
  }

  if (
    trimmed.includes("import ") ||
    trimmed.includes("export ") ||
    trimmed.includes("function ") ||
    trimmed.includes("const ") ||
    trimmed.includes("interface ") ||
    trimmed.includes("type ") ||
    trimmed.includes("async ") ||
    trimmed.includes("=>")
  ) {
    return "tsx";
  }

  if (
    trimmed.toLowerCase().includes("select ") ||
    trimmed.toLowerCase().includes("from ") ||
    trimmed.toLowerCase().includes("where ") ||
    trimmed.toLowerCase().includes("insert into") ||
    trimmed.toLowerCase().includes("update ") ||
    trimmed.toLowerCase().includes("delete from")
  ) {
    return "sql";
  }

  if (
    trimmed.startsWith("$ ") ||
    trimmed.includes("npm ") ||
    trimmed.includes("pnpm ") ||
    trimmed.includes("git ") ||
    trimmed.includes("docker ") ||
    trimmed.includes("echo ") ||
    trimmed.includes("cd ") ||
    trimmed.includes("mkdir ") ||
    trimmed.includes("rm ")
  ) {
    return "bash";
  }

  if (trimmed.startsWith("<") && trimmed.includes(">")) {
    return "markup";
  }

  return "plaintext";
}

function SyntaxHighlightedBlock({
  content,
  maxHeight,
}: {
  content: string;
  maxHeight?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const language = detectLanguage(content);
  const lineCount = content.split("\n").length;
  const shouldTruncate = !isExpanded && maxHeight && lineCount > maxHeight;

  const displayContent = shouldTruncate
    ? content.split("\n").slice(0, maxHeight).join("\n") + "\n..."
    : content;

  return (
    <div className="mt-1.5">
      <Highlight theme={themes.vsDark} code={displayContent} language={language as "json" | "tsx" | "sql" | "bash" | "markup" | "plaintext"}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <div className="relative">
            <pre
              className={cn(
                className,
                "text-xs rounded-md overflow-x-auto border border-border/50 p-3 bg-muted/30",
                "font-mono leading-relaxed"
              )}
              style={{
                ...style,
                background: "transparent",
              }}
            >
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  <span className="inline-block w-8 text-right mr-3 text-muted-foreground/50 select-none text-[10px]">
                    {i + 1}
                  </span>
                  <span>
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </span>
                </div>
              ))}
            </pre>
            {shouldTruncate && (
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2 py-1 bg-background/90 border border-border rounded text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
              >
                <Maximize2 className="h-3 w-3" />
                Show all {lineCount} lines
              </button>
            )}
            {isExpanded && (
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2 py-1 bg-background/90 border border-border rounded text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
              >
                <Minimize2 className="h-3 w-3" />
                Collapse
              </button>
            )}
          </div>
        )}
      </Highlight>
    </div>
  );
}

export function DeepAgentToolCallCard({
  tool,
  input,
  output,
  success,
  duration,
  isResult = false,
}: DeepAgentToolCallCardProps) {
  const isLargeInput = isLargeContent(input);
  const isLargeOutput = isLargeContent(output);

  return (
    <div
      className={cn(
        "rounded-lg border p-2 sm:p-3 space-y-1",
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
        <CollapsibleSection
          label="Output"
          content={output}
          defaultOpen={!isLargeOutput}
        />
      )}
    </div>
  );
}
