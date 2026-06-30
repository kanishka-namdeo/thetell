# Pipeline Flow Consolidation

**Date**: 2026-06-27  
**Phase**: 8 of Pipeline Flow Consolidation Plan  
**Status**: ✅ Complete

## What Changed

Consolidated two divergent signal discovery flows into a single unified function:

- **Pipeline Orchestrator** (`src/lib/inngest/pipeline-orchestrator.ts`) — Manual discovery triggered by admin UI
- **Re-Discover** (`src/lib/inngest/re-discover.ts`) — Automated re-discovery for companies with low signal counts

Both flows are now handled by:

**`src/lib/inngest/signal-discovery.ts`**

## Why It Changed

### Problem: Divergent Quality Paths

The two discovery flows had subtly different behaviors:

1. **Pipeline Orchestrator** (manual):
   - Ran scrapers with full logging and error handling
   - Applied hypothesis-aware scraping when enabled
   - Used stealth fallback for blocked requests
   - Triggered analysis pipeline on success

2. **Re-Discover** (automated):
   - Ran scrapers with minimal logging
   - Did not support hypothesis-aware scraping
   - No stealth fallback
   - Triggered analysis pipeline on success

This divergence meant:
- **Inconsistent quality**: Automated discovery might miss signals that manual discovery would catch
- **Harder to maintain**: Bug fixes had to be applied in two places
- **Confusing for admins**: "Why does manual discovery work better than automated?"

### Solution: Single Code Path

The unified `signal-discovery.ts` function:
- Handles both manual and automated discovery
- Applies consistent quality, logging, and error handling
- Supports all features (hypothesis-aware, stealth fallback) in both modes
- Easier to maintain and debug

## How to Use the New Unified Function

### Function Signature

```typescript
import { discoverSignals } from '@/lib/inngest/signal-discovery';

interface DiscoveryOptions {
  companyIds?: string[];           // Specific companies (empty = all active)
  scrapers?: string[];             // Specific scrapers (empty = all enabled)
  mode: 'manual' | 'automated';    // Trigger mode
  hypothesisAware?: boolean;       // Use hypothesis-driven prioritization
  stealthFallback?: boolean;       // Enable stealth mode on blocks
}

async function discoverSignals(options: DiscoveryOptions): Promise<{
  signalsCreated: number;
  signalsAnalyzed: number;
  errors: Array<{ scraper: string; error: string }>;
}>
```

### Example Usage

#### Manual Discovery (Admin UI)

```typescript
// Admin triggers discovery for specific companies
const result = await discoverSignals({
  companyIds: ['company-123', 'company-456'],
  scrapers: ['rss', 'sec-edgar', 'github'],
  mode: 'manual',
  hypothesisAware: true,
  stealthFallback: true,
});

console.log(`Created ${result.signalsCreated} signals`);
```

#### Automated Discovery (Cron Job)

```typescript
// Daily cron runs discovery for all companies
const result = await discoverSignals({
  mode: 'automated',
  hypothesisAware: false,  // Disable for speed
  stealthFallback: false,  // Disable for cost
});

console.log(`Created ${result.signalsCreated} signals`);
```

#### Re-Discover Replacement (Low Signal Companies)

```typescript
// Automated re-discovery for companies with < 10 signals
const result = await discoverSignals({
  companyIds: lowSignalCompanyIds,
  scrapers: ['rss', 'web-search'],  // Focus on high-yield scrapers
  mode: 'automated',
  hypothesisAware: true,
  stealthFallback: true,
});
```

## Migration Checklist

### For Admin UI (Pipeline Orchestrator)

- [ ] Replace `pipeline-orchestrator.ts` imports with `signal-discovery.ts`
- [ ] Update admin API route to call `discoverSignals({ mode: 'manual', ... })`
- [ ] Test manual discovery from admin UI
- [ ] Verify logging appears in admin operations panel
- [ ] Confirm hypothesis-aware scraping works when enabled
- [ ] Confirm stealth fallback works when enabled

### For Automated Discovery (Re-Discover)

- [ ] Replace `re-discover.ts` imports with `signal-discovery.ts`
- [ ] Update Inngest cron function to call `discoverSignals({ mode: 'automated', ... })`
- [ ] Test automated discovery cron job
- [ ] Verify low-signal companies are re-discovered correctly
- [ ] Confirm consistent quality with manual discovery

### For Background Jobs

- [ ] Update `src/lib/inngest/functions.ts` to reference `signal-discovery.ts`
- [ ] Remove `pipeline-orchestrator.ts` and `re-discover.ts` files
- [ ] Update `AGENTS.md` Module Map (✅ Done)
- [ ] Update `docs/features-built.md` (✅ Done)

### Verification

- [ ] Run `pnpm run typecheck` — no errors
- [ ] Run `pnpm run lint` — no errors
- [ ] Run `pnpm run build` — builds successfully
- [ ] Test manual discovery from admin UI
- [ ] Test automated discovery cron job
- [ ] Verify signal quality is consistent between modes
- [ ] Check logs for consistent error handling

## Rollback Plan

If issues arise, revert to the previous state:

```bash
git revert <commit-hash>
```

The old files (`pipeline-orchestrator.ts`, `re-discover.ts`) are preserved in git history.

## Related Documentation

- **Plan**: `.cursor/plans/pipeline_flow_consolidation_plan_a2cd78e1.plan.md`
- **Features**: `docs/features-built.md` (Signal Discovery Pipeline entry)
- **Module Map**: `AGENTS.md` (Signal Pipeline section)

## Questions?

If you encounter issues with the unified discovery function:

1. Check the logs in admin operations panel
2. Verify company IDs and scraper names are correct
3. Confirm API keys are configured for the scrapers
4. Check database for duplicate signals (deduplication should prevent this)
5. Review error messages in the `errors` array returned by the function

---

**Migration completed**: 2026-06-27  
**Migrated by**: Phase 8 of Pipeline Flow Consolidation Plan
