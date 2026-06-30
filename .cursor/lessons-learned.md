# Lessons Learned

This file tracks mistakes, anti-patterns and lessons learned during development.
Updated by the continuous-improvement rule after debugging failures or receiving code review feedback.

---

<!-- Add entries below in the format:
## [Date] - [Brief Title]

- **Mistake**: What happened
- **Root cause**: Why it happened
- **Rule/Skill updated**: Which file was changed
- **Pattern added**: One-line description of the new guidance
-->

## 2026-06-19 - Test Credential Confusion (Corrected)

- **Mistake**: Initially wrote rules saying tests should NEVER use real credentials or database. User clarified the opposite: agents should USE the real local database and seeded credentials for testing.
- **Root cause**: Misunderstood the testing philosophy. The project uses a local Docker database with seeded test data specifically for testing. Agents were confused about whether to mock everything or use the real local resources.
- **Rule/Skill updated**: `environment.mdc`, `testing.mdc`, `testing-conventions.mdc`
- **Pattern added**: Tests SHOULD use the local database and seeded credentials (admin@thetell.com / password123). Only mock external services (LLM APIs, HTTP requests). The local database is the test database.

## 2026-06-22 - Work in Batches Efficiency Pattern

- **Mistake**: Agents frequently explored the codebase one file at a time (reading AGENTS.md, then searching for feature files, then reading more files) across multiple turns. even when information was already available in the first read.
- **Root cause**: Not following the decision tree in agentic-reasoning-guardrails.mdc that codebase-navigation.mdc. Agents defaulted to habitual file-by-file exploration instead of using the structured navigation approach (Module Map → features-built.md → targeted reads).
- **Rule/Skill updated**: `agentic-reasoning-guardrails.mdc` (Rule 7: Escalation protocol, added cross-reference to `codebase-navigation.mdc` in decision tree), `codebase-navigation.mdc` (new rule with full navigation decision tree)
- **Pattern added**: Before reading files or using Grep/Glob, agents MUST check: (1) Can information be answered by AGENTS.md Module Map or features-built.md? → Read those docs first. (2) Do I need multiple files? → Read ALL in parallel. (3) Only if not found, proceed to Grep/Glob/Read. Never skip levels in the decision tree.

## 2026-06-22 - Navigation Decision Tree Integration
- **Mistake**: Agents would read AGENTS.md to check structure, but then immediately proceed to file-level operations without following the structured navigation hierarchy.
- **Root cause**: Missing explicit guidance in decision tree about when to escalate after Module Map/features-built.md checks fail. Agents had no clear trigger to stop file-level exploration.
- **Rule/Skill updated**: Added cross-reference in `agentic-reasoning-guardrails.mdc` decision tree pointing to `codebase-navigation.mdc` for the full navigation hierarchy.
- **Pattern added**: The `agentic-reasoning-guardrails.mdc` decision tree now explicitly references `codebase-navigation.mdc`: "See `codebase-navigation.mdc` for the full navigation decision tree." This creates a clear escalation path when Module Map doesn't answer the query.

---

## 2026-06-22 - Memory Leak Investigation (Compiled from Agent Sessions)

The following lessons were compiled from three agent sessions that investigated memory leaks:
- **Jun 18** ([NLP integration](0e06c771-5cba-4ae5-85ab-1574fad4f62d)) — built the NLP layer, discovered memory issues during implementation
- **Jun 19** ([deep bug scan](951d8fc5-0208-4cfd-aa5a-3509452ea5c9)) — 4-round bug audit finding 31 issues including security and resource leaks
- **Jun 22** ([memory leak fix](01489957-b941-4939-b75a-c232eca47f68)) — dedicated memory profiling and fix session after dev server grew from 7 GB to 15 GB

### Issue 1: NLP Tensor Memory Leaks (CRITICAL)

- **Mistake**: All 5 NLP consumers (embedding-generator, sentiment-classifier, entity-extractor, quality-gate, language-detector) created Tensor objects from Transformers.js but never called `.dispose()`. WASM memory grew monotonically with every inference.
- **Root cause**: Transformers.js returns Tensor objects backed by WebAssembly memory. Without explicit `.dispose()`, the WASM heap is never freed.
- **Rule/Skill updated**: `src/lib/nlp/*.ts` (all 5 consumers)
- **Pattern added**: Always wrap Transformers.js pipeline outputs in `try/finally` with `.dispose()`. Treat tensors like native memory allocations, not JS objects subject to GC.

