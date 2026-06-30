# Cluster-Aware Signal Analysis Pipeline: Deployment Steps

**Phase 10: Deployment and Rollback**  
**Last Updated**: 2026-06-26  
**Status**: Ready for Deployment

---

## Overview

This document provides step-by-step instructions for deploying the cluster-aware signal analysis pipeline. Follow these steps in order, verifying each step before proceeding.

**Estimated Deployment Time**: 15-30 minutes  
**Risk Level**: Medium (database migrations required)  
**Rollback Available**: Yes (see `cluster-rollback.md`)

---

## Pre-Deployment Verification

Before starting deployment, verify:

```powershell
# 1. Check git status (should be clean)
git status

# Expected: "nothing to commit, working tree clean"

# 2. Verify you're on the correct branch
git branch --show-current

# Expected: main or production branch

# 3. Pull latest changes
git pull origin main

# 4. Verify pre-deployment checklist completed
# (See cluster-pre-deployment.md)
```

---

## Step 1: Create Database Backup

**Critical**: Always backup before running migrations.

### Local Development (Docker)

```powershell
# Create timestamped backup
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
docker exec the_tell_db_1 pg_dump -U thell_user -d the_tell -F c > "backup_pre_cluster_$timestamp.dump"

# Verify backup created
Get-ChildItem backup_pre_cluster_*.dump | Select-Object Name, Length

# Expected: File size > 0 (typically 1-50 MB depending on data)
```

### Production (Railway)

```powershell
# Railway backup
railway backup create

# Verify backup status
railway backup list

# Expected: Latest backup shows "completed" status
```

### Production (Supabase)

```powershell
# Use Supabase CLI
supabase db dump -f backup_pre_cluster_$timestamp.sql

# Or use dashboard: Database > Backups > Create backup
```

**Verification**:
- [ ] Backup file created successfully
- [ ] Backup file size is reasonable (> 0 bytes)
- [ ] Backup stored in safe location

---

## Step 2: Apply Database Migrations

### Run Migrations

```powershell
# Apply pending migrations
pnpm prisma migrate deploy

# Expected output:
# Environment: ...
# ✔ Generated Prisma Client (5.x.x)
# Applying migration `20260626_add_cluster_fields`
# The migration was applied successfully.
```

### Verify Migration Status

```powershell
# Check migration status
pnpm prisma migrate status

# Expected output:
# Status: Migration history is up to date
# - Applied: 20260626_add_cluster_fields
```

### Regenerate Prisma Client

```powershell
# Regenerate client with new schema
pnpm prisma generate

# Expected output:
# ✔ Generated Prisma Client (5.x.x)
```

### Verify Schema Changes

```powershell
# Test database connectivity with new schema
pnpm prisma db execute --stdin <<< "SELECT column_name FROM information_schema.columns WHERE table_name = 'SignalTheme' AND column_name IN ('embedding', 'clusterSummary', 'lastAnalyzedAt')"

# Expected: 3 rows returned (embedding, clusterSummary, lastAnalyzedAt)

# Verify ClusterArticle table exists
pnpm prisma db execute --stdin <<< "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'ClusterArticle'"

# Expected: 1 (table exists)

# Verify Signal.clusterId column exists
pnpm prisma db execute --stdin <<< "SELECT column_name FROM information_schema.columns WHERE table_name = 'Signal' AND column_name = 'clusterId'"

# Expected: 1 row returned
```

**Verification**:
- [ ] Migrations applied successfully
- [ ] Migration status shows "up to date"
- [ ] Prisma client regenerated
- [ ] New columns exist in SignalTheme table
- [ ] ClusterArticle table exists
- [ ] Signal.clusterId column exists

**If Migration Fails**:
- See `cluster-rollback.md` → "Migration Failure" section
- Do NOT proceed to next step until migration is fixed

---

## Step 3: Build Application

### Run Typecheck

```powershell
pnpm typecheck

# Expected output:
# No type errors found
```

### Run Lint

```powershell
pnpm lint

# Expected output:
# No linting errors
```

