# OpenCode SDK API Reference

Complete API reference for `@opencode-ai/sdk` v1.x.

## Installation

```bash
pnpm add @opencode-ai/sdk
```

## Client Creation

### createOpencode()

Creates a complete OpenCode instance with both server and client.

```typescript
import { createOpencode } from "@opencode-ai/sdk"

const { client, server } = await createOpencode(options?)
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `hostname` | `string` | `"127.0.0.1"` | Server hostname |
| `port` | `number` | `4096` | Server port |
| `signal` | `AbortSignal` | `undefined` | Abort signal for cancellation |
| `timeout` | `number` | `5000` | Timeout in ms for server start |
| `config` | `Config` | `{}` | Configuration object |

**Returns:** `{ client: Client, server: Server }`

**Example:**
```typescript
const { client, server } = await createOpencode({
  hostname: "127.0.0.1",
  port: 4096,
  timeout: 10000,
  config: {
    model: "thetell/qwen3-coder-next",
  },
})

console.log(`Server running at ${server.url}`)

// Use client...

server.close()
```

### createOpencodeClient()

Creates a client-only instance to connect to a running server.

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient(options)
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | `"http://localhost:4096"` | URL of the server |
| `fetch` | `function` | `globalThis.fetch` | Custom fetch implementation |
| `parseAs` | `string` | `"auto"` | Response parsing method |
| `responseStyle` | `string` | `"fields"` | Return style: `"data"` or `"fields"` |
| `throwOnError` | `boolean` | `false` | Throw errors instead of return |

**Example:**
```typescript
const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
})
```

## Global API

### global.health()

Check server health and version.

```typescript
const health = await client.global.health()
// { healthy: true, version: "1.0.0" }
```

## App API

### app.log()

Write a log entry.

```typescript
await client.app.log({
  body: {
    service: "my-app",
    level: "info",
    message: "Operation completed",
  },
})
```

### app.agents()

List all available agents.

```typescript
const agents = await client.app.agents()
// Agent[]
```

## Project API

### project.list()

List all projects.

```typescript
const projects = await client.project.list()
// Project[]
```

### project.current()

Get current project.

```typescript
const current = await client.project.current()
// Project
```

## Config API

### config.get()

Get config info.

```typescript
const config = await client.config.get()
// Config
```

### config.providers()

List providers and default models.

```typescript
const { providers, default: defaults } = await client.config.providers()
// { providers: Provider[], default: { [key: string]: string } }
```

## Session API

### session.list()

List all sessions.

```typescript
const sessions = await client.session.list()
// Session[]
```

### session.get()

Get a specific session.

```typescript
const session = await client.session.get({ path: { id: sessionId } })
// Session
```

### session.create()

Create a new session.

```typescript
const session = await client.session.create({
  body: { title: "My Session" },
})
// Session
```

### session.delete()

Delete a session.

```typescript
const deleted = await client.session.delete({ path: { id: sessionId } })
// boolean
```

### session.update()

Update session properties.

```typescript
const updated = await client.session.update({
  path: { id: sessionId },
  body: { title: "Updated Title" },
})
// Session
```

### session.children()

List child sessions.

```typescript
const children = await client.session.children({ path: { id: sessionId } })
// Session[]
```

### session.init()

Analyze app and create AGENTS.md.

```typescript
const created = await client.session.init({ path: { id: sessionId }, body: {} })
// boolean
```

### session.abort()

Abort a running session.

```typescript
const aborted = await client.session.abort({ path: { id: sessionId } })
// boolean
```

### session.share()

Share a session and get a shareable URL.

```typescript
const shared = await client.session.share({ path: { id: sessionId } })
// Session with shareUrl
```

### session.unshare()

Unshare a session.

```typescript
const unshared = await client.session.unshare({ path: { id: sessionId } })
// Session
```

### session.summarize()

Summarize a session.

```typescript
const summarized = await client.session.summarize({
  path: { id: sessionId },
  body: {},
})
// boolean
```

### session.messages()

List all messages in a session.

```typescript
const messages = await client.session.messages({ path: { id: sessionId } })
// { info: Message, parts: Part[] }[]
```

### session.message()

Get a specific message.

```typescript
const message = await client.session.message({
  path: { id: sessionId, messageId },
})
// { info: Message, parts: Part[] }
```

### session.prompt()

Send a prompt message to a session.

```typescript
const result = await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts: [{ type: "text", text: "Hello!" }],
    model: {
      providerID: "thetell",
      modelID: "qwen3-coder-next",
    },
  },
})
// AssistantMessage
```

**Options:**
- `noReply: true` - Inject context without triggering AI response (returns UserMessage)
- `format` - Structured output format (see Structured Output section)

### session.command()

Send a command to a session.

```typescript
const result = await client.session.command({
  path: { id: sessionId },
  body: { command: "/help" },
})
// { info: AssistantMessage, parts: Part[] }
```

### session.shell()

Run a shell command in the session context.

```typescript
const result = await client.session.shell({
  path: { id: sessionId },
  body: { command: "ls -la" },
})
// AssistantMessage
```

### session.revert()

Revert a message.

```typescript
const reverted = await client.session.revert({
  path: { id: sessionId },
  body: { messageId },
})
// Session
```

### session.unrevert()

Restore reverted messages.

```typescript
const restored = await client.session.unrevert({ path: { id: sessionId } })
// Session
```

## File API

### file.read()

Read a file.

```typescript
const content = await client.file.read({
  query: { path: "src/index.ts" },
})
// { type: "raw" | "patch", content: string }
```

### file.status()

Get status for tracked files.

```typescript
const files = await client.file.status()
// File[]
```

## Find API

### find.text()

Search for text in files.

```typescript
const results = await client.find.text({
  query: { pattern: "function.*opencode" },
})
// Array of match objects with path, lines, line_number, absolute_offset, submatches
```

### find.files()

Find files and directories by name.

```typescript
const files = await client.find.files({
  query: {
    query: "*.ts",
    type: "file",
    limit: 50,
  },
})
// string[]
```

**Query options:**
- `type`: `"file"` or `"directory"`
- `directory`: Override the project root for the search
- `limit`: Max results (1-200)

### find.symbols()

Find workspace symbols (functions, classes, etc.).

```typescript
const symbols = await client.find.symbols({
  query: { query: "analyzeSignal" },
})
// Symbol[]
```

## Event API

### event.subscribe()

Subscribe to server-sent events stream.

```typescript
const events = await client.event.subscribe()

