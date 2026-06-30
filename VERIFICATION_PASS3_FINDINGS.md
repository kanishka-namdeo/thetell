# Pass 3 Verification Sweep - Remaining Issues

**Date**: 2026-06-27  
**Scope**: Final verification after Pass 1-2 fixes  
**Focus Areas**: Scrapers, enrichment, Reddit, API routes, auth, error handling, memory patterns

---

## Critical Issues

### 1. [BUG] JSON repair regex corrupts values with apostrophes
- **File**: `src/lib/ai/provider.ts`
- **Lines**: L90
- **Severity**: **High**
- **Type**: Logic bug / Data corruption
- **Description**: The `tryParseJSON()` function attempts to repair malformed JSON from LLM responses by replacing all single quotes with double quotes. This corrupts string values containing apostrophes (e.g., `"it's true"` becomes `"it"s true"`), causing parse failures.
- **Evidence**:
```typescript
// Line 90
fixed = fixed.replace(/'/g, '"');  // Replaces ALL single quotes
```
- **Impact**: Every LLM call returning JSON with natural language containing contractions or possessives (e.g., "company's revenue", "it's growing") will fail to parse and fall through to error handler.
- **Suggested fix**: Remove this regex or restrict it to only convert single-quoted keys, not values. Example:
```typescript
// Only convert single-quoted keys (not values)
fixed = fixed.replace(/'([^']+)':/g, '"$1":');
```

---

## Medium Severity Issues

### 2. [BUG] Public cluster/inference pages missing from middleware allowlist
- **File**: `src/proxy.ts`
- **Lines**: L15-L18
- **Severity**: Medium
- **Type**: Auth gap / Inconsistency
- **Description**: `PUBLIC_PAGE_PATTERNS` only includes `/signals/[id]` and `/articles/[id]`, but the app has public pages at `/clusters/[id]` and `/inferences/[id]` (confirmed by glob search). These pages are in the `(public)` route group and render without auth, but any client-side data fetching to `/api/v1/` endpoints would be blocked for unauthenticated users.
- **Evidence**:
```typescript
// proxy.ts - only 2 patterns
const PUBLIC_PAGE_PATTERNS = [
  /^\/signals\/[^/]+$/,
  /^\/articles\/[^/]+$/,
];

// But these public pages exist:
// src/app/(public)/clusters/[id]/page.tsx
// src/app/(public)/inferences/[id]/page.tsx
```
- **Suggested fix**: Add patterns for clusters and inferences:
```typescript
const PUBLIC_PAGE_PATTERNS = [
  /^\/signals\/[^/]+$/,
  /^\/articles\/[^/]+$/,
  /^\/clusters\/[^/]+$/,
  /^\/inferences\/[^/]+$/,
];
```

### 3. [BUG] RSS scraper has no cap on parallel full-article fetches
- **File**: `src/lib/scraping/rss-scraper.ts`
- **Lines**: L99-L123
- **Severity**: Medium
- **Type**: Rate limiting bypass / Resource exhaustion
- **Description**: `enrichWithFullArticles()` uses `Promise.all()` to fetch all short-content articles in parallel. While the `RateLimiter` serializes requests via a promise chain, there's no limit on how many articles are fetched. A feed with 100 short items will trigger 100 sequential fetches, potentially overwhelming the target server and causing timeouts.
- **Evidence**:
```typescript
const fetchPromises = itemsToFetch.map(async (item) => {
  const html = await this.fetch(item.link);
  // ...
});
await Promise.all(fetchPromises);  // No limit on itemsToFetch.length
```
- **Suggested fix**: Add a cap:
```typescript
const MAX_FULL_ARTICLES = 10;
const itemsToFetch = metadata.items
  .filter(item => item.content.length < CONTENT_THRESHOLD && item.link)
  .slice(0, MAX_FULL_ARTICLES);
```

### 4. [BUG] Silent error swallowing in correlation route
- **File**: `src/app/api/v1/admin/correlation/run/route.ts`
- **Lines**: L304-L306, L580-L582, L701-L703, L705-L707
- **Severity**: Medium
- **Type**: Error handling gap
- **Description**: Multiple `catch {}` blocks with no logging silently swallow errors during signal-theme connection, debate generation, and article generation. While some are intentionally non-fatal, the lack of logging makes debugging impossible.
- **Evidence**:
```typescript
// Line 304
} catch {
  // Signal may already be connected
}

// Line 580
} catch {
  // Continue with other inferences — debate failure is non-fatal
}

// Line 701, 705
} catch {
  // Continue on article generation failure
}
```
- **Suggested fix**: Add logging:
```typescript
} catch (error) {
  logger.debug("correlation.signal_theme_connect_failed", { 
    signalId, 
    themeId, 
    error: String(error) 
  });
}
```

---

## Low Severity Issues

