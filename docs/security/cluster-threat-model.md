# Cluster-Aware Analysis — Threat Model

**Last updated**: 2026-06-26  
**Scope**: Cluster triage, cluster article generation, cluster API endpoints, data isolation  
**Status**: Design-time review (code is being built in parallel)

---

## System Context

The cluster-aware pipeline introduces three new data flows:

1. **Cluster Triage** — signal embeddings compared against existing `SignalTheme` centroids to route signals to clusters
2. **Cluster Article Generation** — LLM synthesizes articles from all signals in a cluster
3. **Cluster API Endpoints** — new public read and admin write endpoints for cluster data

### Authentication Model

- Users have `role` (USER | ADMIN) but **no company-scoped access control**. The `User` model has no `companyId` field.
- Users associate with companies via `WatchedCompany` (opt-in tracking), not access control.
- The app is effectively **single-tenant with public read access** to signal/inference/article data.
- Admin role gates all write operations (via `requireAdmin()` in `auth-guard.ts` and edge checks in `proxy.ts`).

### Existing Security Boundaries

| Layer | Mechanism | File |
|---|---|---|
| Edge proxy | Route-level auth, rate limiting, bot blocking | `src/proxy.ts` |
| API routes | `requireAdmin(session)` checks | `src/lib/auth-guard.ts` |
| Audit trail | `logAuditEvent()` for admin actions | `src/lib/audit-logger.ts` |
| Input validation | Zod schemas on API inputs | Per-route |

---

## Threat 1: Cross-Company Cluster Access (Information Leakage)

| Attribute | Value |
|---|---|
| **ID** | CLUSTER-001 |
| **Category** | Information Leakage |
| **Description** | Company A's signals matched to Company B's clusters, leaking strategic insights across company boundaries |
| **Likelihood** | Low |
| **Impact** | High (strategic intelligence leakage) |
| **Risk (pre-mitigation)** | Medium |
| **Risk (post-mitigation)** | Low |

### Attack Vectors

1. **Triage query without companyId filter** — signal embedding compared against all companies' clusters
2. **Cluster cache key collision** — cached embeddings from Company A served for Company B's triage
3. **Backfill script cross-contamination** — batch assignment ignores company boundaries

### Mitigations (Design)

| Control | Implementation | Verification |
|---|---|---|
| companyId filter in triage query | `triageSignalToCluster(embedding, companyId)` requires companyId parameter; SQL includes `WHERE "companyId" = $companyId` | Code review of `cluster-triage.ts` and `embedding-store.ts` |
| Per-company cache keys | Cache key format: `cluster:embeddings:{companyId}` — company-scoped by design | Code review of `cluster-cache.ts` |
| Signal creation always has companyId | Signals are created with `companyId` from the discovery source; triage receives it from the signal record | Verified in `discovery.ts` signal creation flow |
| Backfill script scoped per company | Backfill iterates signals and passes `signal.companyId` to triage | Code review of `backfill-cluster-assignments.ts` |

### Residual Risk

**Low.** The companyId filter is enforced at the data layer (Prisma query), not just the application layer. Cache keys are inherently scoped. No user-facing input can override the companyId (it comes from the signal record, not from request parameters).

---

## Threat 2: Hallucinated Facts in Cluster Articles

| Attribute | Value |
|---|---|
| **ID** | CLUSTER-002 |
| **Category** | Data Integrity / Misinformation |
| **Description** | LLM generates facts in cluster articles that are not present in any source signal, producing misleading intelligence |
| **Likelihood** | Medium |
| **Impact** | Medium (misleading intelligence, reputational risk) |
| **Risk (pre-mitigation)** | Medium |
| **Risk (post-mitigation)** | Low |

### Attack Vectors

1. **LLM hallucination** — model fabricates facts not grounded in source signals
2. **Cross-signal fact bleed** — facts from Company A's signals appear in Company B's cluster article (if triage is compromised)
3. **Summary drift** — repeated cluster summary updates gradually introduce inaccuracies

### Mitigations (Design)

