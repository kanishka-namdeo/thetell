# Cluster Analysis Administration Guide

**Last updated**: 2026-06-26  
**Audience**: System administrators

---

## Overview

Cluster analysis groups related signals about the same strategic theme, enabling efficient analysis and synthesis across multiple sources. Instead of analyzing each signal independently, the system identifies signals that belong to existing clusters and performs lightweight analysis, then generates comprehensive articles that weave together facts from all signals in the cluster.

### How Cluster Analysis Works

The cluster-aware pipeline introduces three key stages:

#### 1. Triage Layer

When a new signal is scraped, the system first determines whether it belongs to an existing cluster or should be analyzed standalone:

- **Embedding generation**: The signal's content is converted to a vector embedding using the configured embedding model
- **Cluster matching**: The embedding is compared against existing cluster centroids (SignalTheme records) using cosine similarity
- **Routing decision**: If similarity exceeds the configured threshold, the signal is routed to that cluster; otherwise, it undergoes full standalone analysis

**What happens during triage:**
- Matched signals skip expensive full analysis and use lightweight fact extraction
- Standalone signals undergo complete dual-agent analysis (Analyst + Gossip Girl personas)
- New clusters are created when standalone signals establish new themes

#### 2. Lightweight Analysis for Clustered Signals

Signals matched to existing clusters receive streamlined processing:

- **Fact extraction only**: Core facts are extracted without full strategic inference
- **Confidence scoring**: Facts are scored but not deeply analyzed
- **Cluster context**: Analysis leverages existing cluster knowledge rather than starting fresh
- **Faster processing**: Reduced LLM calls and token usage

**Benefits:**
- 60-80% cost reduction per signal
- 3-5x faster processing time
- Maintains quality by building on established cluster context

#### 3. Cluster Article Generation

Once a cluster accumulates signals, the system generates synthesis articles:

- **Multi-source synthesis**: Articles weave together facts from all signals in the cluster
- **Dual perspectives**: Both Analyst and Gossip Girl personas generate cluster articles
- **Evidence chain**: Articles show how facts from multiple signals build to strategic conclusions
- **Automatic regeneration**: Articles regenerate when new signals are added (configurable)

**Example**: A cluster tracking "Company X's AI Strategy" might include signals from earnings calls, job postings, patent filings, and news articles. The cluster article synthesizes all these sources into a coherent narrative.

---

## Configuration

### Enabling/Disabling Cluster Routing

Cluster routing can be toggled without restarting the system.

**Steps:**

1. Navigate to **Admin > Settings > General**
2. Locate the **"Enable Cluster Routing"** toggle
3. Switch to enable or disable
4. Click **Save Settings**

**When enabled (default):**
- New signals are triaged and routed to matching clusters
- Clustered signals receive lightweight analysis
- Cluster articles are generated automatically

**When disabled:**
- All signals undergo full standalone analysis (no triage)
- No new clusters are created
- Existing clusters remain but don't receive new signals
- Useful for debugging or when you want maximum analysis depth per signal

**Use cases for disabling:**
- Debugging analysis quality issues
- Testing full analysis pipeline
- Small signal volumes where clustering overhead isn't worthwhile
- Migrating to a new embedding model (disable, regenerate embeddings, re-enable)

### Configuring Cluster Match Threshold

The threshold determines how similar a signal must be to join an existing cluster.

**Steps:**

1. Navigate to **Admin > Settings > General**
2. Locate **"Cluster Match Threshold"** slider
3. Adjust value between **0.5** (low) and **0.95** (high)
4. Click **Save Settings**

**Threshold trade-offs:**

| Threshold | Behavior | Use Case |
|-----------|----------|----------|
| **0.5 - 0.65** | Low threshold, more signals clustered | Broad themes, aggressive clustering, cost savings |
| **0.65 - 0.80** | Moderate threshold (recommended) | Balanced approach, good for most use cases |
| **0.80 - 0.95** | High threshold, fewer signals clustered | Precise themes, more standalone analysis, higher quality |

**Recommended starting point**: **0.70**

