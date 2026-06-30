"use client";

import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

interface SafeMarkdownProps {
  content: string;
  className?: string;
}

export const SafeMarkdown = memo(function SafeMarkdown({
  content,
  className = "",
}: SafeMarkdownProps) {
  const plugins = useMemo(() => [rehypeSanitize], []);
  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown rehypePlugins={plugins}>{content}</ReactMarkdown>
    </div>
  );
});
