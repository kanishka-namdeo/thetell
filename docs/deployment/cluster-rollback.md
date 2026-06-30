# Cluster-Aware Signal Analysis Pipeline: Rollback Procedures

**Phase 10: Deployment and Rollback**  
**Last Updated**: 2026-06-26  
**Status**: Ready for Deployment

---

## Overview

This document provides rollback procedures for the cluster-aware signal analysis pipeline. Use these procedures if deployment issues arise.

**Rollback Decision Tree**:
```
Issue detected
  ├─ Critical (app down, data loss) → Full Rollback (Section 3)
  ├─ Cluster-specific (articles broken, API errors) → Quick Rollback (Section 2)
  ├─ Migration failure → Migration Rollback (Section 4)
  └─ Performance degradation → Quick Rollback + Investigation (Section 2)
```

---

## 1. Quick Rollback (Disable Cluster Routing)

**Use when**: Cluster features are broken but core application is functional.

**Impact**: Disables cluster-based analysis routing. System falls back to standalone signal analysis. Existing clusters remain accessible but are not updated.

**Downtime**: 0 minutes (no restart required)

### Step 1: Access Admin Settings

```powershell
# Navigate to admin dashboard
# URL: https://your-domain.com/dashboard/admin/settings

# Or via API (if you have admin credentials)
```

### Step 2: Disable Cluster Routing

1. Navigate to **Admin Dashboard > Settings > General**
2. Find setting: `clusterRoutingEnabled`
3. Set value to `false`
4. Click **Save**

### Step 3: Verify Disable

```powershell
# Test that new signals are not routed to clusters
# Check logs for routing behavior
vercel logs --output raw | Select-String "routing"

# Expected: Signals routed to standalone analysis, not cluster triage
```

### Step 4: Monitor

```powershell
# Monitor for 15 minutes to ensure stability
vercel logs --output raw | Select-String "ERROR"

# Expected: No cluster-related errors
```

**Result**: Cluster routing disabled. System operates in pre-cluster mode.

---

## 2. Full Rollback (Code + Services)

**Use when**: Quick rollback insufficient, need to revert all cluster code changes.

**Impact**: Removes all cluster functionality from application.

**Downtime**: 5-10 minutes

### Step 1: Revert Code to Pre-Deployment Tag

```powershell
# List available tags
git tag -l "v*-cluster-deploy"

# Checkout pre-deployment tag
git checkout v0.x.x-cluster-deploy

# Or revert to specific commit before cluster deployment
git log --oneline -10
git checkout <commit-hash-before-cluster>
```

### Step 2: Rebuild Application

```powershell
# Install dependencies (if changed)
pnpm install

# Rebuild application
pnpm build

# Expected: Build completes without cluster code
```

### Step 3: Redeploy

```powershell
# Vercel
vercel --prod

# Railway
railway up

# Manual
pnpm start
```

### Step 4: Verify Rollback

```powershell
# Test application health
Invoke-WebRequest -Uri "https://your-domain.com" -Method Get | Select-Object StatusCode

# Expected: StatusCode 200

# Verify cluster endpoints are gone (should return 404)
Invoke-WebRequest -Uri "https://your-domain.com/api/v1/clusters/test" -Method Get | Select-Object StatusCode

# Expected: StatusCode 404 (Not Found)
```

### Step 5: Restart Services

```powershell
# Vercel (automatic on deploy)

# Railway (automatic on deploy)

# Manual (if needed)
# Stop existing process
Stop-Process -Name "node" -Force

# Start application
pnpm start
```

**Result**: Application reverted to pre-cluster state.

---

## 3. Database Migration Rollback

**Use when**: Migration causes data corruption or schema issues.

**Impact**: Reverts database schema to pre-cluster state. **May lose cluster data**.

**Downtime**: 10-15 minutes

### Option A: Rollback Last Migration

```powershell
# Check migration status
pnpm prisma migrate status

# Rollback last migration
pnpm prisma migrate reset

# WARNING: This drops all data and reapplies migrations from scratch
# Only use in development environments
```

**For Production**: Use database backup restore (Option B)

### Option B: Restore from Backup

```powershell
# Stop application (prevent writes during restore)
# Vercel: Enable maintenance mode or stop deployments
# Railway: Scale to 0 instances

# Restore from backup (Docker)
docker exec -i the_tell_db_1 pg_restore -U thell_user -d the_tell -F c < backup_pre_cluster_20260626_120000.dump

# Verify restore
docker exec the_tell_db_1 psql -U thell_user -d the_tell -c "SELECT COUNT(*) FROM SignalTheme"

# Restart application
# Vercel: Redeploy
# Railway: Scale up instances
```

### Option C: Manual Schema Revert (Advanced)