**Tuning guidance:**
- **Too many false positives** (signals in wrong clusters): Increase threshold to 0.75-0.85
- **Too many standalone signals** (missing clustering benefits): Decrease threshold to 0.60-0.70
- **Monitor cluster sizes**: Very large clusters (>50 signals) may indicate threshold too low

**Impact on costs:**
- Lower threshold → more clustered signals → lower costs
- Higher threshold → more standalone signals → higher costs but potentially higher quality

### Configuring Auto-Regeneration

Cluster articles can regenerate automatically when new signals are added.

**Steps:**

1. Navigate to **Admin > Settings > General**
2. Locate **"Auto-Regenerate Cluster Articles"** toggle
3. Enable for automatic regeneration or disable for manual control
4. Click **Save Settings**

**When enabled:**
- Cluster articles regenerate after every new signal is added
- Ensures articles always reflect latest information
- Higher LLM costs due to frequent regeneration

**When disabled:**
- Cluster articles only regenerate when manually triggered
- Lower costs, but articles may become stale
- Requires admin to monitor and regenerate as needed

**Recommended**: Enable for active clusters with frequent signal updates, disable for stable clusters.

### Configuring Analysis Model

The model used for cluster analysis can be configured separately from standalone analysis.

**Steps:**

1. Navigate to **Admin > Settings > General**
2. Locate **"Cluster Analysis Model"** dropdown
3. Select model (e.g., `gpt-4o-mini`, `gpt-4o`, `claude-3-haiku`)
4. Click **Save Settings**

**Recommendations:**
- **Cost-conscious**: Use `gpt-4o-mini` or `claude-3-haiku` for cluster analysis
- **Quality-focused**: Use `gpt-4o` or `claude-3-sonnet` for cluster analysis
- **Balanced**: Use same model as standalone analysis for consistency

---

## Monitoring

### Viewing Cluster Metrics

**Admin Overview Dashboard:**

Navigate to **Admin > Overview** to see high-level cluster statistics:

- **Total Clusters**: Number of active signal themes
- **Avg Signals per Cluster**: Average cluster size
- **Clustered vs Standalone Ratio**: Percentage of signals routed to clusters
- **Cost Savings**: Estimated token/cost reduction from clustering

**Analytics Dashboard:**

Navigate to **Admin > Analytics** for detailed cluster metrics:

- **Cluster Growth Chart**: Shows new clusters created over time
- **Signal Distribution**: Breakdown of clustered vs standalone signals
- **Cost Savings Chart**: Token usage comparison (with vs without clustering)
- **Cluster Size Distribution**: Histogram of cluster sizes
- **Top Clusters**: Largest/most active clusters by signal count

**Interpreting metrics:**

- **Rapid cluster growth**: May indicate threshold too low, or genuine thematic concentration
- **Many small clusters** (1-2 signals each): Threshold may be too high
- **Very large clusters** (50+ signals): Consider splitting or raising threshold
- **Low cost savings**: Check that clustering is enabled and threshold is appropriate

### Viewing Cluster Details

Navigate to **Admin > Intelligence > Themes** to see all clusters:

- **Theme label**: Descriptive name of the cluster
- **Company**: Associated company (if any)
- **Signal count**: Number of signals in cluster
- **Momentum**: Rate of new signal addition
- **Status**: Active, archived, or merged
- **Last updated**: When cluster was last modified

**Actions available:**
- Click theme to view cluster detail page
- Regenerate cluster articles
- Archive inactive clusters
- Merge overlapping clusters

---

## Operations

### Regenerating Cluster Articles

Cluster articles can be manually regenerated at any time.

**Steps:**

1. Navigate to **Admin > Intelligence > Themes**
2. Find the theme/cluster you want to regenerate
3. Click the **"Regenerate Articles"** button
4. Confirm the action
5. System queues regeneration job (check **Admin > Operations > Jobs** for status)

**When to regenerate:**

- **After adding many signals**: If 5+ signals were added since last generation
- **After threshold crossings**: When cluster reaches significant size milestones (10, 25, 50 signals)
- **After model upgrades**: When you've upgraded to a better analysis model
- **Quality issues**: If articles seem outdated or miss key insights
- **Manual override**: When auto-regeneration is disabled but you want fresh articles

