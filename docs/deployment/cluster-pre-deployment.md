# Cluster-Aware Signal Analysis Pipeline: Pre-Deployment Checklist

**Phase 10: Deployment and Rollback**  
**Last Updated**: 2026-06-26  
**Status**: Ready for Deployment

---

## Overview

This document outlines the prerequisites and verification steps required before deploying the cluster-aware signal analysis pipeline. The cluster system introduces:

- Cluster-based signal analysis with automatic theme grouping
- Cluster article generation (dual-agent: Analyst + Gossip Girl)
- Evidence chain visualization for cluster insights
- API endpoints for cluster detail and article management

---

## 1. Database Migration Requirements

### Required Schema Changes

The cluster pipeline requires the following database schema updates:

#### SignalTheme Model Enhancements

```prisma
model SignalTheme {
  // ... existing fields ...
  
  embedding       Json?       // Cluster centroid embedding (averaged from signal embeddings)
  clusterSummary  Json?       // Cluster summary data for article generation
  lastAnalyzedAt  DateTime?   // Tracks when cluster was last analyzed
  
  clusteredSignals Signal[] @relation("SignalCluster")  // Direct cluster membership
  
  @@index([companyId, momentum])
}
```

**Migration Impact**:
- Adds 3 nullable columns to `SignalTheme` table
- Adds new many-to-many relation `SignalCluster`
- Creates index on `(companyId, momentum)` for performance

#### Signal Model Enhancement

```prisma
model Signal {
  // ... existing fields ...
  
  clusterId String?
  cluster   SignalTheme? @relation("SignalCluster", fields: [clusterId], references: [id])
  
  @@index([clusterId])
  @@index([companyId, clusterId])
}
```

**Migration Impact**:
- Adds nullable FK `clusterId` to `Signal` table
- Creates 2 indexes for efficient cluster lookups

#### New ClusterArticle Model

```prisma
model ClusterArticle {
  id            String        @id @default(cuid())
  themeId       String
  theme         SignalTheme   @relation(fields: [themeId], references: [id])
  companyId     String
  company       Company       @relation(fields: [companyId], references: [id])
  title         String
  slug          String        @unique
  summary       String        @db.Text
  body          String        @db.Text
  agentPersona  AgentPersona
  signalCount   Int           @default(0)
  status        ArticleStatus @default(DRAFT)
  publishedAt   DateTime?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@unique([themeId, agentPersona])  // One article per persona per cluster
  @@index([companyId, status])
}
```

**Migration Impact**:
- Creates new `ClusterArticle` table
- Adds unique constraint `(themeId, agentPersona)` for upsert pattern
- Creates index on `(companyId, status)`

### Migration Commands

```powershell
# Apply migrations
pnpm prisma migrate deploy

# Verify migration status
pnpm prisma migrate status

# Generate Prisma client
pnpm prisma generate
```

**Expected Output**:
```
✔ Generated Prisma Client (5.x.x)
The migration was applied successfully.
```

---

## 2. Environment Variables

**No new environment variables are required** for the cluster pipeline.

The cluster system uses existing configuration:

| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection | ✅ Yes |
| `API_KEY` | LLM provider API key | ✅ Yes |
| `BASE_URL` | LLM provider endpoint | ✅ Yes |
| `FAST_MODEL` | Fast model for clustering | ✅ Yes |
| `REASONING_MODEL` | Reasoning model for inferences | ✅ Yes |

**Verification**:
```powershell
# Check .env.local exists and has required vars
Test-Path .env.local

# Verify DATABASE_URL is set
$env:DATABASE_URL -ne $null
```

---

## 3. Dependencies to Verify

### NLP Layer (Embeddings & Similarity)

The cluster pipeline depends on local NLP models for embeddings:

```powershell
# Verify Transformers.js is installed
pnpm list @xenova/transformers

# Expected: @xenova/transformers@2.x.x
```

