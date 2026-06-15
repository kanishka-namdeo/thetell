/**
 * Backend API Client
 *
 * Typed fetch wrapper for calling the Python FastAPI backend at http://localhost:8000/api/v1/
 * Handles authentication via API key, error handling, and timeouts.
 */

import type {
  SignalWithRelations,
  CompanyWithCounts,
  AnalysisData,
  ArticleWithRelations,
  PaginatedApiResponse,
} from "@/lib/api/schemas";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

const DEFAULT_TIMEOUT_MS = 10_000;
const ANALYSIS_TIMEOUT_MS = 30_000;
const ARTICLE_GENERATION_TIMEOUT_MS = 60_000;

export class BackendApiError extends Error {
  constructor(
    public status: number,
    public error: string,
    public message: string,
    public details?: Record<string, string[] | undefined>
  ) {
    super(message);
    this.name = "BackendApiError";
  }
}

interface RequestOptions {
  timeout?: number;
  signal?: AbortSignal;
}

async function backendFetch<T>(
  endpoint: string,
  options: RequestInit & RequestOptions = {}
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT_MS, signal, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const combinedSignal = signal || controller.signal;

  try {
    const response = await fetch(`${BACKEND_URL}/api/v1${endpoint}`, {
      ...fetchOptions,
      signal: combinedSignal,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": BACKEND_API_KEY,
        ...fetchOptions.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: "unknown_error",
        message: `HTTP ${response.status}: ${response.statusText}`,
      }));

      throw new BackendApiError(
        response.status,
        errorData.error || "unknown_error",
        errorData.message || "An error occurred",
        errorData.details
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// Signals

export async function getBackendSignal(signalId: string): Promise<SignalWithRelations> {
  return backendFetch<SignalWithRelations>(`/signals/${signalId}`);
}

export async function listBackendSignals(params?: {
  companyId?: string;
  sourceType?: string;
  status?: string;
  sentiment?: string;
  limit?: number;
  cursor?: string;
}): Promise<PaginatedApiResponse<SignalWithRelations>> {
  const searchParams = new URLSearchParams();
  if (params?.companyId) searchParams.set("company_id", params.companyId);
  if (params?.sourceType) searchParams.set("source_type", params.sourceType);
  if (params?.status) searchParams.set("status_filter", params.status);
  if (params?.sentiment) searchParams.set("sentiment", params.sentiment);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.cursor) searchParams.set("cursor", params.cursor);

  const query = searchParams.toString();
  return backendFetch<PaginatedApiResponse<SignalWithRelations>>(
    `/signals${query ? `?${query}` : ""}`
  );
}

export async function triggerBackendAnalysis(signalId: string): Promise<void> {
  return backendFetch<void>(`/signals/${signalId}/analyze`, {
    method: "POST",
    timeout: ANALYSIS_TIMEOUT_MS,
  });
}

// Companies

export async function getBackendCompany(companyId: string): Promise<CompanyWithCounts> {
  return backendFetch<CompanyWithCounts>(`/companies/${companyId}`);
}

export async function listBackendCompanies(params?: {
  limit?: number;
  cursor?: string;
}): Promise<PaginatedApiResponse<CompanyWithCounts>> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.cursor) searchParams.set("cursor", params.cursor);

  const query = searchParams.toString();
  return backendFetch<PaginatedApiResponse<CompanyWithCounts>>(
    `/companies${query ? `?${query}` : ""}`
  );
}

// Articles

export async function getBackendArticle(articleId: string): Promise<ArticleWithRelations> {
  return backendFetch<ArticleWithRelations>(`/articles/${articleId}`);
}

export async function listBackendArticles(params?: {
  companyId?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}): Promise<PaginatedApiResponse<ArticleWithRelations>> {
  const searchParams = new URLSearchParams();
  if (params?.companyId) searchParams.set("company_id", params.companyId);
  if (params?.status) searchParams.set("status_filter", params.status);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.cursor) searchParams.set("cursor", params.cursor);

  const query = searchParams.toString();
  return backendFetch<PaginatedApiResponse<ArticleWithRelations>>(
    `/articles${query ? `?${query}` : ""}`
  );
}

export async function generateBackendArticle(data: {
  companyId: string;
  analysisIds: string[];
}): Promise<ArticleWithRelations> {
  return backendFetch<ArticleWithRelations>(`/articles/generate`, {
    method: "POST",
    body: JSON.stringify({
      company_id: data.companyId,
      analysis_ids: data.analysisIds,
    }),
    timeout: ARTICLE_GENERATION_TIMEOUT_MS,
  });
}

// Analyses

export async function listBackendAnalyses(params?: {
  signalId?: string;
  companyId?: string;
  sentiment?: string;
  limit?: number;
  cursor?: string;
}): Promise<PaginatedApiResponse<AnalysisData>> {
  const searchParams = new URLSearchParams();
  if (params?.signalId) searchParams.set("signal_id", params.signalId);
  if (params?.companyId) searchParams.set("company_id", params.companyId);
  if (params?.sentiment) searchParams.set("sentiment", params.sentiment);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.cursor) searchParams.set("cursor", params.cursor);

  const query = searchParams.toString();
  return backendFetch<PaginatedApiResponse<AnalysisData>>(
    `/analyses${query ? `?${query}` : ""}`
  );
}
