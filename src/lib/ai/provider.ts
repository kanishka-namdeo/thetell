/**
 * LLM provider abstraction layer.
 * Translated from backend/app/llm/provider.py
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { LLMMessage } from "./types";

export type ProviderName = "openai" | "anthropic";

export interface LLMProvider {
  completeStructured<T>(
    messages: LLMMessage[],
    schema: z.ZodSchema<T>,
    options?: {
      model?: string;
      temperature?: number;
    }
  ): Promise<T>;
}

function extractJsonFromMarkdown(content: string): string {
  // Strip markdown code blocks
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  let cleaned = match ? match[1].trim() : content;
  
  // Remove any leading/trailing non-JSON content
  cleaned = cleaned.trim();
  
  // Try to find JSON object or array boundaries
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
    // Try to fix common JSON issues
    let fixed = content;
    
    // Remove trailing commas in arrays/objects
    fixed = fixed.replace(/,\s*([\]}])/g, '$1');
    
    // Fix missing commas between array elements (common LLM error)
    fixed = fixed.replace(/}\s*{/g, '},{');
    fixed = fixed.replace(/"\s*"/g, '","');
    
    try {
      return JSON.parse(fixed);
    } catch {
      // Last resort: try to extract just the main structure
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

class OpenAIProvider implements LLMProvider {
  private client?: OpenAI;

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: process.env.API_KEY ?? process.env.OPENAI_API_KEY,
        baseURL: process.env.BASE_URL ?? process.env.OPENAI_BASE_URL,
        timeout: 60_000,
        maxRetries: 2,
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
    }
  ): Promise<T> {
    const client = this.getClient();
    const model = options?.model ?? process.env.FAST_MODEL ?? "qwen3-coder-next";
    const temperature = options?.temperature ?? 0.3;

    logger.debug("llm.openai.request", { model, temperature });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    let response;
    try {
      response = await client.chat.completions.create(
        {
          model,
          messages: messages.map((m) => ({
            role: m.role as "system" | "user" | "assistant",
            content: m.content,
          })),
          temperature,
          response_format: { type: "json_object" },
        },
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const cleanedContent = extractJsonFromMarkdown(content);
    const parsed = tryParseJSON(cleanedContent);
    const result = schema.parse(parsed);

    logger.info("llm.openai.success", {
      model,
      tokens_in: response.usage?.prompt_tokens,
      tokens_out: response.usage?.completion_tokens,
    });

    return result;
  }
}

class AnthropicProvider implements LLMProvider {
  private client?: Anthropic;

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        timeout: 60_000,
        maxRetries: 2,
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
    }
  ): Promise<T> {
    const client = this.getClient();
    const model =
      options?.model ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022";
    const temperature = options?.temperature ?? 0.3;

    logger.debug("llm.anthropic.request", { model, temperature });

    const systemMessage = messages.find((m) => m.role === "system");
    const userMessages = messages.filter((m) => m.role !== "system");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    let response;
    try {
      response = await client.messages.create(
        {
          model,
          max_tokens: 4096,
          temperature,
          system: systemMessage?.content,
          messages: userMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        },
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Expected text response from Anthropic");
    }

    const cleanedContent = extractJsonFromMarkdown(content.text);
    const parsed = tryParseJSON(cleanedContent);
    const result = schema.parse(parsed);

    logger.info("llm.anthropic.success", {
      model,
      tokens_in: response.usage.input_tokens,
      tokens_out: response.usage.output_tokens,
    });

    return result;
  }
}

const providers: Record<ProviderName, LLMProvider> = {
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
};

export function getProvider(name: ProviderName = "openai"): LLMProvider {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Unknown LLM provider: ${name}`);
  }
  return provider;
}
