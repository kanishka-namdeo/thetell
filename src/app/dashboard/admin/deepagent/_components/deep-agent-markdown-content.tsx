"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import { CopyButton } from "./copy-button";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface DeepAgentMarkdownContentProps {
  content: string;
  className?: string;
}

const components: Components = {
  code({ className, children, ...props }) {
    const isInline = !className;

    if (isInline) {
      return (
        <code
          className="rounded-sm bg-muted px-1 py-0.5 text-xs sm:text-sm font-mono"
          {...props}
        >
          {children}
        </code>
      );
    }
    const textContent = extractText(children);
    return (
      <div className="relative group">
        <CopyButton
          text={textContent}
          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        />
        <code className={cn(className, "text-xs sm:text-sm")} {...props}>
          {children}
        </code>
      </div>
    );
  },
  pre({ children }) {
    return (
      <pre className="rounded-lg bg-muted p-2 sm:p-4 overflow-x-auto text-xs sm:text-sm my-2 sm:my-3">
        {children}
      </pre>
    );
  },
  table({ children }) {
    return (
      <div className="my-2 sm:my-4 overflow-x-auto">
        <table className="min-w-full border border-border rounded-lg text-xs sm:text-sm">
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-muted">{children}</thead>;
  },
  th({ children }) {
    return (
      <th className="border border-border px-3 py-2 text-left font-semibold">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="border border-border px-3 py-2">{children}</td>;
  },
  a({ children, href }) {
    return (
      <a
        href={href}
        className="text-primary underline underline-offset-2 hover:text-primary/80"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },
  ul({ children }) {
    return <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>;
  },
  ol({ children }) {
    return (
      <ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>
    );
  },
  li({ children }) {
    return <li>{children}</li>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-4 border-primary/30 pl-4 my-3 italic text-muted-foreground">
        {children}
      </blockquote>
    );
  },
  hr() {
    return <hr className="my-4 border-border" />;
  },
  h1({ children }) {
    return <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="text-lg font-semibold mt-3 mb-2">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="text-base font-semibold mt-3 mb-1">{children}</h3>;
  },
  p({ children }) {
    return <p className="my-2 leading-relaxed">{children}</p>;
  },
};

function extractText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return extractText((children as { props?: { children?: React.ReactNode } }).props?.children);
  }
  return "";
}

export function DeepAgentMarkdownContent({ content, className }: DeepAgentMarkdownContentProps) {
  // Handle empty content
  if (!content || content.length === 0) {
    return null;
  }
  
  try {
    return (
      <div className={cn("prose-compact text-sm text-foreground", className)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  } catch (error) {
    logger.error("deepagent.markdown_render_error", { error: String(error) });
    // Fallback to plain text
    return (
      <div className={cn("text-sm text-foreground whitespace-pre-wrap", className)}>
        {content}
      </div>
    );
  }
}
