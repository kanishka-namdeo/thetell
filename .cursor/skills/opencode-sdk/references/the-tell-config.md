# The Tell OpenCode Configuration

Project-specific configuration and examples for integrating OpenCode SDK with The Tell app.

## Current Configuration

### opencode.json (Root)

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

### opencode/config/opencode.json (MCP Servers)

```json
{
  "provider": {
    "name": "openai",
    "apiKey": "${OPENAI_API_KEY}",
    "baseURL": "${OPENAI_BASE_URL}"
  },
  "model": "qwen3-coder-plus",
  "mcpServers": {
    "Prisma": {
      "url": "https://mcp.prisma.io/mcp"
    },
    "vercel": {
      "url": "https://mcp.vercel.com"
    },
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--headless=true",
        "--isolated=true",
        "--experimentalPageIdRouting=true",
        "--experimentalMemory=true",
        "--experimentalScreencast=true",
        "--experimentalVision=true",
        "--experimentalStructuredContent=true",
        "--experimentalIncludeAllPages=true",
        "--categoryExperimentalThirdParty=true"
      ]
    },
    "playwright": {
      "command": "npx",
      "args": [
        "@playwright/mcp@latest",
        "--vision",
        "--allow-unrestricted-file-access",
        "--no-sandbox",
        "--cdp-endpoint=http://localhost:9222"
      ]
    },
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}"
      }
    },
    "ESLint": {
      "type": "stdio",
      "command": "npx",
      "args": ["@eslint/mcp@latest"]
    },
    "mcp-deepwiki": {
      "command": "npx",
      "args": ["-y", "mcp-deepwiki@latest"]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}
```

## Custom Agents for The Tell

### Signal Analyst Agent

Analyzes corporate signals and extracts strategic insights.

```json
{
  "agent": {
    "signal-analyst": {
      "description": "Analyzes corporate signals and extracts strategic insights",
      "mode": "subagent",
      "model": "thetell/qwen3-coder-next",
      "prompt": "You are a signal analyst for The Tell. Your job is to:\n\n1. Extract key facts from corporate signals (news, filings, transcripts, social media)\n2. Assess sentiment (positive/negative/neutral) with confidence scores\n3. Identify strategic themes and implications\n4. Connect signals across multiple sources to infer corporate intent\n\nFocus on actionable intelligence that investment analysts and corporate strategists can use.\n\nWhen analyzing signals:\n- Prioritize specific numbers, dates, and named sources\n- Look for patterns across multiple signals\n- Assess confidence based on source quality and corroboration\n- Identify what the company is planning, not just what happened",
      "permission": {
        "edit": "deny",
        "bash": "deny",
        "read": "allow",
        "grep": "allow",
        "glob": "allow"
      }
    }
  }
}
```

### Code Reviewer Agent

Reviews code for security, performance, and adherence to The Tell's standards.

```json
{
  "agent": {
    "code-reviewer": {
      "description": "Reviews code for security vulnerabilities, performance issues, and best practices",
      "mode": "subagent",
      "model": "thetell/qwen3.6-plus",
      "temperature": 0.2,
      "prompt": "You are a senior code reviewer for The Tell, an AI-powered corporate intelligence platform.\n\nReview code for:\n\n1. **Security vulnerabilities**\n   - SQL injection (Prisma queries are safe, but check raw SQL)\n   - XSS (dangerouslySetInnerHTML without sanitization)\n   - API key exposure in logs or client-side code\n   - Missing authentication/authorization checks\n\n2. **Performance issues**\n   - N+1 queries in Prisma\n   - Unnecessary re-renders in React components\n   - Missing database indexes\n   - Large bundle sizes\n\n3. **Best practices**\n   - TypeScript strict mode compliance\n   - Proper error handling\n   - Test coverage for critical paths\n   - Adherence to design system (shadcn/ui, Tailwind tokens)\n\n4. **The Tell-specific patterns**\n   - Signal analysis pipeline correctness\n   - Dual-agent system (Analyst vs Gossip Girl) usage\n   - Scraper rate limiting and polite scraping\n   - Confidence scoring accuracy\n\nProvide specific, actionable feedback with code examples.",
      "permission": {
        "edit": "deny",
        "bash": {
          "*": "deny",
          "git diff": "allow",
          "git log*": "allow",
          "grep *": "allow",
          "pnpm run typecheck": "allow",
          "pnpm run lint": "allow"
        }
      }
    }
  }
}
```