**Model Cache**:
- Embedding models are cached in `node_modules/.cache/transformers/`
- First run downloads ~100MB model files
- Verify cache exists or allow time for initial download

### Database Connection

```powershell
# Test database connectivity
pnpm prisma db execute --stdin <<< "SELECT 1"

# Expected: Command completed successfully
```

### LLM Provider

```powershell
# Test LLM provider connectivity
pnpm tsx scripts/test-llm-connection.ts

# Expected: "LLM provider connection successful"
```

---

## 4. Backup Procedures

### Database Backup

**Before deploying migrations, create a full database backup**:

```powershell
# Docker-based backup (local dev)
docker exec the_tell_db_1 pg_dump -U thell_user -d the_tell -F c > backup_cluster_deploy_$(Get-Date -Format "yyyyMMdd_HHmmss").dump

# Verify backup file size
Get-ChildItem backup_cluster_deploy_*.dump | Select-Object Name, Length
```

**Production Backup** (Railway/Supabase):
```powershell
# Railway
railway backup create

# Supabase
# Use Supabase dashboard > Database > Backups > Create backup
```

### Code Backup

```powershell
# Create git tag before deployment
git tag -a v0.x.x-cluster-deploy -m "Pre-cluster deployment checkpoint"
git push origin v0.x.x-cluster-deploy

# Verify tag
git tag -l "v0.x.x-cluster-deploy"
```

---

## 5. Rollback Plan Overview

### Quick Rollback (Disable Cluster Routing)

If cluster issues are detected post-deployment, disable cluster routing via admin settings:

1. Navigate to **Admin Dashboard > Settings > General**
2. Set `clusterRoutingEnabled` to `false`
3. Save settings
4. System falls back to standalone signal analysis

**Impact**: New signals are analyzed individually, existing clusters remain accessible but are not updated.

### Full Rollback

If quick rollback is insufficient:

1. **Revert code** to pre-deployment tag
2. **Rollback database migration** (see `cluster-rollback.md`)
3. **Restart services**
4. **Verify system health**

**Detailed procedures**: See `cluster-rollback.md`

---

## 6. Testing Requirements Before Deployment

### Unit Tests

```powershell
# Run cluster article generator tests
pnpm test src/lib/ai/agent/__tests__/cluster-article-generator.test.ts

# Expected: All tests pass (8 test cases)
```

**Test Coverage**:
- ✅ Both personas (Analyst, Gossip Girl) produce correct output
- ✅ Different personas produce different content
- ✅ Hallucination guard validation
- ✅ Empty facts handling
- ✅ Provider error handling
- ✅ Grounding score range validation
- ✅ Unique slug generation

### Integration Tests

```powershell
# Run correlation engine tests (if available)
pnpm test src/lib/inngest/__tests__/correlation.test.ts

# Expected: All tests pass
```

### Manual Testing

**Test Cluster Article Generation**:

```powershell
# Run standalone correlation script
pnpm tsx scripts/run-correlation.ts

# Expected output:
# "Loaded X analyses"
# "Clustered Y themes"
# "Generated Z cluster articles"
```

**Verify Cluster API Endpoints**:

```powershell
# Start dev server
pnpm dev

# Test cluster detail endpoint (replace {id} with actual theme ID)
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/clusters/{id}" -Method Get

# Expected: JSON response with theme, signals, inferences, evidenceChain
```

---

## 7. Monitoring Setup Verification

### Logging

Verify Pino logger is configured:

```powershell
# Check logger configuration
Test-Path src/lib/logger.ts

# Verify cluster-specific logging
Select-String -Path "src/lib/inngest/correlation.ts" -Pattern "logger\." | Select-Object -First 5
```

**Expected Log Output**:
```
[INFO] correlation: Loaded 150 analyses from last 7 days
[INFO] correlation: Clustered 23 themes with similarity > 0.75
[INFO] correlation: Generated 5 cluster articles for company XYZ
```

### Error Tracking

Verify error handling in cluster pipeline:

```powershell
# Check for try-catch blocks
Select-String -Path "src/lib/inngest/correlation.ts" -Pattern "catch" | Measure-Object

# Expected: Multiple catch blocks for graceful error handling
```

### Performance Monitoring

**Key Metrics to Monitor**:
- Cluster generation time (target: < 5 minutes for 1000 signals)
- LLM API call count (track costs)
- Database query performance (check for N+1 queries)
- Embedding generation time (local model performance)

**Monitoring Tools**:
- **Local**: Console logs + `scripts/run-correlation.ts` timing output
- **Production**: Vercel Analytics, Railway Logs, or equivalent

---

## 8. Deployment Readiness Checklist

### Pre-Deployment Verification

- [ ] Database backup created
- [ ] Git tag created for rollback
- [ ] All unit tests pass (`pnpm test`)
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Database migrations tested locally
- [ ] Cluster article generation tested manually
- [ ] API endpoints tested and responding
- [ ] Logging verified (no console.log in production code)
- [ ] Environment variables verified (no new vars needed)
- [ ] NLP model cache verified (or time allocated for download)
- [ ] Rollback plan reviewed with team
- [ ] Monitoring tools configured

### Deployment Window

**Recommended Deployment Time**:
- **Low-traffic period**: 2:00 AM - 4:00 AM local time
- **Avoid**: Business hours, during major news events (high signal volume)
- **Duration**: 15-30 minutes (including verification)

### Communication Plan

**Before Deployment**:
- Notify team: "Cluster pipeline deployment scheduled for [time]"
- Update status page (if applicable): "Scheduled maintenance"

**After Deployment**:
- Notify team: "Cluster pipeline deployed successfully"
- Monitor for 1 hour post-deployment
- Update status page: "Maintenance complete"

---

## 9. Common Issues and Solutions

### Issue 1: Migration Fails with "Column already exists"

**Cause**: Partial migration from previous attempt

**Solution**:
```powershell
# Check migration status
pnpm prisma migrate status

# Reset database (DEV ONLY - destroys data)
pnpm prisma migrate reset

# Or manually drop problematic columns
pnpm prisma db execute --stdin <<< "ALTER TABLE SignalTheme DROP COLUMN IF EXISTS embedding"
```

### Issue 2: Embedding Model Download Fails

**Cause**: Network issues or model cache corruption

**Solution**:
```powershell
# Clear model cache
Remove-Item -Recurse -Force node_modules/.cache/transformers/

# Restart dev server (triggers re-download)
pnpm dev

# Monitor download progress in console
```

### Issue 3: Cluster Article Generation Returns Empty

**Cause**: Insufficient signals in cluster (need 3+ signals)

**Solution**:
```powershell
# Check signal count per theme
pnpm prisma db execute --stdin <<< "SELECT themeId, COUNT(*) FROM Signal GROUP BY themeId HAVING COUNT(*) >= 3"

# If no clusters have 3+ signals, wait for more signal ingestion
# Or run correlation manually with lower threshold (advanced)
```

### Issue 4: API Endpoint Returns 404

**Cause**: Route not registered or build not updated

**Solution**:
```powershell
# Verify route file exists
Test-Path src/app/api/v1/clusters/[id]/route.ts

# Rebuild application
pnpm build

# Restart dev server
pnpm dev
```

---

## 10. Next Steps

After completing this pre-deployment checklist:

1. **Proceed to deployment**: See `cluster-deployment-steps.md`
2. **Review rollback procedures**: See `cluster-rollback.md`
3. **Run validation script**: `scripts/validate-cluster-deployment.ts`

---

## References

- **Admin Guide**: `docs/admin/cluster-analysis.md`
- **API Documentation**: `docs/api-clusters.md`
- **User Guide**: `docs/user/clusters-and-inferences.md`
- **Security Considerations**: `docs/security/cluster-threat-model.md`
- **Feature Status**: `docs/features-built.md`