```typescript
const output = await pipeline(input);
try {
  // extract data from output
} finally {
  if (output && typeof output.dispose === 'function') {
    output.dispose();
  }
}
```

### Issue 2: Idle Model Unloading Dead Code (CRITICAL)

- **Mistake**: `model-cache.ts` had a perfectly implemented `unloadIdleModels()` function with 30-minute TTL, but no code ever called it. Idle models accumulated in memory indefinitely.
- **Root cause**: Cleanup functions that are never called are as bad as no cleanup functions. The interval was never wired up at module initialization.
- **Rule/Skill updated**: `src/lib/nlp/model-cache.ts`, `src/lib/nlp/index.ts`
- **Pattern added**: Always wire up cleanup intervals at module load. Use `.unref()` on intervals to prevent keeping Node.js process alive.

```typescript
// In model-cache.ts
setInterval(unloadIdleModels, 5 * 60 * 1000).unref();

// Called at module load via index.ts barrel export
configureModelCache();
```

### Issue 3: React Component Memory Leaks (HIGH)

- **Mistake**: Multiple components made `fetch()` calls inside `useEffect` without `AbortController`, causing memory leaks and "Can't perform state update on unmounted component" warnings.
- **Root cause**: Missing cleanup functions in useEffect hooks, no abort signal for pending fetches, no mounted state tracking.
- **Rule/Skill updated**: `src/hooks/use-signals.ts`, `src/hooks/use-companies.ts`, `src/app/dashboard/articles/page.tsx`, `src/app/dashboard/inferences/inferences-client.tsx`, `src/components/dashboard/signal-status-monitor.tsx`
- **Pattern added**: Every `fetch()` in a component or hook needs an `AbortController` that is aborted on unmount. Every async callback that calls `setState` must check a `mountedRef` first.

```typescript
useEffect(() => {
  const mountedRef = { current: true };
  const controller = new AbortController();
  
  async function loadData() {
    const res = await fetch(url, { signal: controller.signal });
    if (mountedRef.current) setState(data);
  }
  
  loadData();
  return () => {
    mountedRef.current = false;
    controller.abort();
  };
}, [url]);
```

### Issue 4: Rate Limiter Unbounded Map Growth (HIGH)

- **Mistake**: `src/lib/rate-limiter.ts` stored entries in a `Map` keyed by IP/session. The Map grew without bound — every unique visitor added an entry that was never cleaned up.
- **Root cause**: No eviction of expired entries, no hard cap on Map size.
- **Rule/Skill updated**: `src/lib/rate-limiter.ts`
- **Pattern added**: Any server-side Map/Set keyed by user/IP must have a hard cap and TTL-based eviction. Otherwise, long-running processes leak memory proportional to unique visitors.

### Issue 5: SSE Debug Stream Unclosed Connection (HIGH)

- **Mistake**: `src/app/api/v1/admin/debug/stream/route.ts` created a `ReadableStream` that proxied an upstream fetch response. When the client disconnected, the upstream fetch connection was never aborted, leaking the HTTP connection.
- **Root cause**: The `ReadableStream` had no `cancel()` handler to propagate cancellation to the upstream reader.
- **Rule/Skill updated**: `src/app/api/v1/admin/debug/stream/route.ts`
- **Pattern added**: When proxying streams, always implement the `cancel()` callback to abort upstream connections. Otherwise, client disconnects leak server-side HTTP connections.

### Issue 6: Debug Events Array Unbounded Accumulation (MEDIUM)

- **Mistake**: `src/app/dashboard/admin/debug/page.tsx` accumulated debug events in a client-side array with no cap. During long-running sessions, this array grew unbounded.
- **Root cause**: No maximum size limit on event accumulator.
- **Rule/Skill updated**: `src/app/dashboard/admin/debug/page.tsx`
- **Pattern added**: Any client-side event/log accumulator must have a hard cap. Use a circular buffer or trim-on-append pattern (e.g., MAX_EVENTS = 500).

### Issue 7: Fire-and-Forget Error Handling (HIGH)

