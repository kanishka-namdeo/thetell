---
name: opencode-sdk
description: Use when integrating OpenCode SDK with The Tell app, creating custom agents/tools, automating coding workflows, managing sessions programmatically, building plugins, or configuring OpenCode for the project
---

# OpenCode SDK Integration

## Overview

**OpenCode SDK** provides type-safe programmatic control over OpenCode, an open-source AI coding agent. Use it to build integrations, automate workflows, create custom tools, and embed AI coding capabilities into The Tell app.

**Core principle**: OpenCode SDK is a client-server architecture. The SDK is a TypeScript/JavaScript client that communicates with an OpenCode server instance via REST API and Server-Sent Events (SSE).

**The Tell context**: This project uses a custom LLM provider (`thetell/qwen3-coder-next`) via OpenAI-compatible API. OpenCode is already configured in `opencode.json` with MCP servers (Prisma, Chrome DevTools, Playwright, GitHub, ESLint, etc.).

## When to Use

Use this skill when:
- Building custom integrations with OpenCode
- Automating coding workflows (code review, refactoring, testing)
- Creating custom tools or plugins for OpenCode
- Managing AI sessions programmatically
- Embedding OpenCode capabilities into The Tell app
- Configuring OpenCode agents for specific tasks
- Subscribing to real-time events from OpenCode
- Implementing structured output from AI sessions

**When NOT to use**:
- Direct terminal usage of OpenCode (use CLI instead)
- Simple file operations (use built-in tools)
- One-off prompts (use OpenCode TUI directly)

## Core Pattern

### Server + Client Setup

```typescript
import { createOpencode } from "@opencode-ai/sdk"

// Create server + client instance
const { client, server } = await createOpencode({
  hostname: "127.0.0.1",
  port: 4096,
  timeout: 10000,
  config: {
    model: "thetell/qwen3-coder-next",
    // Additional config overrides
  },
})

console.log(`Server running at ${server.url}`)

// Use client for operations
const sessions = await client.session.list()

// Clean up
server.close()
```

### Client-Only (Connect to Running Server)

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
})

// Use client immediately
const health = await client.global.health()
```

## Quick Reference

### Session Management

| Operation | Method | Notes |
|-----------|--------|-------|
| Create session | `client.session.create({ body: { title } })` | Returns Session |
| List sessions | `client.session.list()` | Returns Session[] |
| Get session | `client.session.get({ path: { id } })` | Returns Session |
| Delete session | `client.session.delete({ path: { id } })` | Returns boolean |
| Send prompt | `client.session.prompt({ path: { id }, body: { parts } })` | Returns AssistantMessage |
| Inject context | `client.session.prompt({ path: { id }, body: { noReply: true, parts } })` | Returns UserMessage |
| Abort session | `client.session.abort({ path: { id } })` | Returns boolean |
| Share session | `client.session.share({ path: { id } })` | Returns Session with shareUrl |

### File Operations

| Operation | Method | Notes |
|-----------|--------|-------|
| Read file | `client.file.read({ query: { path } })` | Returns `{ type, content }` |
| Search text | `client.find.text({ query: { pattern } })` | Returns matches with line numbers |
| Find files | `client.find.files({ query: { query, type, limit } })` | Returns file paths |
| Find symbols | `client.find.symbols({ query: { query } })` | Returns Symbol[] |
| File status | `client.file.status()` | Returns File[] with git status |

### Real-Time Events

```typescript
const events = await client.event.subscribe()

for await (const event of events.stream) {
  if (event.type === "session.updated") {
    console.log("Session updated:", event.properties)
  }
  if (event.type === "session.idle") {
    console.log("Session completed")
  }
}
```

### Structured Output

```typescript
const result = await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts: [{ type: "text", text: "Analyze this signal" }],
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          themes: { type: "array", items: { type: "string" } },
        },
        required: ["sentiment", "confidence"],
      },
    },
  },
})

const analysis = result.data.info.structured_output
```

## Implementation

### Pattern 1: Automated Code Review

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

async function automatedCodeReview() {
  const client = createOpencodeClient({ baseUrl: "http://localhost:4096" })

  // Create review session
  const session = await client.session.create({
    body: { title: "Automated Code Review" },
  })

  // Get modified files
  const files = await client.file.status()
  const modifiedFiles = files.filter(f => f.status === "modified")

  // Review each file
  for (const file of modifiedFiles) {
    const content = await client.file.read({ query: { path: file.path } })

    await client.session.prompt({
      path: { id: session.id },
      body: {
        parts: [{
          type: "text",
          text: `Review ${file.path} for security, performance, and best practices:\n\n${content.content}`,
        }],
      },
    })
  }

  // Share review results
  const shared = await client.session.share({ path: { id: session.id } })
  console.log("Review URL:", shared.shareUrl)
}
```