| Control | Implementation | Verification |
|---|---|---|
| Source-constrained prompts | `buildClusterFactExtractionPrompt()` instructs LLM: "Extract facts ONLY from the provided signal text" | Prompt review in `prompts.ts` |
| Cluster article source constraint | `generateClusterArticle()` receives only signals from the target cluster; prompt says "Reference ONLY facts from these signals" | Code review of `cluster-article-generator.ts` |
| Hallucination guard (Jaccard similarity) | Existing hallucination guard validates extracted facts against source text with Jaccard similarity threshold | Verify in `pipeline.ts` hallucination detection |
| Fact deduplication in summary | Cluster summary merges facts with text similarity > 0.85 dedup — prevents drift from duplicate injection | Code review of `cluster-update.ts` |
| Evidence chain provenance | Cluster articles include fact-to-signal mapping, enabling manual verification | UI review of evidence chain component |

### Residual Risk

**Low.** LLM hallucination cannot be eliminated entirely, but the combination of source-constrained prompts, Jaccard validation, and evidence chain provenance provides multiple layers of defense. The evidence chain is particularly valuable because it lets users trace every fact back to its source signal.

---

## Threat 3: Data Leakage in Triage (Embedding Comparison)

| Attribute | Value |
|---|---|
| **ID** | CLUSTER-003 |
| **Category** | Information Leakage |
| **Description** | Signal embedding compared against wrong company's cluster centroids during triage |
| **Likelihood** | Low (if companyId filter is enforced) |
| **Impact** | High (cross-company intelligence leakage) |
| **Risk (pre-mitigation)** | Medium |
| **Risk (post-mitigation)** | Low |

### Attack Vectors

1. **Missing WHERE clause** — triage SQL query omits `companyId` filter
2. **pgvector query without company scope** — `<=>` operator matches across all companies' embeddings
3. **Race condition** — company filter applied after embedding comparison (TOCTOU)

### Mitigations (Design)

| Control | Implementation | Verification |
|---|---|---|
| SQL WHERE clause | `findMatchingCluster()` query: `WHERE "companyId" = $companyId AND embedding IS NOT NULL` | Code review of `embedding-store.ts` |
| pgvector company scope | Raw SQL: `SELECT ... FROM "SignalTheme" WHERE "companyId" = ${companyId} ... ORDER BY embedding <=> ${embedding}::vector LIMIT 1` | Code review |
| Atomic filter + compare | Company filter and similarity comparison happen in the same SQL query — no TOCTOU window | Query design review |
| Status filter | Only active themes (`EMERGING`, `ACCELERATING`, `PEAKED`) are eligible for matching | Reduces attack surface |

### Residual Risk

**Low.** The filter is applied at the database level in a single atomic query. There is no code path where embeddings are compared without the company filter.

---

## Threat 4: Cluster Summary Poisoning

| Attribute | Value |
|---|---|
| **ID** | CLUSTER-004 |
| **Category** | Data Integrity |
| **Description** | Malicious or low-quality signal content corrupts cluster summary over time |
| **Likelihood** | Low (signals are scraped from trusted sources, not user-submitted) |
| **Impact** | Medium (misleading cluster analysis) |
| **Risk (pre-mitigation)** | Low |
| **Risk (post-mitigation)** | Low |

### Attack Vectors

1. **Low-quality signal ingestion** — scraped content with misleading claims enters cluster
2. **Summary drift** — repeated LLM summarizations gradually shift the cluster narrative
3. **Concurrent update race** — two signals updating the same cluster simultaneously cause lost updates

### Mitigations (Design)

| Control | Implementation | Verification |
|---|---|---|
| Quality gate | Existing NLP quality gate filters low-quality content before analysis (`quality-gate.ts`) | Existing control |
| Fact deduplication | Cluster summary merges facts with similarity > 0.85 — prevents duplicate injection | Code review of `cluster-update.ts` |
| Optimistic locking | Cluster summary updates use optimistic concurrency control | Code review |
| Regeneration capability | Cluster summaries can be fully regenerated from signal analyses (derived data) | Admin API: `POST /api/v1/clusters/[themeId]/articles` |
| Audit trail | `cluster.summary_updated` events track every modification with signalId | Audit log review |

### Residual Risk

**Low.** Signals come from curated sources (RSS feeds, SEC filings, press releases), not user input. The quality gate provides an additional filter. Cluster summaries are fully regenerable from source data.

---

## Threat 5: Unauthorized Cluster Article Generation

| Attribute | Value |
|---|---|
| **ID** | CLUSTER-005 |
| **Category** | Authorization Bypass |
| **Description** | Non-admin user triggers cluster article regeneration, consuming LLM resources or generating unwanted content |
| **Likelihood** | Low |
| **Impact** | Low (resource consumption, no data leakage) |
| **Risk (pre-mitigation)** | Low |
| **Risk (post-mitigation)** | Minimal |

