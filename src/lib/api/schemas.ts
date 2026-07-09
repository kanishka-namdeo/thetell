export interface ApiResponse<T> {
  data: T;
  error?: null;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  details?: Record<string, string[] | undefined>;
}

export interface PaginatedApiResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CompanyWithCounts {
  id: string;
  name: string;
  slug: string;
  ticker: string | null;
  description: string | null;
  websiteUrl: string | null;
  createdAt: string;
  updatedAt: string;
  isWatched?: boolean;
  _count: {
    signals: number;
  };
}

export interface SignalWithRelations {
  id: string;
  sourceUrl: string;
  sourceType: string;
  title: string;
  rawContent: string;
  publishedAt: string | null;
  scrapedAt: string;
  companyId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  scraperName: string | null;
  verified: boolean;
  feedLabel: string | null;
  dataOrigin: "SCRAPED" | "BOOTSTRAP" | "SEED" | "MANUAL";
  company: {
    id: string;
    name: string;
    slug: string;
    ticker: string | null;
  };
  analyses: AnalysisData[];
  cluster?: { id: string; label: string } | null;
  themes?: Array<{ id: string; label: string }>;
}

export interface AnalysisData {
  id: string;
  signalId: string;
  agentPersona?: string;
  summary: string;
  keyFacts: KeyFact[];
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  strategicThemes: StrategicTheme[];
  confidence: number;
  modelUsed: string;
  analyzedAt: string;
}

export interface KeyFact {
  text: string;
  category: string;
  confidence: number;
  sourceSentence?: string;
}

export interface StrategicTheme {
  label: string;
  evidence: string[];
  correlationHints?: string[];
}

