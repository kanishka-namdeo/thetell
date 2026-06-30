# Clusters and Inferences: A User Guide

**Last updated**: 2026-06-26  
**Audience**: Analysts, corporate strategists, financial journalists

---

## Overview

The Tell organizes corporate intelligence into three layers of increasing insight:

1. **Signals** — Individual pieces of public information (news articles, filings, job postings, etc.)
2. **Clusters** — Groups of related signals about the same strategic theme
3. **Inferences** — Strategic conclusions drawn from analyzing clusters of signals

Understanding how these layers connect helps you navigate The Tell effectively and extract maximum value from the platform.

---

## What Are Clusters?

Clusters are groups of related signals that share a common strategic theme. Instead of presenting signals in isolation, The Tell identifies when multiple signals are talking about the same underlying corporate development.

### How Clusters Work

When The Tell receives a new signal, it:

1. **Analyzes the content** using AI to understand the strategic theme
2. **Compares against existing clusters** to see if it belongs to an existing theme
3. **Either joins an existing cluster** or **creates a new cluster** if the theme is novel

**Example:**

Imagine tracking Tesla's autonomous driving strategy. Signals might include:
- News article about Tesla's Q3 autopilot improvements
- Job posting for computer vision engineers
- Patent filing for sensor fusion technology
- Earnings call transcript mentioning "full self-driving"
- Social media post from an executive about AI progress

All five signals belong to the same cluster: **"Tesla's Autonomous Driving Strategy"**

### Why Clusters Matter

Clusters help you:

- **See the big picture**: Understand how multiple data points connect to a single strategic theme
- **Assess confidence**: More signals in a cluster = stronger evidence for the theme
- **Track momentum**: Watch how clusters grow over time as new signals arrive
- **Save time**: Read one cluster summary instead of five separate signal analyses

### Cluster Characteristics

Each cluster has:

| Attribute | Description |
|-----------|-------------|
| **Theme label** | Descriptive name (e.g., "Apple's AR/VR Strategy") |
| **Company** | The organization being analyzed |
| **Signal count** | Number of signals in the cluster |
| **Momentum** | Rate at which new signals are being added |
| **Status** | Active, archived, or merged |
| **Cluster articles** | Synthesis articles written from all signals in the cluster |

---

## What Are Inferences?

Inferences are strategic conclusions drawn from analyzing clusters of signals. While signals tell you **what happened**, inferences tell you **what it means**.

### How Inferences Are Generated

The Tell's AI analyzes clusters to extract strategic insights:

1. **Fact extraction**: Key facts are extracted from each signal in the cluster
2. **Pattern detection**: AI identifies patterns across multiple signals
3. **Strategic inference**: AI infers the company's strategic intent
4. **Confidence scoring**: Each inference is scored (0.0-1.0) based on evidence strength

**Example:**

**Signals in cluster:**
- Job posting: "Hiring 50 ML engineers for autonomous driving team"
- News article: "Tesla increases R&D budget by 30%"
- Earnings call: "We're accelerating our full self-driving timeline"
- Patent filing: "New sensor fusion algorithm for obstacle detection"

**Inference:**
> "Tesla is significantly accelerating its autonomous driving development, with strong evidence of increased investment, hiring, and technical progress. Confidence: 0.87"

### Inference Characteristics

Each inference has:

| Attribute | Description |
|-----------|-------------|
| **Label** | Strategic conclusion (e.g., "Company is planning major expansion") |
| **Confidence** | AI-assessed probability the inference is correct (0.0-1.0) |
| **Supporting signals** | Links to signals that support the inference |
| **Evidence chain** | Shows how facts from multiple signals build to the conclusion |
| **Status** | Active, superseded, or retracted |

### Confidence Scores

Confidence scores indicate how strongly the evidence supports the inference:

| Score | Meaning | Interpretation |
|-------|---------|----------------|
| **0.8-1.0** | High confidence | Strong evidence, multiple corroborating signals |
| **0.6-0.8** | Medium confidence | Moderate evidence, some gaps or contradictions |
| **0.4-0.6** | Low confidence | Limited evidence, treat as preliminary |
| **< 0.4** | Very low confidence | Insufficient evidence, likely unreliable |