- **Mistake**: Async operations in `src/app/api/v1/companies/route.ts` used fire-and-forget pattern without `.catch()` handlers, causing unhandled promise rejections.
- **Root cause**: Missing error handling on promises that weren't awaited.
- **Rule/Skill updated**: `src/app/api/v1/companies/route.ts`
- **Pattern added**: Always add `.catch()` to fire-and-forget promises. Use optional chaining for defensive property access.

### Issue 8: Next.js Turbopack Dev Server Memory Growth (OBSERVATION)

- **Mistake**: Next.js 16.2.9 dev server with Turbopack grew from 6.96 GB to 15 GB during extended session.
- **Root cause**: Turbopack cache accumulation in `.next/dev/cache/`, HMR state accumulation, module graph growth. This is expected Next.js dev behavior, not an application bug.
- **Rule/Skill updated**: N/A (expected behavior)
- **Pattern added**: Restart dev server periodically during long sessions. Monitor `.next` directory size. This is a known Next.js/Turbopack dev-mode behavior, not a production issue.

---

## 2026-06-22 - Memory Management Best Practices (Compiled)

Based on the memory leak investigation, these patterns should be followed to prevent future memory issues:

### Transformers.js / WASM Memory
1. **Always dispose Tensors** — wrap in `try/finally` with `.dispose()`
2. **Bound all in-memory model caches** — hard cap + LRU eviction + idle unloading + load dedup
3. **Wire up cleanup intervals at module load** — use `.unref()` to prevent keeping process alive

### React Components
4. **AbortController on every fetch in components** — abort on unmount
5. **mountedRef guard on all async setState** — prevent unmounted state updates
6. **Every useEffect with side effects needs cleanup** — timers, listeners, subscriptions

### Backend / API Routes
7. **Bound all rate-limiter Maps** — hard cap + TTL eviction (10K entries max)
8. **Implement `cancel()` on proxied ReadableStreams** — propagate to upstream
9. **Always add `.catch()` to fire-and-forget promises** — prevent unhandled rejections

### Client-Side State
10. **Cap client-side event arrays** — trim on append (e.g., MAX_EVENTS = 500)

### General
11. **Validate URLs against private IPs** — prevent SSRF via redirects
12. **Refresh JWT roles from DB** — never trust stale token claims
13. **Use `globalThis` pattern for singletons in Next.js** — survive hot-reload without duplicating instances
14. **Profile before and after fixes** — measure actual memory impact

### Patterns to Avoid
- Creating Tensor objects without disposal
- Defining cleanup functions but never calling them
- `useEffect` without cleanup for timers/listeners/subscriptions
- Fire-and-forget promises without error handlers
- Missing `AbortController` in fetch calls within effects
- Intervals without `.unref()` in Node.js
- Accessing properties without null checks in async callbacks
- `new Map()` or `new Set()` without size limits
- Caches that grow with unique keys but never evict

---

## 2026-06-23 - Browser Testing Skill Tool Alignment

- **Mistake**: The `browser-testing-workflows` skill referenced tools from Playwright MCP (`wait_for`, `list_network_requests`, `list_console_messages`, `resize_page`) and generic patterns that don't match the actual MCP tools available in this workspace.
- **Root cause**: The skill was written assuming multiple browser automation MCPs (Playwright, Chrome DevTools) would be available, but only `user-chrome-devtools` MCP is enabled. Tool names like `wait_for` don't exist in that MCP — the correct approach is `evaluate_script` with polling loops or `take_snapshot` to check state.
- **Rule/Skill updated**: `.cursor/skills/browser-testing-workflows/SKILL.md`
- **Pattern added**: Browser testing skills MUST only reference tools from MCPs that are actually enabled in the workspace. Check `mcps/` directory for available servers before writing tool invocations. The `user-chrome-devtools` MCP uses snake_case tool names (`navigate_page`, `take_snapshot`, `evaluate_script`, `click`, `fill`) accessed via `CallMcpTool`.

## 2026-06-23 - Comprehensive Skills & Rules Audit (Deprecated Patterns)