### Debug Agent

Focused on investigating issues in The Tell's signal pipeline.

```json
{
  "agent": {
    "debug-agent": {
      "description": "Investigates issues in The Tell's signal pipeline, scrapers, and analysis engine",
      "mode": "subagent",
      "model": "thetell/qwen3.6-plus",
      "prompt": "You are a debug specialist for The Tell. You investigate issues in:\n\n1. **Signal Pipeline**\n   - URL discovery failures\n   - Scraper errors (rate limiting, parsing, HTTP errors)\n   - Analysis pipeline issues (LLM provider, prompt construction)\n   - Article generation failures\n\n2. **Database Issues**\n   - Query performance (N+1, missing indexes)\n   - Data integrity (orphaned records, missing relations)\n   - Migration failures\n\n3. **Background Jobs**\n   - Inngest job failures\n   - Job scheduling issues\n   - Event processing errors\n\n4. **Frontend Issues**\n   - React rendering problems\n   - API route errors\n   - Authentication/authorization failures\n\nDebugging workflow:\n1. Reproduce the issue\n2. Check logs (Inngest dashboard, Next.js console)\n3. Trace data flow through the pipeline\n4. Identify root cause\n5. Propose fix with test coverage\n\nUse Prisma MCP to query the database. Check Inngest dashboard at http://localhost:8288.",
      "permission": {
        "edit": "ask",
        "bash": {
          "*": "ask",
          "pnpm *": "allow",
          "docker *": "allow",
          "git *": "allow"
        },
        "read": "allow",
        "grep": "allow",
        "glob": "allow"
      }
    }
  }
}
```

## Custom Tools for The Tell

### Query Signals Tool

Create `.opencode/tools/query-signals.ts`:

```typescript
import { tool } from "@opencode-ai/plugin"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export default tool({
  description: "Query signals from The Tell database with optional filters",
  args: {
    companyId: tool.schema.string().optional().describe("Filter by company ID"),
    sourceType: tool.schema.enum(["NEWS", "FILING", "TRANSCRIPT", "SOCIAL", "BLOG", "JOB_POSTING"]).optional(),
    limit: tool.schema.number().default(10).describe("Max results (1-100)"),
    includeAnalyses: tool.schema.boolean().default(true).describe("Include AI analyses"),
  },
  async execute(args) {
    const signals = await prisma.signal.findMany({
      where: {
        ...(args.companyId && { companyId: args.companyId }),
        ...(args.sourceType && { sourceType: args.sourceType }),
      },
      take: Math.min(args.limit, 100),
      orderBy: { createdAt: "desc" },
      include: {
        analyses: args.includeAnalyses ? {
          take: 3,
          orderBy: { createdAt: "desc" },
        } : false,
        company: true,
      },
    })

    return JSON.stringify(signals, null, 2)
  },
})
```

### Analyze Signal Tool

Create `.opencode/tools/analyze-signal.ts`:

```typescript
import { tool } from "@opencode-ai/plugin"
import { analyzeSignalWithAgent } from "@/lib/ai/agent/pipeline"

export default tool({
  description: "Run AI analysis on a signal using The Tell's dual-agent system",
  args: {
    signalId: tool.schema.string().describe("Signal ID to analyze"),
    agent: tool.schema.enum(["ANALYST", "GOSSIP_GIRL"]).default("ANALYST"),
  },
  async execute(args) {
    try {
      const result = await analyzeSignalWithAgent(args.signalId, args.agent)
      
      return JSON.stringify({
        success: true,
        analysis: {
          facts: result.facts,
          sentiment: result.sentiment,
          themes: result.themes,
          confidence: result.confidence,
          headline: result.headline,
        },
      }, null, 2)
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }, null, 2)
    }
  },
})
```