### Attack Vectors

1. **POST endpoint without admin check** — `POST /api/v1/clusters/[themeId]/articles` accessible to regular users
2. **Edge proxy bypass** — cluster write endpoint not covered by `ADMIN_WRITE_PATTERNS` in `proxy.ts`

### Mitigations (Design)

| Control | Implementation | Verification |
|---|---|---|
| Route handler auth check | POST handler calls `requireAdmin(session)` before proceeding | Code review of articles route |
| Edge proxy write guard | Add `/api/v1/clusters/` to `ADMIN_WRITE_PATTERNS` for POST/PUT/PATCH/DELETE | Code review of `proxy.ts` |
| Audit logging | `cluster.article_generated` event logged with userId | Audit log review |

### Residual Risk

**Minimal.** Dual-layer protection (edge proxy + route handler). Admin-only write is consistent with existing patterns for signals, articles, and companies.

---

## Threat 6: Cluster API Endpoint Exposure

| Attribute | Value |
|---|---|
| **ID** | CLUSTER-006 |
| **Category** | Access Control |
| **Description** | Cluster detail or article endpoints inadvertently require authentication when they should be public, or vice versa |
| **Likelihood** | Medium (configuration error) |
| **Impact** | Medium (either blocks public access or exposes admin functionality) |
| **Risk (pre-mitigation)** | Medium |
| **Risk (post-mitigation)** | Low |

### Endpoint Classification

| Endpoint | Method | Auth Required | Rationale |
|---|---|---|---|
| `/api/v1/clusters/[id]` | GET | No | Follows existing pattern: signal detail, article detail, inference detail are all public |
| `/api/v1/clusters/[themeId]/articles` | GET | No | Follows existing pattern: article listing is public |
| `/api/v1/clusters/[themeId]/articles` | POST | Yes (Admin) | Write operation — generates LLM content |

### Mitigations (Design)

| Control | Implementation | Verification |
|---|---|---|
| Public GET patterns | Add `/^\/api\/v1\/clusters\/[^/]+\/?$/` and `/^\/api\/v1\/clusters\/[^/]+\/articles\/?$/` to `PUBLIC_API_GET_PATTERNS` in `proxy.ts` | Code review of `proxy.ts` |
| Admin write pattern | Add `/^\/api\/v1\/clusters/` to `ADMIN_WRITE_PATTERNS` for non-GET methods | Code review of `proxy.ts` |
| Route handler auth | GET handlers: no auth check. POST handler: `requireAdmin(session)` | Code review of route handlers |

### Residual Risk

**Low.** The endpoint classification follows established patterns. The proxy.ts whitelist approach means new endpoints default to protected (auth required) unless explicitly added to public patterns — fail-safe by default.

---

## Threat Summary Matrix

| ID | Threat | Likelihood | Impact | Pre-Mitigation Risk | Post-Mitigation Risk |
|---|---|---|---|---|---|
| CLUSTER-001 | Cross-Company Cluster Access | Low | High | Medium | **Low** |
| CLUSTER-002 | Hallucinated Facts in Articles | Medium | Medium | Medium | **Low** |
| CLUSTER-003 | Data Leakage in Triage | Low | High | Medium | **Low** |
| CLUSTER-004 | Cluster Summary Poisoning | Low | Medium | Low | **Low** |
| CLUSTER-005 | Unauthorized Article Generation | Low | Low | Low | **Minimal** |
| CLUSTER-006 | API Endpoint Exposure | Medium | Medium | Medium | **Low** |

---

## Data Retention

| Data Type | Retention Policy | Rationale |
|---|---|---|
| ClusterArticle | Same as Article | Derived content, follows existing article retention |
| SignalTheme.clusterSummary | Regenerable from signal analyses | Derived data, no special retention needed |
| Signal.clusterId | Metadata (foreign key) | Not PII, follows signal retention |
| Audit logs for cluster ops | Same as other audit logs | Standard retention per AuditLog model |

---

## Compliance Notes

- **No PII in cluster data**: Clusters aggregate signal facts about companies, not individuals. Signal-cluster associations are metadata.
- **No cross-border data concerns**: Cluster data stays within the same database as signals.
- **Right to deletion**: Cluster summaries are derived data and can be regenerated. Deleting a signal removes its cluster association automatically via Prisma cascade.
- **Audit trail completeness**: All cluster mutations logged via `logAuditEvent()` with userId, action, resourceId, and details.