```powershell
# Connect to database
pnpm prisma db execute --stdin <<< "ALTER TABLE SignalTheme DROP COLUMN IF EXISTS embedding"
pnpm prisma db execute --stdin <<< "ALTER TABLE SignalTheme DROP COLUMN IF EXISTS clusterSummary"
pnpm prisma db execute --stdin <<< "ALTER TABLE SignalTheme DROP COLUMN IF EXISTS lastAnalyzedAt"
pnpm prisma db execute --stdin <<< "ALTER TABLE Signal DROP COLUMN IF EXISTS clusterId"
pnpm prisma db execute --stdin <<< "DROP TABLE IF EXISTS ClusterArticle"

# Regenerate Prisma client
pnpm prisma generate
```

**Warning**: Manual schema changes can cause Prisma client mismatches. Only use if backup restore fails.

### Verify Schema Revert

```powershell
# Verify columns removed
pnpm prisma db execute --stdin <<< "SELECT column_name FROM information_schema.columns WHERE table_name = 'SignalTheme' AND column_name IN ('embedding', 'clusterSummary', 'lastAnalyzedAt')"

# Expected: 0 rows (columns removed)

# Verify ClusterArticle table dropped
pnpm prisma db execute --stdin <<< "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'ClusterArticle'"

# Expected: 0 (table does not exist)
```

**Result**: Database schema reverted to pre-cluster state.

---

## 4. Data Migration Rollback

**Use when**: Cluster data (articles, embeddings) is corrupted but schema is fine.

**Impact**: Removes cluster data but preserves schema.

**Downtime**: 5 minutes

### Step 1: Clear Cluster Data

```powershell
# Delete cluster articles
pnpm prisma db execute --stdin <<< "DELETE FROM ClusterArticle"

# Clear cluster embeddings
pnpm prisma db execute --stdin <<< "UPDATE SignalTheme SET embedding = NULL, clusterSummary = NULL"

# Clear signal cluster assignments
pnpm prisma db execute --stdin <<< "UPDATE Signal SET clusterId = NULL"

# Verify cleanup
pnpm prisma db execute --stdin <<< "SELECT COUNT(*) FROM ClusterArticle"
# Expected: 0

pnpm prisma db execute --stdin <<< "SELECT COUNT(*) FROM SignalTheme WHERE embedding IS NOT NULL"
# Expected: 0
```

### Step 2: Restart Correlation Engine

```powershell
# Run correlation to regenerate clusters
pnpm tsx scripts/run-correlation.ts

# Expected: Fresh cluster generation
```

**Result**: Cluster data cleared and regenerated.

---

## 5. Service Restart Procedures

### Vercel

```powershell
# Redeploy (automatic restart)
vercel --prod

# Or restart specific deployment
vercel restart <deployment-id>
```

### Railway

```powershell
# Restart service
railway restart

# Or redeploy
railway up
```

### Docker (Local Development)

```powershell
# Stop containers
docker-compose down

# Start containers
docker-compose up -d

# Verify containers running
docker-compose ps

# Expected: All services "Up"
```

### Manual (Node.js)

```powershell
# Stop existing process
Stop-Process -Name "node" -Force

# Start application
pnpm start

# Or for development
pnpm dev
```

---

## 6. Verification After Rollback

### Application Health

```powershell
# Test homepage
Invoke-WebRequest -Uri "https://your-domain.com" -Method Get | Select-Object StatusCode

# Expected: StatusCode 200

# Test dashboard
Invoke-WebRequest -Uri "https://your-domain.com/dashboard" -Method Get | Select-Object StatusCode

# Expected: StatusCode 200 (or 302 redirect to login)
```

### Database Connectivity

```powershell
# Test database connection
pnpm prisma db execute --stdin <<< "SELECT 1"

# Expected: Command completed successfully
```

### Core Functionality

```powershell
# Test signal feed
Invoke-RestMethod -Uri "https://your-domain.com/api/v1/signals" -Method Get | Select-Object -First 5

# Expected: Array of signals returned

# Test authentication
# Login via UI and verify session created
```

### Cluster Endpoints (Should Be Gone)

```powershell
# Verify cluster endpoints return 404 (if code reverted)
Invoke-WebRequest -Uri "https://your-domain.com/api/v1/clusters/test" -Method Get | Select-Object StatusCode

# Expected: StatusCode 404 (if full rollback completed)
```

**Verification Checklist**:
- [ ] Application homepage loads
- [ ] Dashboard accessible
- [ ] Database queries execute
- [ ] Core API endpoints respond
- [ ] Authentication works
- [ ] Cluster endpoints removed (if full rollback)
- [ ] No errors in logs

---

## 7. Common Rollback Scenarios

### Scenario 1: Migration Fails Mid-Deployment

**Symptoms**:
```
Error: Migration failed: column "embedding" already exists
```

**Solution**:
```powershell
# Check migration status
pnpm prisma migrate status

# If migration partially applied, reset database (DEV ONLY)
pnpm prisma migrate reset

# Or restore from backup (PRODUCTION)
# See Section 3, Option B
```