- **Mistake**: Multiple skills and rules contained deprecated or incorrect patterns that didn't match the actual codebase or current dependency versions. Issues included:
  1. **Prisma imports**: 7 files used `@/lib/prisma` instead of `@/lib/db` (data-layer.mdc, testing-conventions.mdc, layout-and-page-patterns.mdc, typescript-standards.mdc, nextjs-patterns.mdc)
  2. **Prisma types**: data-layer.mdc used `@/app/generated/prisma` instead of `@prisma/client`
  3. **Next.js 16 params**: api-design.mdc and api-design/SKILL.md used old `{ params: { id: string } }` pattern instead of `{ params: Promise<{ id: string }> }`
  4. **Middleware references**: environment.mdc and nextjs-patterns.mdc referenced `src/middleware.ts` instead of `src/proxy.ts`
  5. **Next.js version**: nextjs-patterns.mdc showed 16.2.6 instead of 16.2.9
  6. **NextAuth proxy pattern**: nextjs-auth.mdc had outdated proxy example that didn't match actual `authEdge` implementation
  7. **Duplicate content**: environment.mdc had duplicated "Admin Setup Script" and "Admin Access" sections

- **Root cause**: Skills and rules were written at different times without systematic verification against the actual codebase state. When code patterns evolved (e.g., middleware → proxy, Prisma import paths), the documentation wasn't updated consistently across all files.

- **Rules/Skills updated**: 
  - `.cursor/rules/data-layer.mdc` (Prisma imports, types, globs)
  - `.cursor/rules/testing-conventions.mdc` (Prisma imports)
  - `.cursor/rules/layout-and-page-patterns.mdc` (Prisma imports)
  - `.cursor/rules/typescript-standards.mdc` (Prisma imports)
  - `.cursor/rules/nextjs-patterns.mdc` (Prisma imports, version)
  - `.cursor/rules/environment.mdc` (proxy references, removed duplicates)
  - `.cursor/rules/api-design.mdc` (Next.js 16 params pattern)
  - `.cursor/rules/nextjs-auth.mdc` (proxy pattern with authEdge)
  - `.cursor/skills/api-design/SKILL.md` (Next.js 16 params pattern)

- **Pattern added**: When updating codebase patterns (imports, API changes, file renames), systematically audit ALL skills and rules that reference the old pattern. Use `package.json` as ground truth for dependency versions. Verify actual codebase implementation (e.g., `src/proxy.ts`, `src/lib/db.ts`) before documenting patterns. Cross-reference with grep to ensure consistency across all documentation files.

---

## 2026-06-23 - Debug Agent Session Tracking Failures

- **Mistake**: Debug agent UI showed multiple issues:
  1. Sessions stuck in "RUNNING" status for hours/days (4h, 13h, 1d old sessions)
  2. "Session status: busy/idle" appearing as chat messages in the message list
  3. "0 msgs" shown for all sessions despite actual activity
  4. Agent responses echoing user input instead of providing proper analysis

- **Root cause**: Three separate issues in the debug agent pipeline:
  1. **Stale sessions never marked complete**: The `session.idle` event from OpenCode triggers DB update, but if SSE connection drops or events are lost, sessions remain in "running" forever. No fallback mechanism to detect stale sessions.
  2. **Noisy system events rendered**: The `EventToMessageConverter` converted `session.status` events into visible chat messages ("Session status: busy"), which are internal state changes not useful to users.
  3. **Event count never incremented**: The `stream/route.ts` forwarded events to frontend but never updated `DebugSession.eventCount` in the database.

- **Files updated**:
  - `src/app/api/v1/admin/debug/stream/route.ts` (added eventCount increment on every forwarded event)
  - `src/lib/debug/event-to-message.ts` (suppressed session.status events, return null instead of creating system message)
  - `src/app/api/v1/admin/debug/status/route.ts` (added `markStaleSessions()` function, runs on every status check, marks sessions older than 30 minutes as "failed")

- **Pattern added**: 
  1. **Session lifecycle fallback**: Any system that relies on event-driven state transitions (e.g., "session.idle" → "completed") MUST have a fallback mechanism to detect stale states. Use periodic health checks to mark orphaned sessions.
  2. **Suppress internal events**: SSE-to-chat converters should filter out internal state changes (`session.status`, heartbeat events) that don't represent meaningful user-visible content.
  3. **Track forwarded events**: When proxying SSE events, increment counters in the database so the UI can show accurate statistics (message count, event count).