### Pattern 2: Signal Analysis Pipeline

```typescript
import { createOpencode } from "@opencode-ai/sdk"

async function analyzeSignal(signalContent: string) {
  const { client, server } = await createOpencode({
    config: {
      model: "thetell/qwen3-coder-next",
    },
  })

  try {
    const session = await client.session.create({
      body: { title: "Signal Analysis" },
    })

    const result = await client.session.prompt({
      path: { id: session.id },
      body: {
        parts: [{ type: "text", text: signalContent }],
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              facts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    confidence: { type: "number" },
                  },
                },
              },
              sentiment: { type: "string" },
              strategicThemes: { type: "array", items: { type: "string" } },
            },
            required: ["facts", "sentiment"],
          },
        },
      },
    })

    return result.data.info.structured_output
  } finally {
    server.close()
  }
}
```

### Pattern 3: Custom Tool Development

Create `.opencode/tools/query-signals.ts`:

```typescript
import { tool } from "@opencode-ai/plugin"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export default tool({
  description: "Query signals from The Tell database",
  args: {
    companyId: tool.schema.string().optional().describe("Filter by company ID"),
    limit: tool.schema.number().default(10).describe("Max results"),
  },
  async execute(args) {
    const signals = await prisma.signal.findMany({
      where: args.companyId ? { companyId: args.companyId } : undefined,
      take: args.limit,
      orderBy: { createdAt: "desc" },
      include: { analyses: true },
    })

    return JSON.stringify(signals, null, 2)
  },
})
```

### Pattern 4: Plugin with Event Hooks

Create `.opencode/plugins/analytics.ts`:

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const AnalyticsPlugin: Plugin = async ({ client, project }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.completed") {
        // Track session analytics
        await trackSessionCompletion({
          projectId: project.id,
          sessionId: event.properties.sessionID,
          completedAt: new Date(),
        })
      }
    },

    "chat.message": async (input, output) => {
      // Log all prompts for audit
      console.log(`[Audit] Prompt: ${input.parts[0].text}`)
      return output
    },
  }
}

async function trackSessionCompletion(data: any) {
  // Send to analytics service
}
```

Register in `opencode.json`:

```json
{
  "plugin": ["./.opencode/plugins/analytics.ts"]
}
```

### Pattern 5: Real-Time Monitoring Dashboard

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

async function monitorSessions() {
  const client = createOpencodeClient({ baseUrl: "http://localhost:4096" })
  const events = await client.event.subscribe()

  const activeSessions = new Map()

  for await (const event of events.stream) {
    const sessionId = event.properties.sessionID

    switch (event.type) {
      case "session.created":
        activeSessions.set(sessionId, {
          title: event.properties.title,
          startedAt: new Date(),
          status: "active",
        })
        break

      case "session.updated":
        activeSessions.set(sessionId, {
          ...activeSessions.get(sessionId),
          lastUpdated: new Date(),
        })
        break

      case "session.idle":
        activeSessions.set(sessionId, {
          ...activeSessions.get(sessionId),
          status: "completed",
          completedAt: new Date(),
        })
        break
    }

    // Update dashboard UI
    updateDashboard(Array.from(activeSessions.values()))
  }
}
```

## The Tell Configuration

### Current Setup

The Tell's `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "thetell/qwen3-coder-next",
  "small_model": "thetell/qwen3.6-plus",
  "provider": {
    "thetell": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "The Tell LLM",
      "options": {
        "baseURL": "https://irhnglwoxe.a.pinggy.link/v1",
        "apiKey": "{env:API_KEY}"
      },
      "models": {
        "qwen3-coder-next": {
          "name": "Qwen3 Coder Next (Fast)"
        },
        "qwen3.6-plus": {
          "name": "Qwen3.6 Plus (Reasoning)"
        }
      }
    }
  }
}
```

### Custom Agents for The Tell

Add to `opencode.json`:

```json
{
  "agent": {
    "signal-analyst": {
      "description": "Analyzes corporate signals and extracts strategic insights",
      "mode": "subagent",
      "model": "thetell/qwen3-coder-next",
      "prompt": "You are a signal analyst for The Tell. Extract facts, assess sentiment, and identify strategic themes from corporate signals.",
      "permission": {
        "edit": "deny",
        "bash": "deny"
      }
    },
    "code-reviewer": {
      "description": "Reviews code for security and best practices",
      "mode": "subagent",
      "model": "thetell/qwen3.6-plus",
      "prompt": "Review code for security vulnerabilities, performance issues, and adherence to The Tell's coding standards.",
      "permission": {
        "edit": "deny"
      }
    }
  }
}
```

### MCP Integration

The Tell already has MCP servers configured in `opencode/config/opencode.json`:

```json
{
  "mcpServers": {
    "Prisma": { "url": "https://mcp.prisma.io/mcp" },
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": { "Authorization": "Bearer ${GITHUB_TOKEN}" }
    },
    "chrome-devtools": { "command": "npx", "args": ["-y", "chrome-devtools-mcp@latest"] }
  }
}
```

## Common Mistakes

### Mistake 1: Not Closing Server

**Bad**:
```typescript
const { client, server } = await createOpencode()
// Use client...
// Forgot to close server - resource leak!
```

**Good**:
```typescript
const { client, server } = await createOpencode()
try {
  // Use client...
} finally {
  server.close()
}
```

### Mistake 2: Ignoring Structured Output Errors

**Bad**:
```typescript
const result = await client.session.prompt({ /* ... */ })
const data = result.data.info.structured_output // May be undefined!
```

**Good**:
```typescript
const result = await client.session.prompt({ /* ... */ })

