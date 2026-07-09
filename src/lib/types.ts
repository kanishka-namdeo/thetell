export type {
  User,
  Company,
  Signal,
  Analysis,
  Session,
  Account,
} from "@prisma/client";

export type {
  Role,
  SourceType,
  SignalStatus,
  Sentiment,
} from "@prisma/client";

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface KeyFact {
  text: string;
  category: "financial" | "strategic" | "operational" | "personnel" | "market";
  sourceSentence?: string;
  confidence: number;
}

export interface StrategicTheme {
  label: string;
  evidence: string[];
  correlationHints?: string[];
}