---

## 2026-06-25 - OpenCode Integration Removed

- **Change**: Removed all OpenCode integration from the project (debug agent backend, `.opencode/` tools/commands/agents, `opencode/` config, debug dashboard pages, API routes, `src/lib/debug/` library, Prisma `DebugSession` model, Cursor skill and rule).
- **Reason**: OpenCode was used as the debug agent backend but introduced complexity (stale SSE sessions, event conversion bugs, SDK dependency) without proportional value. The debug dashboard and pipeline orchestrator are no longer needed.
- **Note**: The stale-session bug documented in the 2026-06-23 entry ("Debug Agent Session Tracking Failures") is no longer relevant — the entire debug session system has been removed.

---

## 2026-06-24 - DeepAgent EventSource Error from Undeclared Variable

- **Mistake**: DeepAgent page showed EventSource `onerror` triggered with empty object `{}`. The SSE stream failed immediately after connection, causing the frontend to log "EventSource onerror triggered" with `readyState: 2` (CLOSED).
- **Root cause**: In `src/lib/deepagent/backend.ts`, the `contentFlattenMiddleware` used an undeclared variable `rebuilt` in the `wrapModelCall` handler. The middleware attempted to increment and reference `rebuilt++` on lines 545 and 549, but the variable was never declared, causing a `ReferenceError: rebuilt is not defined` at runtime. This error crashed the LangChain middleware during message serialization, propagating to the SSE stream as an immediate connection failure.
- **Files updated**:
  - `src/lib/deepagent/backend.ts` (removed undeclared `rebuilt` variable and its increment operations from the middleware)
- **Pattern added**: 
  1. **Declare all variables before use**: In middleware callbacks and complex nested functions, verify all referenced variables are declared in scope. ESLint `no-undef` rule should catch this, but dynamic code in callbacks can bypass static analysis.
  2. **Test SSE streams end-to-end**: SSE errors often manifest as generic `onerror` events with empty data. Always check server-side logs for the actual exception when debugging EventSource failures — the client-side error object is often unhelpful.
  3. **Use explicit ESLint disables for nested callbacks**: When ESLint warnings are suppressed for outer functions, nested callbacks may still trigger violations. Add explicit `// eslint-disable-next-line` comments at the nested level.

---

## 2026-06-25 - SentimentTrends Authentication Race Condition

- **Mistake**: SentimentTrends component logged `analytics.sentiment.fetch.error` with "Failed to fetch" message. Component fetched from `/api/v1/analytics/overview` immediately on mount without checking authentication status, receiving 401 Unauthorized from proxy.
- **Root cause**: The SentimentTrends Client Component used `useEffect` to fetch data on mount, but did not check `useSession()` status before making the request. The dashboard layout waited for `status === "loading"` to complete, but components inside tabs could mount and fetch before auth stabilized. The proxy (src/proxy.ts) intercepted `/api/v1/*` routes and returned 401 if `req.auth` was missing.
- **Files updated**:
  - `src/components/dashboard/sentiment-trends.tsx` (added `useSession()` hook, check `status === "authenticated"` before fetching, graceful handling of unauthenticated/loading states)
  - `docs/features-built.md` (updated Analytics Charts description to document auth check)
- **Pattern added**: 
  1. **Auth check before fetch in Client Components**: Any Client Component that fetches from authenticated API routes MUST use `useSession()` and check `status === "authenticated"` before calling `fetch()`. Never assume session is ready just because the component mounted.
  2. **Distinguish 401 from other fetch errors**: When `!res.ok`, check `res.status` explicitly. 401 Unauthorized is expected when unauthenticated and should show a friendly message ("Authentication required"), not a generic "Failed to fetch" error.
  3. **Add auth status to useEffect dependencies**: When auth status gates the fetch, include `status` in the dependency array so the effect re-runs when authentication state changes.
  4. **Graceful loading during auth checks**: Show loading state while `status === "loading"` and error message while `status === "unauthenticated"`. Don't attempt fetch until confirmed authenticated.

---

## 2026-06-26 - Inngest Agent Error Logging Lost Stack Traces

