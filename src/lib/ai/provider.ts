/**
 * LLM provider abstraction layer.
 * Translated from backend/app/llm/provider.py
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { LLMMessage } from "./types";
import { checkRateLimit } from "@/lib/rate-limiter";

export type ProviderName = "openai" | "anthropic";

/**
 * Token usage returned by completeStructuredWithUsage.
 */
export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Result of completeStructuredWithUsage — data + token usage.
 */
export interface StructuredResult<T> {
  data: T;
  usage: LLMUsage;
}

export interface LLMProvider {
  completeStructured<T>(
    messages: LLMMessage[],
    schema: z.ZodSchema<T>,
    options?: {
      model?: string;
      temperature?: number;
      traceName?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<T>;

  /**
   * Same as completeStructured but also returns token usage.
   * Use this when callers need to track per-call token consumption.
   */
  completeStructuredWithUsage<T>(
    messages: LLMMessage[],
    schema: z.ZodSchema<T>,
    options?: {
      model?: string;
      temperature?: number;
      traceName?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<StructuredResult<T>>;
}

// --- Circuit breaker state ---

interface CircuitBreakerState {
  consecutiveFailures: number;
  openUntil: number;
}

const circuitBreakerStates = new Map<ProviderName, CircuitBreakerState>();

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;

function getCircuitBreaker(provider: ProviderName): CircuitBreakerState {
  let state = circuitBreakerStates.get(provider);
  if (!state) {
    state = { consecutiveFailures: 0, openUntil: 0 };
    circuitBreakerStates.set(provider, state);
  }
  return state;
}

function isCircuitOpen(provider: ProviderName): boolean {
  const state = getCircuitBreaker(provider);
  return Date.now() < state.openUntil;
}

function recordSuccess(provider: ProviderName): void {
  const state = getCircuitBreaker(provider);
  state.consecutiveFailures = 0;
  state.openUntil = 0;
}

function recordFailure(provider: ProviderName): void {
  const state = getCircuitBreaker(provider);
  state.consecutiveFailures++;
  if (state.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    state.openUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
    logger.warn("llm.circuit_breaker.open", {
      provider,
      failures: state.consecutiveFailures,
      cooldownMs: CIRCUIT_BREAKER_COOLDOWN_MS,
    });
  }
}

// --- Token budget tracking ---

let totalTokensUsed = { input: 0, output: 0 };
let lastResetDate = new Date().toDateString();

export function getTokenBudget(): { input: number; output: number; total: number } {
  return {
    input: totalTokensUsed.input,
    output: totalTokensUsed.output,
    total: totalTokensUsed.input + totalTokensUsed.output,
  };
}

export function resetTokenCounters(): void {
  totalTokensUsed = { input: 0, output: 0 };
  lastResetDate = new Date().toDateString();
  logger.info("llm.token_counters_reset");
}

function trackTokens(input: number, output: number, provider: string, model: string): void {
  // Daily reset
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    logger.info("llm.token_daily_reset", { previousDate: lastResetDate, newDate: today });
    totalTokensUsed = { input: 0, output: 0 };
    lastResetDate = today;
  }

  totalTokensUsed.input += input;
  totalTokensUsed.output += output;
  logger.info("llm.token_usage", {
    provider,
    model,
    input_tokens: input,
    output_tokens: output,
    cumulative_input: totalTokensUsed.input,
    cumulative_output: totalTokensUsed.output,
  });
}

// --- Retry with exponential backoff ---

const MAX_RETRIES = 3;

async function withRetry<T>(
  fn: () => Promise<T>,
  providerName: ProviderName,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
      logger.warn("llm.retry", { provider: providerName, attempt, delayMs });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    try {
      const result = await fn();
      recordSuccess(providerName);
      return result;
    } catch (error) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Don't retry non-transient errors (schema validation, parse failures)
      const isNonRetriable =
        errorMessage.includes("schema validation") ||
        errorMessage.includes("Failed to parse") ||
        errorMessage.includes("Empty response");
      if (isNonRetriable) {
        logger.warn("llm.non_retriable_error", { provider: providerName, error: errorMessage });
        throw error;
      }

      // Don't trip circuit breaker for rate limit errors — they're temporary, not provider failures
      const isRateLimit = errorMessage.includes("rate limit");
      if (!isRateLimit) {
        recordFailure(providerName);
      }
      logger.warn("llm.attempt_failed", {
        provider: providerName,
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES + 1,
        error: errorMessage,
        isRateLimit,
      });
    }
  }
  throw lastError;
}

// --- Rate limiting for LLM calls ---

const _rateLimitParsed = parseInt(process.env.LLM_RATE_LIMIT_PER_MINUTE ?? "30", 10);
const LLM_RATE_LIMIT = Number.isNaN(_rateLimitParsed) ? 30 : _rateLimitParsed;
const LLM_RATE_WINDOW = 60;

async function checkLLMRateLimit(provider: ProviderName): Promise<void> {
  const result = checkRateLimit(`llm:${provider}`, LLM_RATE_LIMIT, LLM_RATE_WINDOW);
  if (!result.allowed) {
    const waitMs = result.resetAt - Date.now() + 100; // +100ms buffer
    if (waitMs > 0) {
      logger.info("llm.rate_limit_waiting", {
        provider,
        waitMs,
        resetAt: new Date(result.resetAt).toISOString(),
      });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      // After waiting, check again (should pass now)
      const retryResult = checkRateLimit(`llm:${provider}`, LLM_RATE_LIMIT, LLM_RATE_WINDOW);
      if (!retryResult.allowed) {
        throw new Error(
          `LLM rate limit still exceeded for ${provider} after waiting`
        );
      }
    }
  }
}

// --- JSON parsing helpers ---

function extractJsonFromMarkdown(content: string): string {
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  let cleaned = match ? match[1].trim() : content;
  
  cleaned = cleaned.trim();
  
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  } else if (firstBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.substring(firstBracket, lastBracket + 1);
  }
  
