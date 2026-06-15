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
  _count: {
    signals: number;
    articles: number;
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
  company: {
    id: string;
    name: string;
    slug: string;
    ticker: string | null;
  };
  analysis: AnalysisData | null;
}

export interface AnalysisData {
  id: string;
  signalId: string;
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

export interface ArticleWithRelations {
  id: string;
  title: string;
  slug: string;
  summary: string;
  body: string;
  companyId: string;
  analysisIds: string[];
  publishedAt: string | null;
  status: "DRAFT" | "PUBLISHED";
  authorId: string | null;
  createdAt: string;
  updatedAt: string;
  company: {
    id: string;
    name: string;
    slug: string;
    ticker: string | null;
  };
  author: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
}