**Note**: Confidence scores are AI-generated estimates, not guarantees. Always review the evidence chain and supporting signals before making decisions.

---

## The Evidence Chain

The evidence chain shows how facts from multiple signals build up to an inference. It's a visual representation of the reasoning process.

### How to Read the Evidence Chain

The evidence chain flows from signals → facts → inference:

```
Signal 1 (News Article)
  ├─ Fact: "Company raised $500M in Series D" (confidence: 0.95)
  └─ Fact: "Funding will be used for expansion" (confidence: 0.90)

Signal 2 (Job Posting)
  ├─ Fact: "Hiring 100 sales representatives" (confidence: 0.92)
  └─ Fact: "Positions in 5 new international markets" (confidence: 0.88)

Signal 3 (Earnings Call)
  ├─ Fact: "CEO mentioned 'aggressive growth strategy'" (confidence: 0.93)
  └─ Fact: "Targeting 40% revenue growth next year" (confidence: 0.91)

↓

Inference: "Company is planning major international expansion"
Confidence: 0.89
```

### Evidence Chain Components

**Signal layer:**
- Each signal contributes facts to the inference
- Signals are ordered by relevance and confidence
- Click any signal to view full details

**Fact layer:**
- Individual facts extracted from signals
- Each fact has a confidence score
- Higher confidence facts are shown first
- Facts are color-coded by confidence (green = high, yellow = medium, red = low)

**Inference layer:**
- Strategic conclusion drawn from all facts
- Overall confidence score reflects strength of evidence
- Links to related inferences and clusters

### Tips for Using the Evidence Chain

1. **Start with high-confidence facts**: Focus on facts with confidence > 0.8
2. **Look for corroboration**: Facts that appear in multiple signals are more reliable
3. **Check for contradictions**: If facts conflict, the inference may be less reliable
4. **Review source quality**: News articles and filings are generally more reliable than social media
5. **Consider the full picture**: Don't rely on a single fact; look at the pattern across all signals

---

## Navigation Guide

The Tell provides multiple ways to navigate between signals, clusters, and inferences.

### From the Public Feed

The public feed shows the latest signals across all companies.

**To view a cluster:**
1. Browse the feed at the home page
2. Look for signals with a cluster badge (shows cluster name)
3. Click the cluster badge → Opens cluster detail page

**To view a signal:**
1. Browse the feed
2. Click any signal card → Opens signal detail page

### From the Cluster Detail Page

The cluster detail page shows all signals in a cluster and related inferences.

**What you'll see:**
- Cluster overview (theme, company, signal count, momentum)
- List of all signals in the cluster
- Related inferences
- Cluster articles (synthesis of all signals)

**Navigation options:**
- **Click a signal** → Opens signal detail page
- **Click an inference** → Opens inference detail page
- **Click "View All Articles"** → See all cluster articles (Analyst + Gossip Girl perspectives)

### From the Signal Detail Page

The signal detail page shows the full analysis of a single signal.

**What you'll see:**
- Signal metadata (source, date, company)
- Full content or summary
- Analysis results (facts, sentiment, themes)
- Agent perspectives (Analyst + Gossip Girl analyses)
- Related signals and clusters

**Navigation options:**
- **Click "View Cluster"** → Opens cluster detail page (if signal belongs to a cluster)
- **Click related signals** → Opens other signal detail pages
- **Click inferences** → Opens inference detail pages

### From the Inference Detail Page

The inference detail page shows the strategic conclusion and supporting evidence.

**What you'll see:**
- Inference label and confidence score
- Evidence chain showing how facts build to the conclusion
- All supporting signals
- Related inferences

**Navigation options:**
- **Click any signal in the evidence chain** → Opens signal detail page
- **Click related inferences** → Opens other inference detail pages
- **Click "View Cluster"** → Opens the cluster this inference was derived from

### From the Dashboard (Authenticated Users)

The dashboard provides additional navigation options for logged-in users.

**Signals tab:**
- View all signals with filtering and search
- Click any signal → Signal detail page
- Filter by cluster to see all signals in a theme

