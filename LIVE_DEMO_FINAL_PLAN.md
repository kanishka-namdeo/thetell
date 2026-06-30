# Live Demo Readiness Plan - Final Fixes

## Current Status

✅ **Completed:**
- PostgreSQL container running on port 5433
- Prisma migrations created and applied (4 migrations)
- Database schema synced with dual-agent fields
- `.env.local` verified with API keys
- `seed-real.ts` upgraded to dual-agent pipeline
- JSON markdown wrapper fix added to `provider.ts`
- "json" keyword added to summary prompts

❌ **Issues Found:**

### 1. Database Constraint Issue (BLOCKER)
**Problem**: The original migration created a unique **INDEX** on `Analysis.signalId`, not a constraint. The dual-agent migration tries to drop a constraint that doesn't exist, leaving the unique index in place. This causes: `Unique constraint failed on the fields: ("signalId")` when creating the second analysis (GOSSIP_GIRL).

**Fix**: Update migration to drop the INDEX instead of the constraint:
```sql
-- Change from:
ALTER TABLE "Analysis" DROP CONSTRAINT IF EXISTS "Analysis_signalId_key";

-- To:
DROP INDEX IF EXISTS "Analysis_signalId_key";
```

**Action**: Reset database and reapply migrations.

### 2. Reuters URLs Blocked by robots.txt
**Problem**: Reuters blocks scraping. All 6 Apple/Tesla URLs failed.

**Fix**: Replace with scrapable sources:
- **Apple**: Use TechCrunch, The Verge, or MacRumors
- **Tesla**: Use TechCrunch, The Verge, or Electrek

### 3. Database User Mismatch
**Problem**: `.env.local` uses `thetell_user` but docker-compose creates `thell_user`.

**Fix**: Update `.env.local`:
```
DATABASE_URL=postgresql://thell_user:thell_password@localhost:5433/the_tell
```

## Execution Plan

1. **Fix migration file** - Update `20260618072000_add_dual_agent_fields/migration.sql`
2. **Reset database** - `pnpm prisma migrate reset`
3. **Fix .env.local** - Update DATABASE_URL
4. **Update seed URLs** - Replace Reuters with scrapable sources
5. **Run seed script** - `pnpm dlx tsx prisma/seed-real.ts`
6. **Verify** - Check dual-agent analyses exist
7. **Start dev server** - `pnpm dev`

## Alternative Scrapable URLs

**Apple (3)**:
- https://techcrunch.com/2024/09/09/apple-iphone-16-event-live-updates/
- https://www.theverge.com/2024/9/9/24240799/apple-iphone-16-announcement
- https://www.macrumors.com/2024/09/09/apple-iphone-16-event-live/

**Tesla (3)**:
- https://techcrunch.com/2024/10/23/tesla-q3-earnings/
- https://www.theverge.com/2024/7/2/24190465/tesla-q2-2024-deliveries
- https://electrek.co/2024/10/23/tesla-q3-earnings-results/

## Time Estimate
- Fix migration: 2 min
- Reset database: 3 min
- Fix .env.local: 1 min
- Update URLs: 5 min
- Run seed: 5-10 min
- Verify: 5 min
- **Total: ~20-25 minutes**

## Ready to Proceed?

The plan is complete. Once you confirm, I'll:
1. Fix the migration file
2. Reset the database
3. Update .env.local
4. Replace URLs with scrapable sources
5. Run the seed script
6. Start the dev server

**Shall I proceed with implementation?**