- **Mistake**: Inngest function error "Both agent analyses failed for signal cmqt4tran000c9glnmdjb5i8e" appeared in logs, but the catch blocks in `functions.ts` only captured `String(error)` which lost the full stack trace, error type, and context. This made debugging impossible — we couldn't tell if errors were OpenAI API failures, Zod validation errors, network timeouts, or other issues.
- **Root cause**: The error logging pattern used `String(error)` which only captures the error message, not the stack trace or error type. For structured errors like ZodError (with validation details) or OpenAI API errors (with status codes), this lost critical debugging context.
- **Files updated**:
  - `src/lib/inngest/functions.ts` (enhanced error logging to capture full error details)
- **Pattern added**:
  1. **Structured error logging**: When logging errors in catch blocks, extract `error.name`, `error.message`, `error.stack`, and error-specific properties (ZodError.issues, OpenAI.status/code) into a `Record<string, unknown>` object. Never use `String(error)` alone.
  2. **Error type detection**: Check `error.name === 'ZodError'` and `'issues' in error` before accessing Zod-specific properties. Check `error.constructor.name.includes('OpenAI')` for API errors.
  3. **Env var validation on error**: When provider initialization fails, log `!!process.env.API_KEY` and `!!process.env.BASE_URL` to diagnose missing credentials immediately.
  4. **Diagnostic scripts**: For complex pipelines (agent analysis, NLP layers), create standalone diagnostic scripts that can run outside the runtime to reproduce failures with full stack traces.

---

## 2026-06-26 - OpenAI Provider Credentials Not Available Outside Next.js Runtime

- **Mistake**: Standalone diagnostic scripts (`pnpm tsx debug-agent-pipeline.ts`) failed with "Missing credentials. Please pass an apiKey..." because environment variables from `.env.local` are only automatically loaded inside Next.js runtime, not in standalone Node.js scripts.
- **Root cause**: Next.js loads `.env.local` automatically during dev server startup, but `tsx` scripts run in plain Node.js context without this mechanism. The OpenAI SDK checks for `process.env.API_KEY ?? process.env.OPENAI_API_KEY`, which are undefined outside Next.js.
- **Pattern added**:
  1. **Run diagnostics inside Next.js**: For issues that might depend on Next.js environment loading (env vars, database connections, server components), run diagnostics from within the dev server context using API routes or Inngest functions, not standalone scripts.
  2. **Understand runtime boundaries**: `.env.local` → Next.js dev server (auto-loaded), `.env.local` → standalone tsx scripts (NOT auto-loaded), `.env.local` → tests (may need explicit dotenv loading depending on test framework).
  3. **Health checks for env vars**: Add endpoint or Inngest function that logs `hasApiKey`, `hasBaseUrl`, etc. when errors occur, to distinguish "missing credentials" from other failures.

---

## 2026-06-29 - NextAuth Cookie Name Mismatch Between Edge and Node Runtime

- **Mistake**: Login succeeded (credentials callback returned 200, session endpoint returned 200), but middleware redirected back to `/sign-in?callbackUrl=%2Fdashboard`. The session cookie was set but the edge middleware couldn't read it.
- **Root cause**: The main `auth.ts` configured the session cookie with name `next-auth.session-token`, but the edge middleware in `auth-edge.ts` used a separate NextAuth instance with the default cookie name `authjs.session-token`. When the edge middleware tried to decode the JWT, it looked for the wrong cookie name and found nothing, so it treated the request as unauthenticated.
- **Files updated**:
  - `src/lib/auth-edge.ts` (added matching `cookies.sessionToken` configuration with name `next-auth.session-token`)
- **Pattern added**:
  1. **Cookie names must match across all NextAuth instances**: When using multiple NextAuth configurations (e.g., one for Node runtime with Prisma, one for edge runtime without Prisma), both must configure the same cookie names. The edge middleware cannot read session cookies if the names differ.
  2. **Explicit cookie configuration for consistency**: Always set `cookies.sessionToken.name` explicitly in both `auth.ts` and `auth-edge.ts` to avoid relying on defaults. Use `next-auth.session-token` or `authjs.session-token` consistently across both.
  3. **Debug cookie issues with network inspector**: When login succeeds but middleware redirects, inspect the Set-Cookie header in the callback response and compare the cookie name to what the edge middleware expects. Mismatched names are a common cause of "login succeeds but session not recognized" bugs.