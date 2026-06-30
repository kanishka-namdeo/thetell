# Live Demo Readiness Plan - Remaining Fixes

## Issues Discovered

### 1. Database Constraint Issue (BLOCKER)
**Problem**: The original migration created a unique **INDEX** on `Analysis.signalId`, not a constraint. The dual-agent migration tries to drop a constraint that doesn't exist, leaving the unique index in place. This causes the error: `Unique constraint failed on the fields: ("signalId")` when trying to create the second analysis (GOSSIP_GIRL) for the same signal.

**Fix**: 
- Update migration `20260618072000_add_dual_agent_fields/migration.sql` to drop the INDEX instead of the constraint
- Reset the database and reapply migrations

**Migration fix**:
```sql
-- Change from:
ALTER TABLE "Analysis" DROP CONSTRAINT IF EXISTS "Analysis_signalId_key";

-- To:
DROP INDEX IF EXISTS "Analysis_signalId_key";
```

### 2. Reuters URLs Blocked by robots.txt
**Problem**: Reuters blocks scraping via robots.txt. All 6 Apple/Tesla URLs failed.

**Fix**: Use alternative news sources that allow scraping:
- TechCrunch
- The Verge
- Ars Technica
- Or use press release sites like PR Newswire

### 3. Database User Mismatch
**Problem**: Connection string uses `thetell_user` but the actual database user is `thell_user` (from docker-compose.yml).

**Fix**: Update `.env.local` to use correct credentials:
```
DATABASE_URL=postgresql://thell_user:thell_password@localhost:5433/the_tell
```

## Execution Plan

1. **Fix migration file** - Change `ALTER TABLE ... DROP CONSTRAINT` to `DROP INDEX IF EXISTS`
2. **Reset database** - Run `pnpm prisma migrate reset` to apply fixed migrations
3. **Fix .env.local** - Update DATABASE_URL with correct user
4. **Update seed URLs** - Replace Reuters URLs with scrapable sources
5. **Run seed script** - `pnpm dlx tsx prisma/seed-real.ts`
6. **Verify** - Check database has dual-agent analyses
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
