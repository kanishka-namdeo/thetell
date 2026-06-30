import { Badge } from "@/components/ui/badge";

interface EntityTagsProps {
  analyses?: Array<{
    keyFacts?: unknown;
    strategicThemes?: unknown;
  }>;
  maxVisible?: number;
}

type FactLike = {
  entities?: unknown;
  entity?: string;
  fact?: string;
  text?: string;
  who?: string;
  organization?: string;
  company?: string;
};

type ThemeLike = {
  label?: string;
  name?: string;
  theme?: string;
};

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "in",
  "to",
  "for",
  "on",
  "with",
  "by",
  "from",
  "is",
  "are",
  "was",
  "were",
  "at",
  "as",
  "it",
  "its",
  "this",
  "that",
  "over",
  "under",
  "into",
  "after",
  "before",
  "amid",
  "amidst",
  "amid",
]);

function isCapitalizedPhrase(s: string): boolean {
  if (!s || s.length < 2) return false;
  // Must start with uppercase letter
  if (!/^[A-Z]/.test(s)) return false;
  // Reject all-caps acronyms < 2 chars or pure numbers
  if (/^\d+$/.test(s)) return false;
  return true;
}

function extractFromFacts(keyFacts: unknown, out: Set<string>): void {
  if (!Array.isArray(keyFacts)) return;
  for (const raw of keyFacts) {
    if (!raw || typeof raw !== "object") continue;
    const fact = raw as FactLike;

    // Explicit entities array
    if (Array.isArray(fact.entities)) {
      for (const e of fact.entities) {
        if (typeof e === "string" && isCapitalizedPhrase(e)) {
          out.add(e.trim());
        }
      }
    }
    // Common named fields
    for (const key of ["entity", "who", "organization", "company"] as const) {
      const v = fact[key];
      if (typeof v === "string" && isCapitalizedPhrase(v)) {
        out.add(v.trim());
      }
    }
    // Fallback: scan fact/text for capitalized tokens
    const text = fact.fact ?? fact.text;
    if (typeof text === "string") {
      const tokens = text.split(/[\s,;:()"\[\]]+/).filter(Boolean);
      for (const t of tokens) {
        if (isCapitalizedPhrase(t) && !STOP_WORDS.has(t.toLowerCase())) {
          // Keep only reasonably short tokens to avoid full phrases
          if (t.length <= 24) out.add(t);
        }
      }
    }
  }
}

function extractFromThemes(themes: unknown, out: Set<string>): void {
  if (!Array.isArray(themes)) return;
  for (const raw of themes) {
    if (!raw || typeof raw !== "object") continue;
    const theme = raw as ThemeLike;
    const label = theme.label ?? theme.name ?? theme.theme;
    if (typeof label !== "string") continue;
    // Split on non-alphanumeric and take capitalized words
    const parts = label
      .split(/[^A-Za-z]+/)
      .filter((p) => isCapitalizedPhrase(p) && !STOP_WORDS.has(p.toLowerCase()));
    for (const p of parts) {
      if (p.length <= 24) out.add(p);
    }
  }
}

export function EntityTags({ analyses, maxVisible = 4 }: EntityTagsProps) {
  if (!analyses || analyses.length === 0) return null;

  const entities = new Set<string>();
  for (const a of analyses) {
    extractFromFacts(a.keyFacts, entities);
    extractFromThemes(a.strategicThemes, entities);
  }

  const list = Array.from(entities).slice(0, maxVisible + 4); // cap collection
  if (list.length === 0) return null;

  const visible = list.slice(0, maxVisible);
  const overflow = list.length - visible.length;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((entity) => (
        <Badge
          key={entity}
          variant="outline"
          className="text-[10px] py-0 normal-case tracking-normal font-sans"
        >
          {entity}
        </Badge>
      ))}
      {overflow > 0 && (
        <Badge
          variant="outline"
          className="text-[10px] py-0 normal-case tracking-normal font-sans text-muted-foreground"
        >
          +{overflow} more
        </Badge>
      )}
    </div>
  );
}