### 5. [BUG] Website probe always returns "RSS" sourceType
- **File**: `src/lib/enrichment/website-probe.ts`
- **Lines**: L75
- **Severity**: Low
- **Type**: Logic bug
- **Description**: When detecting RSS/Atom feed links, the code checks `type.includes("atom")` but returns `"RSS"` for both branches of the ternary.
- **Evidence**:
```typescript
sourceType: type.includes("atom") ? "RSS" : "RSS",  // Always "RSS"
```
- **Suggested fix**: Differentiate:
```typescript
sourceType: type.includes("atom") ? "ATOM" : "RSS",
```

### 6. [BUG] JWT callback silently ignores DB failures
- **File**: `src/lib/auth.ts`
- **Lines**: L99-L101
- **Severity**: Low
- **Type**: Error handling gap / Security-adjacent
- **Description**: The JWT callback catches DB lookup errors silently. The comment says "graceful degradation" but a DB failure means a suspended user could retain access until token expires. This makes DB issues invisible in logs.
- **Evidence**:
```typescript
} catch {
  // If DB query fails, keep existing role (graceful degradation)
}
```
- **Suggested fix**: Add logging:
```typescript
} catch (error) {
  logger.warn("auth.jwt.db_lookup_failed", { 
    userId: token.userId, 
    error: String(error) 
  });
  // Keep existing role (graceful degradation)
}
```

### 7. [BUG] Null session check after requireAdmin
- **File**: `src/app/api/v1/admin/correlation/run/route.ts`
- **Lines**: L19-L28
- **Severity**: Low
- **Type**: Logic error (no security impact due to middleware)
- **Description**: `requireAdmin(session)` is called on line 20, but the null check `if (!session?.user)` is on line 26. If `session` is null, `requireAdmin` returns `false`, but the error message is "forbidden" (403) instead of "unauthorized" (401). The middleware already blocks unauthenticated requests to `/api/v1/admin/*`, so this has no security impact, but the error messages are misleading.
- **Evidence**:
```typescript
const session = await auth();
if (!requireAdmin(session)) {  // Called first - returns false if null
  return NextResponse.json(
    { error: "forbidden", message: "Admin access required" },
    { status: 403 }
  );
}
if (!session?.user) {  // Unreachable if session is null
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
```
- **Suggested fix**: Swap the order:
```typescript
const session = await auth();
if (!session?.user) {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
if (!requireAdmin(session)) {
  return NextResponse.json(
    { error: "forbidden", message: "Admin access required" },
    { status: 403 }
  );
}
```

---

## Summary Table

| # | Severity | Type | File | Issue |
|---|----------|------|------|-------|
| 1 | **High** | Logic bug | `provider.ts` L90 | Single-quote replacement corrupts JSON values with apostrophes |
| 2 | Medium | Auth gap | `proxy.ts` L15-18 | Cluster/inference public pages missing from middleware allowlist |
| 3 | Medium | Rate limiting | `rss-scraper.ts` L99-123 | No cap on parallel full-article fetches |
| 4 | Medium | Error handling | `correlation/run/route.ts` | Multiple `catch {}` blocks with no logging |
| 5 | Low | Logic bug | `website-probe.ts` L75 | `sourceType` always "RSS" (atom branch returns same value) |
| 6 | Low | Error handling | `auth.ts` L99 | Silent catch in JWT callback hides DB failures |
| 7 | Low | Logic error | `correlation/run/route.ts` L19-28 | `requireAdmin` before null session check (misleading error) |

---

## Recommendations

1. **Fix #1 immediately** — The JSON repair regex is actively corrupting LLM responses and causing parse failures. This affects every LLM call returning natural language with contractions.

2. **Address #2-4 in next sprint** — These are medium-severity issues affecting reliability and debuggability.

3. **Fix #5-7 when convenient** — Low-severity issues with minimal impact but easy to fix.

---

## Areas Verified (No Issues Found)

- **Scraper timeout handling**: All scrapers use `AbortSignal.timeout()` via `BaseScraper.fetch()` ✓
- **Response body consumption**: All responses properly consumed via `readBodyWithLimit()` or `body.cancel()` ✓
- **Cheerio memory leaks**: No evidence of `$` objects held after use ✓
- **Enrichment HTTP leaks**: All enrichment modules use `BaseScraper` with proper cleanup ✓
- **Reddit rate limiting**: `validateSubreddit()` has retry logic with exponential backoff ✓
- **Module-level Maps/Sets**: All are bounded (e.g., `MAX_STORE_SIZE`, `MAX_ROBOTS_CACHE_SIZE`) ✓
- **setInterval cleanup**: All intervals have `clearInterval` in useEffect cleanup or `.unref()` ✓
- **addEventListener cleanup**: All have corresponding `removeEventListener` in cleanup ✓
