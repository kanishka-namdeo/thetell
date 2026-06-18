/**
 * Article markdown formatting and slug generation.
 * Translated from backend/app/articles/templates.py
 */

interface Citation {
  title: string;
  url: string;
  confidence: string;
}

interface FormatArticleParams {
  headline: string;
  summary: string;
  body: string;
  companyName: string;
  citations?: Citation[];
}

export function formatArticleMarkdown(params: FormatArticleParams): string {
  const { headline, summary, body, companyName, citations } = params;

  const parts: string[] = [
    `# ${headline}`,
    "",
    `**${companyName}**`,
    "",
    `*${summary}*`,
    "",
    "---",
    "",
    body,
  ];

  if (citations && citations.length > 0) {
    parts.push("");
    parts.push("---");
    parts.push("");
    parts.push("## Sources");
    parts.push("");

    citations.forEach((citation, i) => {
      const title = citation.title || "Untitled";
      const url = citation.url;
      const confidence = citation.confidence;

      if (url) {
        parts.push(`${i + 1}. [${title}](${url})`);
      } else {
        parts.push(`${i + 1}. ${title}`);
      }

      if (confidence) {
        parts.push(`   Confidence: ${confidence}`);
      }
    });
  }

  return parts.join("\n");
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[-\s]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
