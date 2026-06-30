/**
 * DeepAgent Harness Profiles
 *
 * Defines per-model tuning profiles for the DeepAgent.
 * Profiles control excluded tools, description overrides,
 * and other model-specific configuration.
 */

export interface HarnessProfile {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Model provider this profile targets */
  provider: "openai" | "anthropic" | "google" | "generic";
  /** Tools to exclude from the agent for this profile */
  excludedTools: string[];
  /** Tool description overrides */
  toolDescriptionOverrides: Record<string, string>;
  /** Whether this is a built-in (non-deletable) profile */
  builtIn: boolean;
  /** Custom system prompt additions */
  systemPromptAdditions?: string;
}

export const BUILT_IN_PROFILES: HarnessProfile[] = [
  {
    id: "default",
    name: "Default",
    description: "Standard configuration with all tools available",
    provider: "generic",
    excludedTools: [],
    toolDescriptionOverrides: {},
    builtIn: true,
  },
  {
    id: "openai-gpt",
    name: "OpenAI GPT",
    description: "Optimized for GPT-4 and GPT-4o models",
    provider: "openai",
    excludedTools: [],
    toolDescriptionOverrides: {},
    builtIn: true,
  },
  {
    id: "anthropic-claude",
    name: "Anthropic Claude",
    description: "Optimized for Claude 3.5/4 models with extended thinking",
    provider: "anthropic",
    excludedTools: [],
    toolDescriptionOverrides: {},
    builtIn: true,
    systemPromptAdditions:
      "When using tools, provide clear descriptions of what you're doing. Claude excels at multi-step reasoning.",
  },
  {
    id: "safe-mode",
    name: "Safe Mode",
    description: "Restricts write operations — read-only access to filesystem",
    provider: "generic",
    excludedTools: ["write_file", "edit_file", "shell"],
    toolDescriptionOverrides: {},
    builtIn: true,
  },
  {
    id: "code-focused",
    name: "Code Focused",
    description: "Optimized for code editing with interpreter enabled",
    provider: "generic",
    excludedTools: [],
    toolDescriptionOverrides: {
      eval: "Execute JavaScript code in a sandboxed QuickJS runtime. Use for computations, data transformations, or quick scripts.",
    },
    builtIn: true,
  },
];

/**
 * Get a profile by ID, or return the default profile.
 */
export function getProfile(id: string): HarnessProfile {
  return BUILT_IN_PROFILES.find((p) => p.id === id) ?? BUILT_IN_PROFILES[0];
}

/**
 * List all available profiles.
 */
export function listProfiles(): HarnessProfile[] {
  return BUILT_IN_PROFILES;
}