**Regeneration process:**
- System reads all signals in cluster
- Both Analyst and Gossip Girl personas generate new articles
- Old articles are archived (not deleted)
- New articles become active immediately
- Process takes 30-120 seconds depending on cluster size

### Archiving Clusters

Inactive clusters can be archived to reduce clutter.

**Steps:**

1. Navigate to **Admin > Intelligence > Themes**
2. Find the cluster to archive
3. Click **"Archive"** button
4. Confirm the action

**What happens:**
- Cluster status changes to `ARCHIVED`
- Cluster no longer receives new signals
- Existing articles remain accessible
- Cluster can be unarchived later if needed

**When to archive:**
- Company is no longer being monitored
- Theme is no longer relevant
- Cluster was created by mistake
- Merging into a better cluster

### Merging Clusters

Overlapping clusters can be merged to consolidate related themes.

**Steps:**

1. Navigate to **Admin > Intelligence > Themes**
2. Select two clusters to merge (checkboxes)
3. Click **"Merge Selected"** button
4. Choose which cluster to keep as primary
5. Confirm the action

**What happens:**
- All signals from secondary cluster move to primary cluster
- Secondary cluster is archived
- Primary cluster articles regenerate automatically
- Embeddings are recalculated for merged cluster

**When to merge:**
- Two clusters cover same theme with slightly different labels
- Company rebrands or changes strategy
- Initial clustering was too granular

---

## Troubleshooting

### No Clusters Being Created

**Symptoms**: All signals undergo standalone analysis, no clusters appear in Intelligence page.

**Possible causes:**

1. **Cluster routing disabled**
   - Check **Admin > Settings > General** → "Enable Cluster Routing" is ON
   - Enable if disabled

2. **Threshold too high**
   - Check **Admin > Settings > General** → "Cluster Match Threshold"
   - Lower to 0.65-0.70 if currently above 0.80
   - Save and wait for next signal to be processed

3. **Embeddings not generated**
   - Check **Admin > Operations > Jobs** for embedding generation failures
   - Verify embedding model is configured correctly
   - Check LLM provider API keys are valid
   - Review logs for embedding errors

4. **No existing clusters**
   - First few signals will always be standalone (no clusters to match against)
   - Wait for 10-20 signals to establish initial clusters
   - Check correlation engine is running (creates clusters from standalone signals)

**Diagnostic steps:**
```bash
# Check cluster routing setting
pnpm tsx scripts/check-cluster-settings.ts

# Check if embeddings exist
pnpm tsx scripts/check-signal-embeddings.ts

# View recent triage decisions
pnpm tsx scripts/check-cluster-triage.ts
```

### Cluster Articles Not Generating

**Symptoms**: Clusters exist with signals, but no articles are generated.

**Possible causes:**

1. **Auto-regeneration disabled**
   - Check **Admin > Settings > General** → "Auto-Regenerate Cluster Articles"
   - Enable if disabled, or manually trigger regeneration

2. **LLM provider issues**
   - Check **Admin > Operations > Jobs** for article generation failures
   - Verify LLM API keys are valid and have quota
   - Check rate limits haven't been exceeded
   - Review error logs for specific failures

3. **Insufficient signals**
   - Clusters need minimum 3 signals to generate articles
   - Wait for more signals or lower threshold to increase clustering

4. **Article generation model misconfigured**
   - Check **Admin > Settings > General** → "Cluster Analysis Model"
   - Ensure model name is valid for your LLM provider
   - Verify model supports long context (cluster articles need to process multiple signals)

**Diagnostic steps:**
```bash
# Check cluster article status
pnpm tsx scripts/check-cluster-articles.ts

# Manually trigger article generation
pnpm tsx scripts/regenerate-cluster-article.ts --theme-id <id>

# Check LLM provider status
pnpm tsx scripts/check-llm-provider.ts
```

### Signals Not Matching Clusters

**Symptoms**: Many standalone signals despite existing clusters on similar themes.

**Possible causes:**

1. **Threshold too high**
   - Lower threshold from current setting to 0.65-0.70
   - Monitor for 24-48 hours to see if matching improves

