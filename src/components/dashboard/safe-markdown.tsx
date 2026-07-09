"use client";

import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

interface SafeMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Fix malformed markdown that LLMs often produce:
 * - Headers without blank lines before/after
 * - Headers concatenated with content (## HeaderContent)
 */
function fixMalformedMarkdown(text: string): string {
  if (!text) return text;
  let result = text;

  // Fix headers with content glued on the same line
  result = result.replace(/^(##\s+[^\n#]+?)([A-Za-z0-9])/gm, "$1\n$2");

  // Ensure blank line before headers
  result = result.replace(/([^\n])\n?(##\s+)/gm, "$1\n\n$2");

  // Ensure blank line after headers
  result = result.replace(/^(##\s+[^\n]+)\n([^\n#])/gm, "$1\n\n$2");

  return result;
}

export const SafeMarkdown = memo(function SafeMarkdown({
  content,
  className = "",
}: SafeMarkdownProps) {
  const plugins = useMemo(() => [rehypeSanitize], []);
  const fixedContent = useMemo(() => fixMalformedMarkdown(content), [content]);
  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown rehypePlugins={plugins}>{fixedContent}</ReactMarkdown>
    </div>
  );
});