### Scenario 2: Cluster Articles Contain Hallucinations

**Symptoms**:
- Articles reference facts not in source signals
- Grounding score < 0.6

**Solution**:
```powershell
# Quick rollback: Disable cluster routing
# See Section 1

# Then investigate hallucination guard
# Check src/lib/ai/agent/cluster-article-generator.ts
# Verify validateArticleBody() threshold is 0.6

# Clear corrupted articles
pnpm prisma db execute --stdin <<< "DELETE FROM ClusterArticle WHERE status = 'PUBLISHED'"

# Re-run correlation with stricter validation
pnpm tsx scripts/run-correlation.ts
```

### Scenario 3: API Endpoints Return 500 Errors

**Symptoms**:
```
GET /api/v1/clusters/{id} 500 Internal Server Error
```

**Solution**:
```powershell
# Check logs
vercel logs --output raw | Select-String "ERROR"

# Common causes:
# - Missing cluster data
# - Database connection issue
# - LLM provider error

# Quick fix: Disable cluster routing (Section 1)
# Full fix: Investigate logs and fix root cause
```

### Scenario 4: Performance Degradation

**Symptoms**:
- API response times > 10 seconds
- Memory usage > 90%

**Solution**:
```powershell
# Quick rollback: Disable cluster routing (Section 1)

# Investigate performance bottlenecks
# Check for N+1 queries in cluster API routes
# Verify embedding generation is cached
# Monitor LLM API call count

# If correlation engine is slow, optimize:
# - Reduce cluster similarity threshold (0.75 → 0.80)
# - Limit analyses to last 3 days (not 7)
# - Add database indexes
```

### Scenario 5: Data Corruption After Migration

**Symptoms**:
- Cluster data missing or inconsistent
- SignalTheme.embedding is NULL for existing clusters

**Solution**:
```powershell
# Restore from backup (Section 3, Option B)

# Or regenerate cluster data
pnpm tsx scripts/run-correlation.ts

# Verify data integrity
pnpm prisma db execute --stdin <<< "SELECT COUNT(*) FROM SignalTheme WHERE embedding IS NOT NULL"
# Expected: > 0
```

---

## 8. Rollback Decision Matrix

| Issue | Severity | Rollback Type | Downtime | Data Loss |
|-------|----------|---------------|----------|-----------|
| Cluster routing broken | Medium | Quick Rollback (Section 1) | 0 min | None |
| Cluster articles hallucinating | Medium | Quick Rollback + Data Clear | 5 min | Cluster articles |
| Migration failure | Critical | Full Rollback + DB Restore | 15 min | Cluster data |
| API endpoints 500 error | High | Quick Rollback | 0 min | None |
| Performance degradation | High | Quick Rollback | 0 min | None |
| Data corruption | Critical | Full Rollback + DB Restore | 15 min | Cluster data |
| App down (all endpoints) | Critical | Full Rollback | 10 min | None |

---

## 9. Post-Rollback Actions

### Investigate Root Cause

```powershell
# Review logs
vercel logs --output raw | Select-String "ERROR"

# Check deployment history
git log --oneline -10

# Review migration status
pnpm prisma migrate status
```

### Fix Issues

- Identify root cause from logs
- Fix code or configuration
- Test locally before redeployment

### Redeploy

```powershell
# After fixes, redeploy
pnpm build
vercel --prod

# Or follow cluster-deployment-steps.md
```

### Update Documentation

```powershell
# Document rollback reason and resolution
# Update docs/deployment/cluster-rollback.md with new scenario

# Commit documentation
git add docs/deployment/cluster-rollback.md
git commit -m "docs: add rollback scenario for [issue]"
git push origin main
```

---

## 10. Rollback Testing

**Recommended**: Test rollback procedures quarterly.

### Test Quick Rollback

```powershell
# 1. Enable cluster routing in admin settings
# 2. Verify cluster endpoints respond
# 3. Disable cluster routing
# 4. Verify cluster endpoints still respond (existing data)
# 5. Verify new signals not routed to clusters
```

### Test Full Rollback

```powershell
# 1. Create test deployment with cluster code
# 2. Deploy to staging environment
# 3. Revert to pre-deployment tag
# 4. Redeploy
# 5. Verify cluster endpoints return 404
```

### Test Database Rollback

```powershell
# 1. Create database backup
# 2. Run migration
# 3. Restore from backup
# 4. Verify schema reverted
# 5. Verify data integrity
```

---

## References

- **Pre-Deployment Checklist**: `cluster-pre-deployment.md`
- **Deployment Steps**: `cluster-deployment-steps.md`
- **Validation Script**: `scripts/validate-cluster-deployment.ts`
- **Admin Guide**: `docs/admin/cluster-analysis.md`