2. **Embedding quality issues**
   - Check if signals have sufficient content (very short signals produce poor embeddings)
   - Verify embedding model is appropriate for your content type
   - Consider switching to a domain-specific embedding model

3. **Cluster embeddings stale**
   - Large clusters may have outdated centroids
   - Trigger cluster embedding recalculation via **Admin > Intelligence > Themes** → "Recalculate Embeddings"

4. **Theme drift**
   - Company strategy changed, old clusters no longer relevant
   - Archive old clusters and let new ones form
   - Consider lowering threshold temporarily during transition periods

**Diagnostic steps:**
```bash
# Check similarity scores for recent signals
pnpm tsx scripts/check-cluster-similarity.ts

# View embedding statistics
pnpm tsx scripts/check-embedding-stats.ts

# Manually assign signal to cluster
pnpm tsx scripts/assign-signal-to-cluster.ts --signal-id <id> --theme-id <id>
```

### Performance Issues

**Symptoms**: Slow signal processing, high memory usage, timeouts during triage.

**Possible causes:**

1. **Large cluster count**
   - System compares each signal against all cluster centroids
   - With 1000+ clusters, triage becomes slow
   - Archive inactive clusters to reduce count
   - Consider hierarchical clustering for very large datasets

2. **Oversized clusters**
   - Clusters with 100+ signals have expensive article generation
   - Split large clusters into sub-themes
   - Increase threshold to create more granular clusters

3. **Embedding generation bottleneck**
   - Check if embedding model is rate-limited
   - Consider using local embedding model (Transformers.js) instead of API
   - Batch embedding generation during off-peak hours

4. **Database query performance**
   - Check for missing indexes on `SignalTheme` and `Signal` tables
   - Run `ANALYZE` on PostgreSQL tables to update statistics
   - Consider adding composite indexes for frequent queries

**Diagnostic steps:**
```bash
# Check cluster count and sizes
pnpm tsx scripts/check-cluster-stats.ts

# Profile triage performance
pnpm tsx scripts/profile-cluster-triage.ts

# Check database query performance
pnpm tsx scripts/analyze-db-performance.ts
```

**Optimization recommendations:**
- **< 100 clusters**: No optimization needed
- **100-500 clusters**: Monitor performance, archive inactive clusters
- **500-1000 clusters**: Consider hierarchical clustering, increase archival
- **> 1000 clusters**: Implement cluster hierarchy, increase threshold, aggressive archival

---

## Best Practices

### Threshold Tuning

1. **Start with 0.70** and monitor for 1-2 weeks
2. **Adjust based on cluster quality**: Review random sample of clustered signals
3. **Company-specific tuning**: Some companies may need different thresholds (e.g., diversified conglomerates vs focused startups)
4. **Seasonal adjustment**: During earnings season, lower threshold to capture more related signals

### Cost Optimization

1. **Use cheaper models for cluster analysis**: `gpt-4o-mini` for lightweight analysis, save `gpt-4o` for standalone
2. **Disable auto-regeneration** for stable clusters
3. **Archive aggressively**: Remove clusters no longer being monitored
4. **Monitor cost savings**: Check analytics dashboard monthly to verify ROI

### Quality Assurance

1. **Regular review**: Sample 10% of clusters monthly to verify quality
2. **Merge overlapping clusters**: Prevents fragmentation
3. **Update cluster labels**: Ensure theme names remain accurate as clusters evolve
4. **Monitor confidence scores**: Declining confidence may indicate theme drift

### Scaling Considerations

1. **Monitor cluster growth**: Set alerts for clusters exceeding 50 signals
2. **Plan for embedding storage**: Each signal embedding is ~6KB, plan storage accordingly
3. **Batch processing**: For large signal volumes, process in batches to avoid rate limits
4. **Consider sharding**: For very large deployments, shard by company or theme category

---

## Related Documentation

- [Cluster Threat Model](../security/cluster-threat-model.md) - Security considerations
- [Pipeline Improvement Proposals](../pipeline-improvement-proposals.md) - Technical design
- [Admin Quickstart](../ADMIN_QUICKSTART.md) - General admin setup
- [Features Built](../features-built.md) - Complete feature list