### Check Scraper Health Tool

Create `.opencode/tools/check-scrapers.ts`:

```typescript
import { tool } from "@opencode-ai/plugin"
import { scraperRegistry } from "@/lib/scraping/registry"
import { scrapeCache } from "@/lib/scraping/cache"

export default tool({
  description: "Check health and performance of all scrapers",
  args: {
    scraperName: tool.schema.string().optional().describe("Check specific scraper (optional)"),
  },
  async execute(args) {
    const scrapers = scraperRegistry.getAll()
    const results = []

    for (const scraper of scrapers) {
      if (args.scraperName && scraper.name !== args.scraperName) {
        continue
      }

      const stats = await scrapeCache.getStats(scraper.name)
      
      results.push({
        name: scraper.name,
        enabled: scraper.enabled,
        stats: {
          totalRequests: stats.totalRequests,
          cacheHits: stats.cacheHits,
          cacheMisses: stats.cacheMisses,
          hitRate: stats.cacheHits / stats.totalRequests,
          avgResponseTime: stats.avgResponseTime,
          errors: stats.errors,
        },
      })
    }

    return JSON.stringify(results, null, 2)
  },
})
```

## Plugins for The Tell

### Analytics Plugin

Tracks OpenCode usage and session analytics.

Create `.opencode/plugins/analytics.ts`:

```typescript
import type { Plugin } from "@opencode-ai/plugin"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const AnalyticsPlugin: Plugin = async ({ client, project }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.completed") {
        // Track session completion
        await prisma.opencodeSession.create({
          data: {
            sessionId: event.properties.sessionID,
            projectId: project.id,
            completedAt: new Date(),
            status: "completed",
          },
        })
      }
    },

    "chat.message": async (input, output) => {
      // Log prompts for audit (be careful with PII)
      const promptPreview = input.parts[0].text.substring(0, 100)
      console.log(`[OpenCode Audit] Prompt: ${promptPreview}...`)
      return output
    },

    "tool.execute.after": async (output, context) => {
      // Track tool usage
      console.log(`[OpenCode] Tool executed: ${context.tool}`)
      return output
    },
  }
}
```

### Signal Context Plugin

Injects The Tell context into OpenCode sessions.

Create `.opencode/plugins/signal-context.ts`:

```typescript
import type { Plugin } from "@opencode-ai/plugin"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const SignalContextPlugin: Plugin = async ({ client }) => {
  return {
    "chat.message": async (input, output) => {
      // Check if prompt mentions signal analysis
      const promptText = input.parts[0].text.toLowerCase()
      
      if (promptText.includes("signal") || promptText.includes("analyze")) {
        // Fetch recent signals for context
        const recentSignals = await prisma.signal.findMany({
          take: 5,
          orderBy: { createdAt: "desc" },
          include: { company: true },
        })

        const context = `\n\nRecent signals in The Tell:\n${
          recentSignals.map(s => `- ${s.title} (${s.company?.name || "Unknown"})`).join("\n")
        }`

        // Inject context
        input.parts[0].text += context
      }

      return output
    },
  }
}
```

Register in `opencode.json`:

```json
{
  "plugin": [
    "./.opencode/plugins/analytics.ts",
    "./.opencode/plugins/signal-context.ts"
  ]
}
```

## Integration Examples

### Automated Signal Analysis Workflow