### Build Application

```powershell
pnpm build

# Expected output:
# ✓ Compiled successfully
# ✓ Linting passed
# ✓ Creating an optimized production build
# ✓ Collecting page data
# ✓ Finalizing page optimization
# Build error: none
```

**Verification**:
- [ ] Typecheck passes with no errors
- [ ] Lint passes with no errors
- [ ] Build completes successfully
- [ ] No build warnings related to cluster code

**If Build Fails**:
- Check error messages for cluster-related imports
- Verify all cluster files are present:
  - `src/lib/ai/agent/cluster-article-generator.ts`
  - `src/app/api/v1/clusters/[id]/route.ts`
  - `src/app/api/v1/clusters/[themeId]/articles/route.ts`
- Fix errors and rebuild

---

## Step 4: Deploy to Production

### Vercel Deployment

```powershell
# Deploy to production
vercel --prod

# Expected output:
# 🏗  Building...
# ✅ Production: [deployment-url]
```

### Railway Deployment

```powershell
# Railway auto-deploys from main branch
# Verify deployment status
railway status

# Or trigger manual deployment
railway up
```

### Manual Deployment

```powershell
# If deploying manually
pnpm build
pnpm start

# Expected: Server running on http://localhost:3000
```

**Verification**:
- [ ] Deployment initiated successfully
- [ ] Build logs show no errors
- [ ] Deployment URL accessible

---

## Step 5: Verify Deployment

### Check Application Health

```powershell
# Test homepage
Invoke-WebRequest -Uri "https://your-domain.com" -Method Get | Select-Object StatusCode

# Expected: StatusCode 200

# Test dashboard (requires auth)
Invoke-WebRequest -Uri "https://your-domain.com/dashboard" -Method Get | Select-Object StatusCode

# Expected: StatusCode 200 (or 302 redirect to login)
```

### Verify Cluster API Endpoints

```powershell
# Test cluster detail endpoint (replace {id} with actual theme ID from database)
$clusterId = "your-cluster-id-here"
Invoke-RestMethod -Uri "https://your-domain.com/api/v1/clusters/$clusterId" -Method Get

# Expected: JSON response with structure:
# {
#   "theme": { ... },
#   "evidenceChain": [ ... ]
# }

# Test cluster articles endpoint
Invoke-RestMethod -Uri "https://your-domain.com/api/v1/clusters/$clusterId/articles" -Method Get

# Expected: JSON array of articles
```

**Finding a Cluster ID to Test**:

```powershell
# Query database for existing clusters
pnpm prisma db execute --stdin <<< "SELECT id, label FROM SignalTheme WHERE embedding IS NOT NULL LIMIT 1"

# Use the returned ID for testing
```

### Verify Database Connectivity

```powershell
# Test database queries through API
pnpm prisma db execute --stdin <<< "SELECT COUNT(*) FROM SignalTheme WHERE embedding IS NOT NULL"

# Expected: Count of clustered themes (may be 0 if no clustering has run yet)
```

**Verification**:
- [ ] Application homepage loads
- [ ] Dashboard accessible
- [ ] Cluster API endpoints respond correctly
- [ ] Database queries execute successfully
- [ ] No errors in application logs

---

## Step 6: Run Correlation Engine (Optional)

If no clusters exist yet, run the correlation engine to generate initial clusters:

### Run via Script (Recommended for Testing)

```powershell
pnpm tsx scripts/run-correlation.ts

# Expected output:
# Loading recent analyses...
# Loaded 150 analyses from last 7 days
# Clustering themes...
# Clustered 23 themes with similarity > 0.75
# Updating themes...
# Generated 5 cluster articles
# Correlation complete
```

### Run via Inngest (Production)

The correlation engine runs automatically via Inngest cron job (daily at 4 AM UTC).

To trigger manually:

```powershell
# Via Inngest dashboard
# Navigate to: https://app.inngest.com/functions/correlateSignalsFunction
# Click "Invoke" button

# Or via API (if configured)
Invoke-RestMethod -Uri "https://your-inngest-endpoint.com/inngest?fnId=correlateSignalsFunction" -Method Post
```