  return cleaned;
}

function tryParseJSON(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (e) {
    let fixed = content;
    
    fixed = fixed.replace(/,\s*([\]}])/g, '$1');
    fixed = fixed.replace(/}\s*{/g, '},{');
    fixed = fixed.replace(/"\s*"/g, '","');
    fixed = fixed.replace(/:\s*"([^"]*)""/g, ':"$1"');
    fixed = fixed.replace(/([\]}])\s*"/g, '$1,"');
    fixed = fixed.replace(/(?<=[\s\[{,])'|'(?=[\s\]},])/g, '"');
    
    try {
      return JSON.parse(fixed);
    } catch {
      const objMatch = content.match(/\{[\s\S]*\}/);
      const arrMatch = content.match(/\[[\s\S]*\]/);
      if (objMatch) {
        try { return JSON.parse(objMatch[0]); } catch {}
      }
      if (arrMatch) {
        try { return JSON.parse(arrMatch[0]); } catch {}
      }
      throw new Error(`Failed to parse JSON: ${String(e)}`);
    }
  }
}

function parseWithSchema<T>(schema: z.ZodSchema<T>, data: unknown, provider: string, model: string): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      }));
      logger.error("llm.schema_validation_failed", {
        provider,
        model,
        field_errors: fieldErrors,
      });
      throw new Error(
        `LLM response failed schema validation (${provider}/${model}): ${fieldErrors.map((fe) => `${fe.field}: ${fe.message}`).join("; ")}`
      );
    }
    throw error;
  }
}

// --- Provider implementations ---

