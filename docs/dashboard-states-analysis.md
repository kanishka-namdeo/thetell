# Dashboard Waiting, Loading, and Error States Analysis

**Date**: 2026-06-26
**Purpose**: Identify gaps in UX states across the dashboard to ensure users always understand system status.

---

## Executive Summary

The dashboard has **good coverage** of loading and error states in some areas, but **significant gaps** exist in others. The admin dashboard has comprehensive state handling, while user-facing dashboard pages have inconsistent patterns.

### Coverage Summary

| Page/Area | Loading State | Error State | Empty State | Waiting State | Overall |
|-----------|---------------|-------------|-------------|---------------|---------|
| Dashboard Layout | ✅ Full skeleton | ⚠️ Auth redirect only | N/A | ✅ Auth loading | Good |
| Overview (Dashboard Home) | ❌ None | ❌ None | ⚠️ Partial (empty lists) | ❌ None | Poor |
| Signals List | ✅ Skeleton in table | ⚠️ Hidden (hook has error state) | ✅ Good | ❌ None | Fair |
| Companies List | ✅ Full page skeleton | ⚠️ Hidden (hook has error state) | ✅ Good | ❌ None | Fair |
| Strategic Insights | ✅ Skeleton on initial load | ⚠️ Hidden (custom hook has error state) | ✅ Good | ❌ None | Fair |
| Profile & Settings | ❌ None (Server Component) | ❌ None | N/A | ❌ None | Poor |
| Analytics Charts | ✅ Per-chart loading | ✅ Per-chart error | N/A | ❌ None | Good |

---

## Detailed Analysis by Page

### 1. Dashboard Layout (`src/app/dashboard/layout.tsx`)

**Current State**: ✅ **Good**

**Loading States**:
- ✅ Full skeleton layout during session authentication (`status === "loading"`)
- ✅ Sidebar skeleton, mobile header skeleton, main content skeleton
- ✅ Uses shadcn `Skeleton` components consistently

**Error States**:
- ⚠️ Only handles auth failure (redirect to `/sign-in`)
- ❌ No error boundary for layout-level failures

**Waiting States**:
- ✅ Auth loading is handled with skeleton

**Gaps**:
- No error boundary component — if layout crashes, user sees blank screen
- No fallback if sidebar fails to load

---

### 2. Overview Page (`src/app/dashboard/page.tsx`)

**Current State**: ❌ **Poor**

**Loading States**:
- ❌ **None** — Server Component renders immediately or shows browser loading
- ❌ No `loading.tsx` file
- ❌ No skeleton for the 6+ parallel DB queries

**Error States**:
- ❌ **None** — if any Prisma query fails, entire page crashes
- ❌ No error boundary
- ❌ No graceful degradation (e.g., show partial data if one query fails)

**Empty States**:
- ⚠️ Partial — shows "No analyses available yet" for empty lists
- ❌ No empty state for zero signals/companies/articles

**Waiting States**:
- ❌ **None** — no indication that data is being fetched
- ❌ No refresh indicator
- ❌ No "last updated" timestamp

**Gaps**:
- **Critical**: Add `loading.tsx` with skeleton matching the overview layout
- **Critical**: Add `error.tsx` with retry button
- **High**: Add Suspense boundaries around individual sections (stats, charts, lists) so one slow query doesn't block everything
- **Medium**: Add "last updated" timestamp with manual refresh button
- **Low**: Add empty states for zero data scenarios

---

### 3. Signals List (`src/app/dashboard/signals/page.tsx`)

**Current State**: ⚠️ **Fair**

**Loading States**:
- ✅ `SignalTable` shows skeleton rows when `loading=true`
- ❌ No full-page skeleton on initial load (relies on table skeleton)
- ❌ No loading indicator for filter changes

**Error States**:
- ⚠️ `useSignals` hook captures errors in `error` state
- ❌ **Error is never displayed** — page doesn't check `error` from hook
- ❌ No retry button
- ❌ No error boundary

**Empty States**:
- ✅ Good — "No signals found" with icon and CTA

**Waiting States**:
- ❌ **None** — no indication when:
  - Filters are being applied
  - "Load More" is fetching
  - "Refresh" button is working

**Gaps**:
- **Critical**: Display error state from `useSignals` hook
- **High**: Add loading spinner on "Refresh" and "Load More" buttons during fetch
- **High**: Add loading indicator when filters change
- **Medium**: Add "Load More" button loading state (disable + spinner)

---

### 4. Companies List (`src/app/dashboard/companies/page.tsx`)

**Current State**: ⚠️ **Fair**