**Companies tab:**
- View all tracked companies
- Click a company → See all signals, clusters, and inferences for that company
- Use "Watchlist" filter to see only companies you're tracking

**Strategic Insights tab:**
- View all inferences across all companies
- Filter by confidence, company, or theme
- Click any inference → Inference detail page

---

## Cluster Articles vs Signal Articles

The Tell generates two types of articles: signal articles and cluster articles. Understanding the difference helps you choose the right content for your needs.

### Signal Articles

Signal articles analyze a single signal in depth.

**Characteristics:**
- Focus on one source (one news article, one filing, one job posting, etc.)
- Provide detailed analysis of that specific signal
- Include both Analyst and Gossip Girl perspectives
- Show facts, sentiment, and strategic implications for that signal

**When to read signal articles:**
- You want detailed analysis of a specific source
- You're researching a particular event or announcement
- You need to understand the full context of one signal
- You're verifying information from a specific source

**Example:**
> "Tesla's Q3 Earnings Call: Autopilot Progress and Production Challenges"
> Analysis of a single earnings call transcript

### Cluster Articles

Cluster articles synthesize multiple signals in a cluster into a cohesive narrative.

**Characteristics:**
- Weave together facts from multiple signals
- Show how different sources corroborate or contradict each other
- Provide a holistic view of the strategic theme
- Include both Analyst and Gossip Girl perspectives
- Display "Built from N signals" badge to show scope

**When to read cluster articles:**
- You want a comprehensive overview of a strategic theme
- You need to understand how multiple data points connect
- You're short on time and want the big picture
- You're preparing a briefing or report on a company's strategy

**Example:**
> "Tesla's Autonomous Driving Strategy: Accelerating Development Amid Regulatory Challenges"
> Synthesis of 12 signals including news, filings, job postings, and earnings calls

### Key Differences

| Aspect | Signal Articles | Cluster Articles |
|--------|----------------|------------------|
| **Scope** | Single source | Multiple sources |
| **Depth** | Detailed analysis of one signal | Broad synthesis across signals |
| **Perspective** | What this one source tells us | What all sources together tell us |
| **Evidence** | Facts from one signal | Facts from multiple signals |
| **Confidence** | Based on one source's reliability | Based on corroboration across sources |
| **Badge** | None | "Built from N signals" |
| **Use case** | Deep dive on one event | Strategic overview of a theme |

### How to Access Both Types

**Signal articles:**
- From signal detail page → Click "View Article" tab
- Both Analyst and Gossip Girl versions available

**Cluster articles:**
- From cluster detail page → Click "Cluster Articles" section
- Both Analyst and Gossip Girl versions available
- Look for "Built from N signals" badge

---

## Practical Workflows

### Workflow 1: Monitoring a Company

**Goal**: Stay informed about a specific company's strategic moves.

**Steps:**
1. Navigate to **Dashboard > Companies**
2. Find the company you want to track
3. Click "Add to Watchlist" (star icon)
4. Navigate to **Dashboard > Signals**
5. Filter by company → See all recent signals
6. Review signals with high confidence scores
7. Click signals of interest → Read full analysis
8. Check for clusters → Read cluster articles for comprehensive overview

**Frequency**: Daily or weekly, depending on your needs.

### Workflow 2: Investigating a Strategic Theme

**Goal**: Understand a specific strategic theme (e.g., "AI adoption in healthcare").

**Steps:**
1. Navigate to **Dashboard > Strategic Insights**
2. Search for the theme or browse inferences
3. Click an inference of interest → Opens inference detail page
4. Review the evidence chain → See how facts build to the conclusion
5. Click supporting signals → Read detailed analyses
6. Navigate to the cluster → See all related signals
7. Read cluster articles → Get comprehensive synthesis
8. Explore related inferences → Understand broader context

**Frequency**: As needed for research projects or investment decisions.

### Workflow 3: Quick Daily Briefing

**Goal**: Get a quick overview of what's happening across all tracked companies.

