# Memory Leak Analysis Report

**Date:** 2026-06-26 (Updated)
**Analyst:** AI Agent (Systematic Debugging Protocol)

## Executive Summary

This analysis identified and fixed memory leaks in the application through a deep investigation. The fixes address server-side, client-side, and edge case memory management issues.

**Total Issues Fixed:** 8 (4 from initial analysis + 4 from deep investigation)

---

## Issues Fixed

### Initial Analysis Fixes

#### 1. eventBuffers Map Growing Without Bounds (Server-side) - CRITICAL

**File:** `src/app/api/v1/admin/deepagent/stream/route.ts`

**Fix:** Added TTL-based cleanup (10 minutes), periodic cleanup, and explicit cleanup on stream completion/error.

#### 2. use-deepagent-stream Ref Accumulation - MEDIUM

**File:** `src/hooks/use-deepagent-stream.ts`

**Fix:** Added explicit cleanup for all refs (`seenEventIdsRef`, `tasksRef`, `subagentsRef`, etc.) on unmount.

#### 3. setTimeout Leaks Without Cleanup - MEDIUM

**Files:** 5 files (pipeline-detail-client, copy-button, deep-agent-share-button, pipeline-chat-modal, share-button)

**Fix:** Added `useRef` for timeout tracking and cleanup on unmount.

#### 4. console.log/error Instead of Logger - MINOR

**Fix:** Replaced `console.log/error` with structured `logger` calls.

---

### Deep Investigation Fixes

#### 5. Approval Waiter Orphan Cleanup Incomplete - CRITICAL

**File:** `src/lib/deepagent/approval-waiter.ts`

**Issue:** The periodic cleanup only checked one direction (orphaned timeouts). Reverse orphan case (resolver exists but timeout cleared) left dangling resolvers.

**Fix:** Added bidirectional cleanup that checks both:
- Orphaned timeouts (timeout exists but no resolver)
- Orphaned resolvers (resolver exists but no timeout)

```typescript
// Check both directions - orphaned resolvers (no timeout)
for (const id of approvalResolvers.keys()) {
  if (!approvalTimeouts.has(id)) {
    approvalResolvers.delete(id);
  }
}

// Existing cleanup - orphaned timeouts (no resolver)
for (const id of approvalTimeouts.keys()) {
  if (!approvalResolvers.has(id)) {
    const timeout = approvalTimeouts.get(id);
    if (timeout) clearTimeout(timeout);
    approvalTimeouts.delete(id);
  }
}
```

#### 6. Rate Limiter Store Cleanup Timing - MEDIUM

**File:** `src/lib/rate-limiter.ts`

**Issue:** Lazy cleanup only ran during API calls. If API went idle, stale entries persisted indefinitely.

**Fix:** Added background cleanup interval that runs every 5 minutes regardless of API activity:

```typescript
if (typeof globalThis.setInterval !== "undefined") {
  const backgroundCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  
  if (typeof backgroundCleanupTimer.unref === "function") {
    backgroundCleanupTimer.unref();
  }
}
```

#### 7. Stream Route Abort Handling - MEDIUM

**File:** `src/app/api/v1/admin/deepagent/stream/route.ts`

**Issue:** If client disconnected before stream completed, event buffer could remain orphaned until TTL cleanup.

**Fix:** Added abort signal listener to clean up immediately on client disconnect:

```typescript
const abortHandler = () => {
  removeBuffer(sessionId);
  try {
    controller.close();
  } catch {
    // Controller may already be closed
  }
};

req.signal.addEventListener("abort", abortHandler);

// Remove listener on completion/error
req.signal.removeEventListener("abort", abortHandler);
```

#### 8. Event Handlers Without Mounted Guards - MEDIUM

**File:** `src/hooks/use-deepagent-stream.ts`

**Issue:** Events arriving after unmount started could call `onMessageUpdate` which attempts setState on unmounted component.

**Fix:** Added mounted guard to all event handlers:

```typescript
const mountedRef = useRef(true);

// In cleanup effect - set false first
useEffect(() => {
  return () => {
    mountedRef.current = false; // Prevents async callbacks
    cleanupEventSource();
    // ... other cleanup
  };
}, [cleanupEventSource]);

// In each event handler
eventSource.addEventListener("text", (event) => {
  if (!mountedRef.current) return; // Early exit
  // ... existing logic
});
```

---

## Files Modified

| File | Issues Fixed |
|------|--------------|
| `src/app/api/v1/admin/deepagent/stream/route.ts` | eventBuffers TTL + abort handling |
| `src/hooks/use-deepagent-stream.ts` | Ref cleanup + mounted guards |
| `src/lib/deepagent/approval-waiter.ts` | Bidirectional orphan cleanup |
| `src/lib/rate-limiter.ts` | Background cleanup interval |
| `src/app/dashboard/admin/operations/pipelines/[id]/pipeline-detail-client.tsx` | setTimeout cleanup |
| `src/app/dashboard/admin/deepagent/_components/copy-button.tsx` | setTimeout cleanup |
| `src/app/dashboard/admin/deepagent/_components/deep-agent-share-button.tsx` | setTimeout cleanup |
| `src/components/admin/pipeline-chat-modal.tsx` | setTimeout cleanup |
| `src/components/dashboard/share-button.tsx` | setTimeout cleanup |

---

## Patterns Verified as Clean

| Pattern | Location | Assessment |
|---------|----------|------------|
| NLP model cache | `src/lib/nlp/model-cache.ts` | Excellent - LRU + TTL + unref timer |
| Inngest jobs | `src/lib/inngest/*.ts` | Good - Uses Prisma persistence |
| AbortController cleanup | Most components | Good - Proper cleanup patterns |
| IntersectionObserver cleanup | DeepAgentMessageList | Good - disconnect on unmount |
| setInterval cleanup | Various dashboard clients | Good - clearInterval on unmount |

---

## Verification Results

- **Lint:** PASSED (all modified files)
- **TypeScript:** No new errors introduced
- **Build:** Pre-existing script errors block build (not from memory leak fixes)

---

## Recommendations

### Immediate
1. All identified issues have been fixed - deploy for testing

### Monitoring
1. Watch memory usage after deployment
2. Monitor `approval_waiter.cleanup.completed` logs for orphan cleanup activity
3. Track event buffer cleanup timing

### Long-term
1. Consider Redis-backed rate limiter for multi-instance deployments
2. Consider Redis-backed event buffers for DeepAgent stream reconnection
3. Add memory profiling to CI/CD pipeline