**Loading States**:
- ✅ Full page skeleton on initial load
- ✅ Grid of 6 skeleton cards

**Error States**:
- ⚠️ `useCompanies` hook captures errors
- ❌ **Error is never displayed** — page doesn't check `error` from hook
- ❌ No retry button
- ❌ No error boundary

**Empty States**:
- ✅ Good — "No companies found" with icon and CTA

**Waiting States**:
- ❌ **None** — no indication when:
  - "Watched Only" filter is applied
  - "Load More" is fetching

**Gaps**:
- **Critical**: Display error state from `useCompanies` hook
- **High**: Add loading spinner on "Load More" button during fetch
- **Medium**: Add loading indicator when "Watched Only" toggle changes

---

### 5. Strategic Insights (`src/app/dashboard/inferences/inferences-client.tsx`)

**Current State**: ⚠️ **Fair**

**Loading States**:
- ✅ Skeleton on initial load (6 skeleton cards)
- ❌ No loading indicator for filter changes
- ❌ No loading indicator for "Load More"

**Error States**:
- ⚠️ Custom `useInferenceFetcher` hook captures errors
- ❌ **Error is never displayed** — only logged to console
- ❌ No retry button
- ❌ No error boundary

**Empty States**:
- ✅ Good — "No inferences found" with icon and contextual message

**Waiting States**:
- ❌ **None** — no indication when:
  - Filters are being applied
  - Sort is changing
  - "Load More" is fetching

**Gaps**:
- **Critical**: Display error state from custom fetcher
- **High**: Add loading spinner on "Load More" button
- **High**: Add loading indicator when filters/sort change
- **Medium**: Add debouncing to filter changes to prevent rapid refetches

---

### 6. Profile & Settings (`src/app/dashboard/profile/page.tsx`)

**Current State**: ❌ **Poor**

**Loading States**:
- ❌ **None** — Server Component, no loading state
- ❌ No `loading.tsx` file
- ❌ If `auth()` or Prisma query is slow, page appears frozen

**Error States**:
- ❌ **None** — crashes if auth or DB fails
- ❌ No error boundary
- ❌ Redirects to sign-in if user not found (could be confusing)

**Waiting States**:
- ❌ **None** — no indication during form submission
- ❌ Profile form (`ProfileForm`) has no loading state on submit

**Gaps**:
- **High**: Add `loading.tsx` with profile form skeleton
- **High**: Add `error.tsx` with retry
- **Medium**: Add loading state to profile form submit button
- **Medium**: Add success/error toast after profile update

---

### 7. Analytics Charts (`src/components/dashboard/sentiment-trends.tsx`)

**Current State**: ✅ **Good** (best-in-class pattern)

**Loading States**:
- ✅ Per-chart "Loading..." text during fetch
- ✅ Waits for auth before fetching (prevents 401 errors)

**Error States**:
- ✅ Per-chart error display with contextual message
- ✅ Handles 401, 403, and generic errors differently
- ✅ Logs errors via logger

**Empty States**:
- N/A — chart always renders (empty dataset shows flat lines)

**Waiting States**:
- ❌ **None** — no refresh indicator
- ❌ No "last updated" timestamp

**This is the pattern to replicate across all data-fetching components.**

---

## Cross-Cutting Issues

### 1. Error States Are Captured but Never Displayed

All three data-fetching hooks (`useSignals`, `useCompanies`, `useInferenceFetcher`) capture errors:

```typescript
// useSignals.ts - error IS captured
catch (err) {
  if (err instanceof Error && err.name === "AbortError") return;
  setError(err instanceof Error ? err.message : "Unknown error"); // ← captured
} finally {
  setLoading(false);
}

// signals/page.tsx - error is NEVER read
const { data: signals, loading, hasMore, loadMore, refetch } = useSignals({...});
// ↑ Note: no `error` destructured!
```

**Fix**: Destructure `error` from hooks and display it:

```typescript
const { data: signals, loading, error, hasMore, loadMore, refetch } = useSignals({...});

if (error) {
  return <ErrorState error={error} onRetry={refetch} />;
}
```

### 2. No Loading Indicators on User Actions

When users click "Refresh", "Load More", or change filters, there's no visual feedback that something is happening:

| Action | Current Behavior | Expected |
|--------|-----------------|----------|
| Click "Refresh" | Button click, then data appears | Spinner on button, then data appears |
| Click "Load More" | Button click, then more data appears | Spinner on button, button disabled, then data appears |
| Change filter | Dropdown closes, then data changes | Spinner/fade on table, then new data appears |
| Change sort | Dropdown closes, then data changes | Spinner/fade on grid, then new data appears |

### 3. No Error Boundaries