for await (const event of events.stream) {
  console.log("Event:", event.type, event.properties)
}
```

**Event types:**
- `session.created` - Session created
- `session.updated` - Session updated
- `session.idle` - Session completed
- `session.deleted` - Session deleted
- `message.created` - Message created
- `message.updated` - Message updated

## TUI API

### tui.appendPrompt()

Append text to the prompt.

```typescript
await client.tui.appendPrompt({
  body: { text: "Add this to prompt" },
})
```

### tui.submitPrompt()

Submit the current prompt.

```typescript
await client.tui.submitPrompt()
```

### tui.clearPrompt()

Clear the prompt.

```typescript
await client.tui.clearPrompt()
```

### tui.openHelp()

Open the help dialog.

```typescript
await client.tui.openHelp()
```

### tui.openSessions()

Open the session selector.

```typescript
await client.tui.openSessions()
```

### tui.openThemes()

Open the theme selector.

```typescript
await client.tui.openThemes()
```

### tui.openModels()

Open the model selector.

```typescript
await client.tui.openModels()
```

### tui.executeCommand()

Execute a command.

```typescript
await client.tui.executeCommand({
  body: { command: "/help" },
})
```

### tui.showToast()

Show toast notification.

```typescript
await client.tui.showToast({
  body: {
    message: "Task completed",
    variant: "success",
  },
})
```

## Auth API

### auth.set()

Set authentication credentials.

```typescript
await client.auth.set({
  path: { id: "anthropic" },
  body: {
    type: "api",
    key: "your-api-key",
  },
})
```

## Structured Output

Request structured JSON output from the model.

```typescript
const result = await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts: [{ type: "text", text: "Analyze this code" }],
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          languages: {
            type: "array",
            items: { type: "string" },
          },
          frameworks: {
            type: "array",
            items: { type: "string" },
          },
          complexity: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
        },
        required: ["languages", "complexity"],
      },
      retryCount: 2,
    },
  },
})

// Access structured output
const data = result.data.info.structured_output
// { languages: ["TypeScript"], frameworks: ["Next.js"], complexity: "medium" }
```

**Format options:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"json_schema"` | Specifies JSON schema mode |
| `schema` | `object` | JSON Schema object defining the output structure |
| `retryCount` | `number` | Number of validation retries (default: 2) |

**Error handling:**

```typescript
if (result.data.info.error?.name === "StructuredOutputError") {
  console.error("Failed to produce structured output:", result.data.info.error.message)
  console.error("Attempts:", result.data.info.error.retries)
}
```

## TypeScript Types

Import types directly:

```typescript
import type {
  Session,
  Message,
  Part,
  Config,
  Provider,
  Project,
  File,
  Symbol,
} from "@opencode-ai/sdk"
```

All types are generated from the server's OpenAPI specification.

## Error Handling

### SDK Errors

```typescript
try {
  await client.session.get({ path: { id: "invalid" } })
} catch (error) {
  console.error("Error:", (error as Error).message)
  console.error("Status:", error.status)
}
```

### Common Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad request |
| 401 | Unauthorized |
| 404 | Resource not found |
| 500 | Server error |

## Best Practices

### 1. Always Close Server

```typescript
const { client, server } = await createOpencode()
try {
  // Use client
} finally {
  server.close()
}
```

### 2. Handle Structured Output Errors

```typescript
const result = await client.session.prompt({ /* ... */ })

if (result.data.info.error) {
  throw new Error(`AI error: ${result.data.info.error.message}`)
}

if (!result.data.info.structured_output) {
  throw new Error("No structured output returned")
}
```

### 3. Use Event Streams Carefully

```typescript
const events = await client.event.subscribe()

try {
  for await (const event of events.stream) {
    // Handle events
  }
} catch (error) {
  console.error("Stream error:", error)
  // Implement reconnection logic
}
```

### 4. Validate Structured Output

```typescript
import { z } from "zod"

const Schema = z.object({
  // Your schema
})

const result = await client.session.prompt({ /* ... */ })
const parsed = Schema.safeParse(result.data.info.structured_output)

if (!parsed.success) {
  console.error("Validation failed:", parsed.error)
  return null
}
```

### 5. Use Client-Only for Existing Servers

```typescript
// If server is already running
const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
})
```

## Performance Tips

### Parallel Operations

```typescript
// Create multiple sessions in parallel
const sessions = await Promise.all(
  Array.from({ length: 5 }, () =>
    client.session.create({ body: { title: "Session" } })
  )
)
```

### Batch File Operations

```typescript
// Read multiple files in parallel
const files = await Promise.all(
  filePaths.map(path => client.file.read({ query: { path } }))
)
```

### Efficient Event Handling

```typescript
const events = await client.event.subscribe()

// Filter events by type
for await (const event of events.stream) {
  if (event.type === "session.updated") {
    // Handle only session updates
  }
}
```