class OpenAIProvider implements LLMProvider {
  private client?: OpenAI;

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = process.env.API_KEY ?? process.env.OPENAI_API_KEY;
      const baseURL = process.env.BASE_URL ?? process.env.OPENAI_BASE_URL;
      if (!apiKey || !baseURL) {
        throw new Error("API_KEY and BASE_URL must be configured for OpenAI provider");
      }
      this.client = new OpenAI({
        apiKey,
        baseURL,
        timeout: 180_000,
        maxRetries: 0, // We handle retries ourselves with exponential backoff
      });
    }
    return this.client;
  }

  async completeStructured<T>(
    messages: LLMMessage[],
    schema: z.ZodSchema<T>,
    options?: {
      model?: string;
      temperature?: number;
      traceName?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<T> {
    const client = this.getClient();
    const model = options?.model ?? process.env.FAST_MODEL;
    if (!model) {
      throw new Error("FAST_MODEL env var is not configured");
    }
    const temperature = options?.temperature ?? 0.3;

    logger.debug("llm.openai.request", { model, temperature });

    const jsonInstruction =
      "Respond with valid JSON only. Do not include any text outside the JSON structure.";
    const existingSystem = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");
    const mergedSystem = existingSystem
      ? { role: "system" as const, content: `${existingSystem.content}\n\n${jsonInstruction}` }
      : { role: "system" as const, content: jsonInstruction };
    const finalMessages = [mergedSystem, ...otherMessages];

    const result = await withRetry(async () => {
      await checkLLMRateLimit("openai");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180_000);

      try {
        const response = await client.chat.completions.create(
          {
            model,
            messages: finalMessages.map((m) => ({
              role: m.role as "system" | "user" | "assistant",
              content: m.content,
            })),
            temperature,
          },
          { signal: controller.signal }
        );

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error("Empty response from OpenAI");
        }

        const cleanedContent = extractJsonFromMarkdown(content);
        const parsed = tryParseJSON(cleanedContent);
        const validated = parseWithSchema(schema, parsed, "openai", model);

        const inputTokens = response.usage?.prompt_tokens ?? 0;
        const outputTokens = response.usage?.completion_tokens ?? 0;
        trackTokens(inputTokens, outputTokens, "openai", model);

        logger.info("llm.openai.success", {
          model,
          tokens_in: inputTokens,
          tokens_out: outputTokens,
        });

        return validated;
      } finally {
        clearTimeout(timeoutId);
      }
    }, "openai");

    return result;
  }

  async completeStructuredWithUsage<T>(
    messages: LLMMessage[],
    schema: z.ZodSchema<T>,
    options?: {
      model?: string;
      temperature?: number;
      traceName?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<StructuredResult<T>> {
    const client = this.getClient();
    const model = options?.model ?? process.env.FAST_MODEL;
    if (!model) {
      throw new Error("FAST_MODEL env var is not configured");
    }
    const temperature = options?.temperature ?? 0.3;

    logger.debug("llm.openai.request", { model, temperature });

    const jsonInstruction =
      "Respond with valid JSON only. Do not include any text outside the JSON structure.";
    const existingSystem = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");
    const mergedSystem = existingSystem
      ? { role: "system" as const, content: `${existingSystem.content}\n\n${jsonInstruction}` }
      : { role: "system" as const, content: jsonInstruction };
    const finalMessages = [mergedSystem, ...otherMessages];

    const result = await withRetry(async () => {
      await checkLLMRateLimit("openai");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180_000);

      try {
        const response = await client.chat.completions.create(
          {
            model,
            messages: finalMessages.map((m) => ({
              role: m.role as "system" | "user" | "assistant",
              content: m.content,
            })),
            temperature,
          },
          { signal: controller.signal }
        );

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error("Empty response from OpenAI");
        }

        const cleanedContent = extractJsonFromMarkdown(content);
        const parsed = tryParseJSON(cleanedContent);
        const validated = parseWithSchema(schema, parsed, "openai", model);

        const inputTokens = response.usage?.prompt_tokens ?? 0;
        const outputTokens = response.usage?.completion_tokens ?? 0;
        trackTokens(inputTokens, outputTokens, "openai", model);

        logger.info("llm.openai.success", {
          model,
          tokens_in: inputTokens,
          tokens_out: outputTokens,
        });

        return { validated, inputTokens, outputTokens };
      } finally {
        clearTimeout(timeoutId);
      }
    }, "openai");

    return {
      data: result.validated,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    };
  }
}