if (result.data.info.error?.name === "StructuredOutputError") {
  console.error("Failed to parse structured output:", result.data.info.error.message)
  return null
}

const data = result.data.info.structured_output
if (!data) {
  throw new Error("No structured output returned")
}
```

### Mistake 3: Not Handling Event Stream Errors

**Bad**:
```typescript
const events = await client.event.subscribe()
for await (const event of events.stream) {
  // No error handling
}
```

**Good**:
```typescript
const events = await client.event.subscribe()

try {
  for await (const event of events.stream) {
    // Handle events
  }
} catch (error) {
  console.error("Event stream error:", error)
  // Reconnect or handle gracefully
}
```

### Mistake 4: Using Wrong Model Format

**Bad**:
```typescript
await client.session.prompt({
  body: {
    model: "qwen3-coder-next", // Missing provider prefix
  },
})
```

**Good**:
```typescript
await client.session.prompt({
  body: {
    model: {
      providerID: "thetell",
      modelID: "qwen3-coder-next",
    },
  },
})
```

## Error Handling

### SDK Errors

```typescript
try {
  await client.session.get({ path: { id: "invalid-id" } })
} catch (error) {
  if (error.status === 404) {
    console.error("Session not found")
  } else if (error.status === 500) {
    console.error("Server error")
  } else {
    console.error("Unexpected error:", error)
  }
}
```

### Structured Output Validation

```typescript
import { z } from "zod"

const AnalysisSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
  themes: z.array(z.string()),
})

const result = await client.session.prompt({ /* ... */ })
const parsed = AnalysisSchema.safeParse(result.data.info.structured_output)

if (!parsed.success) {
  console.error("Invalid structured output:", parsed.error)
  return null
}

const analysis = parsed.data
```

## Advanced Patterns

### Parallel Session Execution

```typescript
async function analyzeMultipleSignals(signals: string[]) {
  const { client, server } = await createOpencode()

  try {
    // Create sessions in parallel
    const sessionPromises = signals.map(async (signal) => {
      const session = await client.session.create({
        body: { title: "Signal Analysis" },
      })
      return { session, signal }
    })

    const sessions = await Promise.all(sessionPromises)

    // Send prompts in parallel
    const resultPromises = sessions.map(async ({ session, signal }) => {
      return client.session.prompt({
        path: { id: session.id },
        body: {
          parts: [{ type: "text", text: signal }],
          format: { /* schema */ },
        },
      })
    })

    const results = await Promise.all(resultPromises)
    return results.map(r => r.data.info.structured_output)
  } finally {
    server.close()
  }
}
```

### Custom Authentication Provider

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const CustomAuthPlugin: Plugin = async () => {
  return {
    auth: async (provider) => {
      if (provider === "thetell") {
        return {
          type: "api",
          key: process.env.THE_TELL_API_KEY,
        }
      }
      return null
    },
  }
}
```

### Tool Execution Hooks

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const ToolLoggingPlugin: Plugin = async () => {
  return {
    "tool.execute.before": async (input) => {
      console.log(`[Tool] Executing: ${input.tool}`, input.args)
      return input
    },

    "tool.execute.after": async (output) => {
      console.log(`[Tool] Result:`, output.substring(0, 100))
      return output
    },
  }
}
```

## References

- **Full API Reference**: See `references/api-reference.md` for complete SDK API documentation
- **The Tell Config**: See `references/the-tell-config.md` for project-specific configuration examples
- **OpenCode Docs**: https://opencode.ai/docs/
- **SDK Source**: https://github.com/sst/opencode-sdk-js