**Verification**:
- [ ] Correlation engine completes without errors
- [ ] Cluster articles generated (check logs)
- [ ] SignalTheme records have embedding values
- [ ] ClusterArticle records created

---

## Step 7: Smoke Tests

### Test Cluster Article Generation

```powershell
# Query for generated cluster articles
pnpm prisma db execute --stdin <<< "SELECT id, title, agentPersona, signalCount FROM ClusterArticle LIMIT 5"

# Expected: At least 1 article per persona (ANALYST, GOSSIP_GIRL)
```

### Test Evidence Chain

```powershell
# Test cluster detail endpoint returns evidence chain
$clusterId = "your-cluster-id-here"
$response = Invoke-RestMethod -Uri "https://your-domain.com/api/v1/clusters/$clusterId" -Method Get

# Verify evidence chain exists
$response.evidenceChain.Count -gt 0

# Expected: True (evidence chain should have items)
```

### Test Frontend Display

Navigate to cluster detail page in browser:

```
https://your-domain.com/clusters/{clusterId}
```

**Verify**:
- [ ] Cluster title displays
- [ ] Signal list shows clustered signals
- [ ] Evidence chain renders
- [ ] Cluster articles display (Analyst + Gossip Girl tabs)
- [ ] No console errors in browser dev tools

---

## Step 8: Monitoring Checks

### Verify Logging

Check application logs for cluster-related entries:

```powershell
# Vercel logs
vercel logs --output raw

# Railway logs
railway logs

# Look for entries like:
# [INFO] correlation: Loaded X analyses
# [INFO] correlation: Clustered Y themes
# [INFO] correlation: Generated Z cluster articles
```

### Check Error Rates

```powershell
# Vercel Analytics
# Navigate to: https://vercel.com/dashboard > Your Project > Analytics
# Check for 4xx/5xx errors

# Railway
# Navigate to: Railway Dashboard > Deployments > Logs
# Filter for ERROR level
```

**Expected**:
- No 5xx errors related to cluster endpoints
- No database connection errors
- No LLM provider errors (or minimal transient errors)

### Monitor Performance

```powershell
# Check cluster API response times
Measure-Command { 
  Invoke-RestMethod -Uri "https://your-domain.com/api/v1/clusters/$clusterId" -Method Get 
} | Select-Object TotalMilliseconds

# Expected: < 2000ms (2 seconds)
```

**Verification**:
- [ ] Logs show successful cluster operations
- [ ] Error rate is low (< 1%)
- [ ] API response times are acceptable (< 2s)
- [ ] No memory or CPU spikes

---

## Step 9: Post-Deployment Verification

### Run Validation Script

```powershell
pnpm tsx scripts/validate-cluster-deployment.ts

# Expected output:
# ========================================
# Cluster Deployment Validation Report
# ========================================
# ✅ Database schema: PASS
# ✅ Cluster routing: PASS
# ✅ Triage layer: PASS
# ✅ Article generation: PASS
# ✅ Evidence chain: PASS
# ✅ API endpoints: PASS
# ✅ Monitoring: PASS
# ========================================
# Validation: PASSED (7/7 checks)
```

### Verify Rollback Readiness

```powershell
# Confirm git tag exists
git tag -l "v*-cluster-deploy"

# Expected: Tag created in pre-deployment step

# Confirm backup exists
Get-ChildItem backup_pre_cluster_*.dump

# Expected: Backup file present
```

**Verification**:
- [ ] Validation script passes all checks
- [ ] Rollback tag exists
- [ ] Backup file available

---

## Step 10: Deployment Complete

### Update Documentation

```powershell
# Update deployment status in docs
# Edit docs/features-built.md to mark cluster pipeline as "Deployed"

# Commit documentation update
git add docs/features-built.md
git commit -m "docs: mark cluster pipeline as deployed"
git push origin main
```

### Notify Team

Send deployment completion notification:

```
Subject: Cluster Pipeline Deployment Complete

The cluster-aware signal analysis pipeline has been successfully deployed.

Deployment Details:
- Time: [timestamp]
- Version: [git tag]
- Status: ✅ Successful

Verification:
- All smoke tests passed
- Cluster articles generated: [count]
- API endpoints responding: ✅
- No critical errors in logs

Next Steps:
- Monitor for 1 hour post-deployment
- Correlation engine runs daily at 4 AM UTC
- Rollback procedures available in docs/deployment/cluster-rollback.md
```

### Monitor for 1 Hour

**Critical**: Stay available for 1 hour post-deployment to address any issues.

**Monitoring Checklist**:
- [ ] Check logs every 15 minutes
- [ ] Monitor error rates
- [ ] Verify cluster article generation (if correlation runs)
- [ ] Respond to any user-reported issues

---

## Rollback Triggers

**Rollback if you observe**:

1. **Critical Errors**:
   - Database connection failures
   - Migration errors
   - Application crashes

2. **Performance Issues**:
   - API response times > 10 seconds
   - Memory usage > 90%
   - CPU usage > 95%

3. **Data Issues**:
   - Cluster articles contain hallucinated content
   - Evidence chain data missing or corrupted
   - Signal clustering produces incorrect results

4. **User Impact**:
   - Dashboard inaccessible
   - Public feed broken
   - Authentication failures

**Rollback Procedure**: See `cluster-rollback.md`

---

## Common Deployment Issues

### Issue 1: Build Fails with "Module not found"

**Symptoms**:
```
Module not found: Can't resolve '@/lib/ai/agent/cluster-article-generator'
```

**Solution**:
```powershell
# Verify file exists
Test-Path src/lib/ai/agent/cluster-article-generator.ts

# If missing, check git status
git status

# Pull latest changes
git pull origin main

# Rebuild
pnpm build
```

### Issue 2: API Endpoint Returns 500 Error

**Symptoms**:
```
GET /api/v1/clusters/{id} 500 Internal Server Error
```

**Solution**:
```powershell
# Check logs for error details
vercel logs --output raw | Select-String "ERROR"

# Common causes:
# - Database connection issue
# - Missing cluster data
# - LLM provider error

# Verify database connectivity
pnpm prisma db execute --stdin <<< "SELECT 1"

# Check if cluster exists
pnpm prisma db execute --stdin <<< "SELECT id FROM SignalTheme WHERE id = '{clusterId}'"
```

### Issue 3: Correlation Engine Fails

**Symptoms**:
```
Error: Failed to generate embedding
```

**Solution**:
```powershell
# Check NLP model cache
Test-Path node_modules/.cache/transformers/

# Clear cache and restart
Remove-Item -Recurse -Force node_modules/.cache/transformers/
pnpm dev

# Monitor model download in console
```

### Issue 4: Cluster Articles Not Generated

**Symptoms**:
```
ClusterArticle table is empty after correlation
```

**Solution**:
```powershell
# Check if clusters have enough signals (need 3+)
pnpm prisma db execute --stdin <<< "SELECT themeId, COUNT(*) as signalCount FROM Signal GROUP BY themeId HAVING COUNT(*) >= 3"

# If no clusters have 3+ signals, wait for more signal ingestion
# Or run correlation with existing data
pnpm tsx scripts/run-correlation.ts
```

---

## Next Steps

After successful deployment:

1. **Monitor system**: Watch logs and metrics for 1 hour
2. **Test UI**: Navigate cluster pages in browser
3. **Verify articles**: Read generated cluster articles for quality
4. **Update team**: Send deployment completion notification
5. **Plan next phase**: UI enhancements, API improvements

---

## References

- **Pre-Deployment Checklist**: `cluster-pre-deployment.md`
- **Rollback Procedures**: `cluster-rollback.md`
- **Validation Script**: `scripts/validate-cluster-deployment.ts`
- **Admin Guide**: `docs/admin/cluster-analysis.md`
- **API Documentation**: `docs/api-clusters.md`