class AnthropicProvider implements LLMProvider {
  private client?: Anthropic;

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY must be configured for Anthropic provider");
      }
      this.client = new Anthropic({
        apiKey,
        timeout: 180_000,
        maxRetries: 0, // We handle retries ourselves with exponential backoff
      });
    }
    return this.client;
  }

  async completeStructured<T>(
    messages: LLMMessage[],
    schema: z.ZodSchema<T>,
    options?: {
      model?: string;
      temperature?: number;
      traceName?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<T> {
    const client = this.getClient();
    const model = options?.model ?? process.env.ANTHROPIC_MODEL;
    if (!model) {
      throw new Error("ANTHROPIC_MODEL env var is not configured");
    }
    const temperature = options?.temperature ?? 0.3;
    const rawMaxTokens = parseInt(process.env.ANTHROPIC_MAX_TOKENS ?? "4096", 10);
    const maxTokens = Number.isNaN(rawMaxTokens) ? 4096 : rawMaxTokens;

    logger.debug("llm.anthropic.request", { model, temperature, max_tokens: maxTokens });

    const systemMessage = messages.find((m) => m.role === "system");
    const userMessages = messages.filter((m) => m.role !== "system");

    const result = await withRetry(async () => {
      await checkLLMRateLimit("anthropic");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180_000);

      try {
        const response = await client.messages.create(
          {
            model,
            max_tokens: maxTokens,
            temperature,
            system: systemMessage?.content,
            messages: userMessages.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
          },
          { signal: controller.signal }
        );

        const content = response.content[0];
        if (content.type !== "text") {
          throw new Error("Expected text response from Anthropic");
        }

        const cleanedContent = extractJsonFromMarkdown(content.text);
        const parsed = tryParseJSON(cleanedContent);
        const validated = parseWithSchema(schema, parsed, "anthropic", model);

        const inputTokens = response.usage.input_tokens;
        const outputTokens = response.usage.output_tokens;
        trackTokens(inputTokens, outputTokens, "anthropic", model);

        logger.info("llm.anthropic.success", {
          model,
          tokens_in: inputTokens,
          tokens_out: outputTokens,
        });

        return validated;
      } finally {
        clearTimeout(timeoutId);
      }
    }, "anthropic");

    return result;
  }

  async completeStructuredWithUsage<T>(
    messages: LLMMessage[],
    schema: z.ZodSchema<T>,
    options?: {
      model?: string;
      temperature?: number;
      traceName?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<StructuredResult<T>> {
    const client = this.getClient();
    const model = options?.model ?? process.env.ANTHROPIC_MODEL;
    if (!model) {
      throw new Error("ANTHROPIC_MODEL env var is not configured");
    }
    const temperature = options?.temperature ?? 0.3;
    const rawMaxTokens = parseInt(process.env.ANTHROPIC_MAX_TOKENS ?? "4096", 10);
    const maxTokens = Number.isNaN(rawMaxTokens) ? 4096 : rawMaxTokens;

    logger.debug("llm.anthropic.request", { model, temperature, max_tokens: maxTokens });

    const systemMessage = messages.find((m) => m.role === "system");
    const userMessages = messages.filter((m) => m.role !== "system");

    const result = await withRetry(async () => {
      await checkLLMRateLimit("anthropic");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180_000);

      try {
        const response = await client.messages.create(
          {
            model,
            max_tokens: maxTokens,
            temperature,
            system: systemMessage?.content,
            messages: userMessages.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
          },
          { signal: controller.signal }
        );

        const content = response.content[0];
        if (content.type !== "text") {
          throw new Error("Expected text response from Anthropic");
        }

        const cleanedContent = extractJsonFromMarkdown(content.text);
        const parsed = tryParseJSON(cleanedContent);
        const validated = parseWithSchema(schema, parsed, "anthropic", model);

        const inputTokens = response.usage.input_tokens;
        const outputTokens = response.usage.output_tokens;
        trackTokens(inputTokens, outputTokens, "anthropic", model);

        logger.info("llm.anthropic.success", {
          model,
          tokens_in: inputTokens,
          tokens_out: outputTokens,
        });

        return { validated, inputTokens, outputTokens };
      } finally {
        clearTimeout(timeoutId);
      }
    }, "anthropic");

    return {
      data: result.validated,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    };
  }
}

// --- Provider registry with failover ---

const providers: Record<ProviderName, LLMProvider> = {
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
};

const FAILOVER_ORDER: ProviderName[] = ["openai", "anthropic"];

export function getProvider(name: ProviderName = "openai"): LLMProvider {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Unknown LLM provider: ${name}`);
  }
  return provider;
}

/**
 * Get a provider with failover support. If the primary provider's circuit breaker
 * is open, falls back to the next available provider.
 */
export function getProviderWithFailover(name: ProviderName = "openai"): { provider: LLMProvider; name: ProviderName } {
  if (!isCircuitOpen(name)) {
    return { provider: providers[name], name };
  }

  logger.warn("llm.failover.primary_unavailable", { primary: name });

  for (const fallback of FAILOVER_ORDER) {
    if (fallback !== name && !isCircuitOpen(fallback)) {
      logger.info("llm.failover.using_fallback", { primary: name, fallback });
      return { provider: providers[fallback], name: fallback };
    }
  }

  logger.error("llm.failover.all_unavailable", { tried: FAILOVER_ORDER });
  throw new Error(`All LLM providers unavailable (circuit breakers open)`);
}