No page has an `error.tsx` file (except admin pages). If a Server Component crashes:
- User sees blank white screen
- No retry option
- No error message

**Required**: Add `error.tsx` to every route segment that fetches data.

### 4. Inconsistent Skeleton Patterns

| Page | Skeleton Approach |
|------|------------------|
| Companies | Full page skeleton (6 cards) |
| Signals | Table-row skeletons only |
| Insights | Grid skeletons (6 cards) |
| Overview | **None** |
| Profile | **None** |

Should standardize on full-page skeletons for initial load + component-level skeletons for updates.

### 5. No "Last Updated" or Refresh Indicators

Users have no way to know:
- When data was last fetched
- If the data they're seeing is stale
- Whether a refresh action succeeded

---

## Recommendations

### Critical (Implement First)

1. **Add `loading.tsx` to Overview and Profile pages**
   - Match the layout structure with skeleton components
   - Use shadcn `Skeleton` for consistency

2. **Add `error.tsx` to all dashboard pages**
   - Include retry button
   - Show error message
   - Follow the pattern from admin pages

3. **Display error states from hooks**
   - Destructure `error` from `useSignals`, `useCompanies`
   - Show error UI when `error !== null`
   - Include retry button that calls `refetch`

### High Priority

4. **Add loading indicators to interactive elements**
   - "Refresh" button: spinner icon during fetch
   - "Load More" button: spinner + disabled state
   - Filter changes: fade/skeleton on data area

5. **Add Suspense boundaries to Overview page**
   - Wrap stats, charts, and lists in separate Suspense blocks
   - Allows partial page rendering if one query is slow

6. **Standardize skeleton patterns**
   - Full-page skeleton for initial load
   - Component-level skeleton for updates/filter changes
   - Match existing component structure (table rows for tables, cards for grids)

### Medium Priority

7. **Add "last updated" timestamp**
   - Display in header or footer of data sections
   - Update after each successful fetch

8. **Add success/error toasts for mutations**
   - Profile form submission
   - Any CRUD operations

9. **Add optimistic updates for filter changes**
   - Show filtered results immediately
   - Show loading indicator while refetching

### Low Priority

10. **Add pull-to-refresh pattern** (mobile)
11. **Add offline detection** with appropriate messaging
12. **Add retry logic with exponential backoff** for failed fetches

---

## Implementation Priority by Page

| Page | Priority | Effort | Impact |
|------|----------|--------|--------|
| Overview | **Critical** | Medium | High (most-visited page) |
| Signals List | **High** | Low | High (power user page) |
| Companies List | **High** | Low | Medium |
| Strategic Insights | **High** | Medium | High (key feature) |
| Profile & Settings | **Medium** | Low | Low (infrequently used) |

---

## Code Patterns to Implement

### Pattern 1: Error Display in Data-Fetching Pages

```typescript
// signals/page.tsx
const { data: signals, loading, error, hasMore, loadMore, refetch } = useSignals({...});

if (error) {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PageHeader title="Signals" />
      <ErrorState
        error={error}
        onRetry={refetch}
        message="Failed to load signals"
      />
    </div>
  );
}
```

### Pattern 2: Loading State for Interactive Elements

```typescript
const [isRefreshing, setIsRefreshing] = useState(false);

const handleRefresh = async () => {
  setIsRefreshing(true);
  try {
    await refetch();
  } finally {
    setIsRefreshing(false);
  }
};

<Button onClick={handleRefresh} disabled={isRefreshing}>
  {isRefreshing ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    "Refresh"
  )}
</Button>
```

### Pattern 3: Error Boundary (error.tsx)

```typescript
// src/app/dashboard/signals/error.tsx
"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="p-6">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to load signals</AlertTitle>
        <AlertDescription>
          {error.message || "An unexpected error occurred."}
        </AlertDescription>
      </Alert>
      <Button onClick={reset} className="mt-4">
        Try again
      </Button>
    </div>
  );
}
```

### Pattern 4: Loading Skeleton (loading.tsx)

```typescript
// src/app/dashboard/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="border-b-2 border-foreground pb-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64 mt-2" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      {/* More skeletons matching the overview layout */}
    </div>
  );
}
```

---

## References

- **Admin Dashboard States**: `src/components/admin/states/` — comprehensive skeleton, empty, and error components
- **Sentiment Trends Pattern**: `src/components/dashboard/sentiment-trends.tsx` — best-in-class loading/error handling
- **shadcn/ui Alert**: Use for error displays
- **shadcn/ui Skeleton**: Use for loading states
- **shadcn/ui Spinner (Loader2 from lucide-react)**: Use for button loading states