**Steps:**
1. Navigate to the public feed (home page)
2. Scan the latest signals
3. Look for signals with high confidence scores
4. Check for new clusters (indicates emerging themes)
5. Click cluster badges → Read cluster articles for key themes
6. Note any high-confidence inferences (confidence > 0.8)

**Frequency**: Daily, 5-10 minutes.

### Workflow 4: Preparing a Briefing or Report

**Goal**: Prepare a comprehensive briefing on a company or theme.

**Steps:**
1. Identify the company or theme
2. Navigate to the company page or search for the theme
3. Review all clusters related to the company/theme
4. Read cluster articles for each cluster (both Analyst and Gossip Girl perspectives)
5. Review high-confidence inferences
6. Examine evidence chains for key inferences
7. Click through to supporting signals for detailed analysis
8. Export or note key findings
9. Synthesize into your briefing/report

**Frequency**: As needed for meetings, investment decisions, or published reports.

---

## Tips for Effective Use

### 1. Prioritize High-Confidence Content

Focus on signals and inferences with high confidence scores (> 0.7). These have stronger evidence and more reliable analysis.

### 2. Read Cluster Articles First

Cluster articles provide the most comprehensive view. Start with cluster articles, then drill into specific signals if you need more detail.

### 3. Compare Agent Perspectives

Both Analyst and Gossip Girl perspectives offer valuable insights:
- **Analyst**: Data-driven, focused on numbers and facts
- **Gossip Girl**: Narrative-driven, focused on subtext and patterns

Read both to get a complete picture.

### 4. Track Momentum

Clusters with high momentum (rapidly growing) indicate emerging themes. Pay attention to these for early signals of strategic shifts.

### 5. Use the Evidence Chain

The evidence chain shows you the reasoning behind inferences. Don't just look at the conclusion; understand how the AI reached it.

### 6. Cross-Reference Sources

If an inference is supported by multiple signal types (news + filings + job postings), it's more reliable than one supported by a single source type.

### 7. Monitor Over Time

Strategic themes evolve. Check back on clusters periodically to see how they develop as new signals arrive.

### 8. Use Filters Effectively

The dashboard provides powerful filters:
- Filter by company
- Filter by signal type (news, filing, job posting, etc.)
- Filter by confidence score
- Filter by date range

Use these to focus on what matters most to you.

---

## Common Questions

### Q: How are clusters created?

A: Clusters are created automatically by The Tell's AI. When a new signal arrives, the system compares it against existing clusters using semantic similarity. If it matches an existing cluster (based on a configurable threshold), it's added to that cluster. If it's sufficiently different, a new cluster is created.

### Q: Can I manually create or edit clusters?

A: Currently, clusters are created and managed automatically by the system. Manual cluster management features may be added in future updates.

### Q: How often are cluster articles updated?

A: Cluster articles are regenerated automatically when new signals are added to the cluster (if auto-regeneration is enabled by admins). Otherwise, they're updated periodically or when manually triggered by administrators.

### Q: Why don't all signals belong to clusters?

A: Some signals are unique or don't match existing themes closely enough. These "standalone" signals undergo full analysis on their own. Over time, if related signals arrive, they may form a new cluster.

### Q: Can I trust the confidence scores?

A: Confidence scores are AI-generated estimates based on the strength and consistency of evidence. They're useful guidelines, not guarantees. Always review the evidence chain and supporting signals before making important decisions.

### Q: What's the difference between a cluster and a theme?

A: In The Tell's system, clusters and themes are the same thing. The technical term is "SignalTheme," but we use "cluster" in the user interface for clarity.

### Q: How do I know if a cluster is still relevant?

A: Check the cluster's status (active vs archived) and momentum. Active clusters with recent signals are current. Archived clusters are no longer being monitored. You can also check the "Last updated" timestamp.

### Q: Can I export cluster data?

A: Export features are being developed. For now, you can manually copy information from cluster detail pages and articles.

---

## Related Documentation

- [Admin Cluster Analysis Guide](../admin/cluster-analysis.md) - For administrators managing the cluster system
- [API Documentation](../api-clusters.md) - For developers integrating with The Tell's API
- [Features Built](../features-built.md) - Complete list of features in The Tell