```typescript
import { createOpencode } from "@opencode-ai/sdk"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function automatedSignalAnalysis() {
  const { client, server } = await createOpencode({
    config: {
      model: "thetell/qwen3-coder-next",
    },
  })

  try {
    // Get unanalyzed signals
    const signals = await prisma.signal.findMany({
      where: {
        analyses: { none: {} },
      },
      take: 10,
    })

    // Create analysis session
    const session = await client.session.create({
      body: { title: "Automated Signal Analysis" },
    })

    // Analyze each signal
    for (const signal of signals) {
      const result = await client.session.prompt({
        path: { id: session.id },
        body: {
          parts: [{
            type: "text",
            text: `Analyze this signal:\n\nTitle: ${signal.title}\nContent: ${signal.rawContent}`,
          }],
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
                themes: { type: "array", items: { type: "string" } },
              },
              required: ["facts", "sentiment"],
            },
          },
        },
      })

      const analysis = result.data.info.structured_output

      // Save analysis to database
      await prisma.analysis.create({
        data: {
          signalId: signal.id,
          facts: analysis.facts,
          sentiment: analysis.sentiment,
          themes: analysis.themes,
          confidence: 0.85, // Calculate from analysis
          agent: "ANALYST",
        },
      })
    }

    console.log(`Analyzed ${signals.length} signals`)
  } finally {
    server.close()
  }
}
```

### Real-Time Signal Monitoring

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

async function monitorSignalPipeline() {
  const client = createOpencodeClient({
    baseUrl: "http://localhost:4096",
  })

  const events = await client.event.subscribe()

  for await (const event of events.stream) {
    if (event.type === "tool.execute.after") {
      const toolName = event.properties.tool

      if (toolName === "analyze-signal") {
        console.log("Signal analyzed:", event.properties.output)
        
        // Trigger follow-up actions
        await triggerArticleGeneration(event.properties.signalId)
      }
    }
  }
}
```

## Environment Variables

Add to `.env.local`:

```bash
# OpenCode SDK
OPENCODE_API_KEY=your-api-key
OPENCODE_BASE_URL=http://localhost:4096

# For custom tools
THE_TELL_API_KEY=your-api-key
```

## Testing

### Test Custom Tools

```typescript
import { describe, it, expect } from "vitest"
import querySignalsTool from "../.opencode/tools/query-signals"

describe("query-signals tool", () => {
  it("returns signals with default limit", async () => {
    const result = await querySignalsTool.execute({ limit: 10 })
    const signals = JSON.parse(result)
    
    expect(signals).toBeInstanceOf(Array)
    expect(signals.length).toBeLessThanOrEqual(10)
  })

  it("filters by company ID", async () => {
    const result = await querySignalsTool.execute({
      companyId: "test-company-id",
      limit: 5,
    })
    const signals = JSON.parse(result)
    
    expect(signals.every((s: any) => s.companyId === "test-company-id")).toBe(true)
  })
})
```

### Test Plugins

```typescript
import { describe, it, expect, vi } from "vitest"
import { AnalyticsPlugin } from "../.opencode/plugins/analytics"

describe("AnalyticsPlugin", () => {
  it("tracks session completion", async () => {
    const plugin = await AnalyticsPlugin({
      client: {} as any,
      project: { id: "test-project" },
      directory: "/test",
      worktree: "/test",
      $: {} as any,
    })

    const mockCreate = vi.fn()
    vi.mocked(prisma.opencodeSession.create).mockImplementation(mockCreate)

    await plugin.event!({
      event: {
        type: "session.completed",
        properties: { sessionID: "test-session" },
      },
    })

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: "test-session",
        projectId: "test-project",
      }),
    })
  })
})
```

## Troubleshooting

### Server Won't Start

```bash
# Check if port is in use
netstat -ano | findstr :4096

# Kill process on port
taskkill /PID <PID> /F

# Restart with different port
const { client, server } = await createOpencode({ port: 4097 })
```

### Structured Output Fails

```typescript
// Increase retry count
const result = await client.session.prompt({
  body: {
    format: {
      type: "json_schema",
      schema: { /* ... */ },
      retryCount: 5, // Increase retries
    },
  },
})
```

### MCP Servers Not Loading

```bash
# Check MCP server status
opencode mcp list

# Authenticate if needed
opencode mcp auth github

# Restart OpenCode to reload MCP servers
```

## Resources

- **OpenCode Docs**: https://opencode.ai/docs/
- **SDK GitHub**: https://github.com/sst/opencode-sdk-js
- **Plugin Examples**: https://github.com/sst/opencode/tree/main/examples/plugins
- **The Tell AGENTS.md**: See `opencode/AGENTS.md` for debug agent context
