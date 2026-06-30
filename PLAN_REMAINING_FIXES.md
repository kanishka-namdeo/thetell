# Plan: Fix Remaining Issues for Live Demo

## Issues Identified

### 1. Qwen API "json" Keyword Requirement
**Problem**: The Qwen API requires the word "json" (lowercase) in prompts when using `response_format: { type: "json_object" }`. Some prompts still use "JSON" (uppercase).

**Files to Fix**:
- `src/lib/ai/agent/prompts.ts` - Line 99: `buildAgentSummaryPrompt` needs "Respond with a json object..." added
- `src/lib/ai/prompts.ts` - Already fixed (lines 20, 40, 62)

**Fix**: Add `Respond with a json object containing a "summary" field.` to the summary prompt in `buildAgentSummaryPrompt`.

### 2. Apple/Tesla URLs Return 404
**Problem**: The URLs in `prisma/seed-real.ts` for Apple and Tesla return 404 errors.

**Files to Fix**:
- `prisma/seed-real.ts` - Lines 29-60: Update SIGNAL_DEFS with working URLs

**Fix**: Replace with actual working URLs from Apple Newsroom and Tesla Press Release pages.

### 3. Clean Up Failed Signals
**Problem**: Previous seed attempts left failed signals in the database.

**Fix**: Run the cleanup script again after fixing the above issues.

## Execution Steps

1. Fix `src/lib/ai/agent/prompts.ts` line 99 - add json response instruction
2. Update `prisma/seed-real.ts` with working Apple/Tesla URLs
3. Run cleanup script: `pnpm dlx tsx scripts/cleanup-failed-signals.ts`
4. Run seed script: `pnpm dlx tsx prisma/seed-real.ts`
5. Verify database has real data with dual-agent analyses

## Estimated Time
- 5 minutes to fix prompts
- 10 minutes to find working URLs
- 2 minutes to run cleanup
- 5 minutes to run seed script
- **Total: ~22 minutes**
