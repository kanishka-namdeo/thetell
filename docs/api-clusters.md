# Cluster API Documentation

**Last updated**: 2026-06-26  
**Base URL**: `/api/v1`

This document describes the API endpoints related to clusters (SignalThemes), cluster articles, and related functionality.

---

## Table of Contents

- [Cluster Endpoints](#cluster-endpoints)
  - [GET /clusters - List Clusters](#get-clusters---list-clusters)
  - [GET /clusters/:id - Get Cluster Detail](#get-clustersid---get-cluster-detail)
  - [GET /clusters/:themeId/articles - Get Cluster Articles](#get-clustersthemeidarticles---get-cluster-articles)
  - [POST /clusters/:themeId/articles - Generate Cluster Articles](#post-clustersthemeidarticles---generate-cluster-articles)
- [Related Endpoints](#related-endpoints)
  - [GET /signals - List Signals (with cluster info)](#get-signals---list-signals)
  - [GET /signals/:id - Get Signal Detail](#get-signalsid---get-signal-detail)
  - [GET /inferences - List Inferences](#get-inferences---list-inferences)
  - [GET /inferences/:id - Get Inference Detail](#get-inferencesid---get-inference-detail)
- [Data Models](#data-models)
  - [Cluster (SignalTheme)](#cluster-signaltheme)
  - [ClusterArticle](#clusterarticle)
  - [Evidence Chain Item](#evidence-chain-item)
- [Error Responses](#error-responses)
- [Rate Limiting](#rate-limiting)

---

## Cluster Endpoints

### GET /clusters - List Clusters

Retrieve a paginated list of all clusters (themes) in the system.

**Authentication**: Not required (public endpoint)

**Query Parameters**:
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
- `companyId` (optional): Filter clusters by company ID
- `status` (optional): Filter by cluster status (ACTIVE, ARCHIVED, MERGED)
- `sortBy` (optional): Sort field (signalCount, momentum, createdAt, updatedAt)
- `sortOrder` (optional): Sort direction (asc, desc)

**Example Request**:
```bash
curl -X GET "https://api.example.com/api/v1/clusters?page=1&limit=20&companyId=company-123&status=ACTIVE&sortBy=signalCount&sortOrder=desc"
```

**Example Response**:
```json
{
  "clusters": [
    {
      "id": "theme-456",
      "label": "Tesla's Autonomous Driving Strategy",
      "description": "Signals related to Tesla's self-driving technology development, including hiring, patents, and executive statements",
      "companyId": "company-123",
      "company": {
        "id": "company-123",
        "name": "Tesla, Inc.",
        "ticker": "TSLA"
      },
      "signalCount": 12,
      "momentum": 0.85,
      "status": "ACTIVE",
      "avgConfidence": 0.82,
      "createdAt": "2026-05-15T10:30:00Z",
      "updatedAt": "2026-06-25T14:20:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

**Response Fields**:
- `clusters`: Array of cluster objects
- `pagination`: Pagination metadata

---

### GET /clusters/:id - Get Cluster Detail

Retrieve detailed information about a specific cluster, including all signals, inferences, and the evidence chain.

**Authentication**: Not required (public endpoint)

**Path Parameters**:
- `id`: Cluster ID (required)

**Example Request**:
```bash
curl -X GET "https://api.example.com/api/v1/clusters/theme-456"
```

**Example Response**:
```json
{
  "id": "theme-456",
  "label": "Tesla's Autonomous Driving Strategy",
  "description": "Signals related to Tesla's self-driving technology development, including hiring, patents, and executive statements",
  "companyId": "company-123",
  "company": {
    "id": "company-123",
    "name": "Tesla, Inc.",
    "ticker": "TSLA"
  },
  "signalCount": 12,
  "momentum": 0.85,
  "status": "ACTIVE",
  "avgConfidence": 0.82,
  "signals": [
    {
      "id": "signal-001",
      "title": "Tesla Hiring 50 ML Engineers for Autopilot Team",
      "sourceType": "JOB_POSTING",
      "sourceUrl": "https://example.com/job/123",
      "publishedAt": "2026-06-20T09:00:00Z",
      "confidence": 0.92,
      "sentiment": "POSITIVE",
      "summary": "Tesla is aggressively expanding its autonomous driving team with 50 new ML engineering positions..."
    }
  ],
  "inferences": [
    {
      "id": "inference-789",
      "label": "Tesla is significantly accelerating its autonomous driving development",
      "confidence": 0.87,
      "status": "ACTIVE",
      "createdAt": "2026-06-22T11:00:00Z"
    }
  ],
  "clusterArticles": [
    {
      "id": "article-001",
      "agent": "ANALYST",
      "headline": "Tesla's Autonomous Driving Strategy: Accelerating Development Amid Regulatory Challenges",
      "summary": "Analysis of Tesla's recent moves in autonomous driving...",
      "status": "PUBLISHED",
      "createdAt": "2026-06-23T15:30:00Z"
    }
  ],
  "evidenceChain": [
    {
      "signalId": "signal-001",
      "signalTitle": "Tesla Hiring 50 ML Engineers for Autopilot Team",
      "sourceType": "JOB_POSTING",
      "facts": [
        {
          "text": "Tesla is hiring 50 ML engineers for the Autopilot team",
          "confidence": 0.95
        },
        {
          "text": "Positions are focused on computer vision and sensor fusion",
          "confidence": 0.92
        }
      ],
      "confidence": 0.92,
      "publishedAt": "2026-06-20T09:00:00Z"
    }
  ],
  "createdAt": "2026-05-15T10:30:00Z",
  "updatedAt": "2026-06-25T14:20:00Z"
}
```

**Response Fields**:
- `signals`: Array of signals in this cluster (basic info only)
- `inferences`: Array of inferences derived from this cluster
- `clusterArticles`: Array of cluster articles (Analyst and Gossip Girl perspectives)
- `evidenceChain`: Array of evidence items showing how facts from signals build to inferences

---

### GET /clusters/:themeId/articles - Get Cluster Articles

Retrieve all cluster articles for a specific cluster. Cluster articles synthesize information from all signals in the cluster.

**Authentication**: Not required (public endpoint)

**Path Parameters**:
- `themeId`: Cluster/Theme ID (required)

**Query Parameters**:
- `agent` (optional): Filter by agent persona (ANALYST, GOSSIP_GIRL)
- `status` (optional): Filter by article status (DRAFT, PUBLISHED, ARCHIVED)

**Example Request**:
```bash
curl -X GET "https://api.example.com/api/v1/clusters/theme-456/articles?agent=ANALYST&status=PUBLISHED"
```

**Example Response**:
```json
{
  "articles": [
    {
      "id": "article-001",
      "themeId": "theme-456",
      "agent": "ANALYST",
      "headline": "Tesla's Autonomous Driving Strategy: Accelerating Development Amid Regulatory Challenges",
      "summary": "Analysis of Tesla's recent moves in autonomous driving, including hiring spikes, patent filings, and executive statements indicating accelerated development timelines.",
      "body": "Tesla has been making significant moves in the autonomous driving space...\n\n## Key Developments\n\n1. **Hiring Surge**: Tesla is hiring 50 ML engineers...\n\n2. **Patent Activity**: Recent patent filings show...\n\n3. **Executive Statements**: CEO statements at recent earnings call...\n\n## Strategic Implications\n\nBased on the convergence of these signals...",
      "status": "PUBLISHED",
      "signalCount": 12,
      "avgConfidence": 0.82,
      "createdAt": "2026-06-23T15:30:00Z",
      "updatedAt": "2026-06-23T15:30:00Z"
    }
  ]
}
```

**Response Fields**:
- `articles`: Array of cluster article objects
- Each article includes the full body content

---

### POST /clusters/:themeId/articles - Generate Cluster Articles

Trigger generation of new cluster articles. This is an admin-only endpoint that initiates async article generation.

**Authentication**: Required (Admin only)

**Path Parameters**:
- `themeId`: Cluster/Theme ID (required)

**Request Body**:
```json
{
  "agent": "ANALYST"
}
```

**Body Parameters**:
- `agent` (optional): Specific agent to generate for (ANALYST or GOSSIP_GIRL). If not provided, generates for both agents.

**Example Request**:
```bash
curl -X POST "https://api.example.com/api/v1/clusters/theme-456/articles" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent": "ANALYST"}'
```

**Example Response**:
```json
{
  "success": true,
  "message": "Cluster article generation initiated",
  "jobId": "job-123",
  "agents": ["ANALYST"]
}
```

**Response Fields**:
- `success`: Boolean indicating if the request was accepted
- `message`: Status message
- `jobId`: ID of the background job (can be used to check status)
- `agents`: Array of agents for which articles are being generated

**Notes**:
- This is an async operation. Articles are generated in the background.
- Use the `jobId` to check job status via the jobs API (if available).
- Generation typically takes 30-120 seconds depending on cluster size.
- Existing articles are not deleted; new articles are created with new IDs.

---

## Related Endpoints

### GET /signals - List Signals

Retrieve a paginated list of signals. Signals now include cluster information.

**Authentication**: Not required (public endpoint)

**Query Parameters**:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
- `companyId` (optional): Filter by company ID
- `sourceType` (optional): Filter by source type (NEWS, FILING, JOB_POSTING, etc.)
- `clusterId` (optional): Filter by cluster ID
- `includeCluster` (optional): Include cluster summary in response (true/false, default: false)

**Example Request**:
```bash
curl -X GET "https://api.example.com/api/v1/signals?companyId=company-123&includeCluster=true&page=1&limit=20"
```

**Example Response**:
```json
{
  "signals": [
    {
      "id": "signal-001",
      "title": "Tesla Hiring 50 ML Engineers for Autopilot Team",
      "sourceType": "JOB_POSTING",
      "sourceUrl": "https://example.com/job/123",
      "companyId": "company-123",
      "publishedAt": "2026-06-20T09:00:00Z",
      "confidence": 0.92,
      "sentiment": "POSITIVE",
      "summary": "Tesla is aggressively expanding its autonomous driving team...",
      "clusterId": "theme-456",
      "cluster": {
        "id": "theme-456",
        "label": "Tesla's Autonomous Driving Strategy",
        "signalCount": 12,
        "momentum": 0.85
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**New Fields**:
- `clusterId`: ID of the cluster this signal belongs to (null if standalone)
- `cluster`: Cluster summary object (only if `includeCluster=true`)

---

### GET /signals/:id - Get Signal Detail

Retrieve detailed information about a specific signal, including cluster membership.

**Authentication**: Not required (public endpoint)

**Path Parameters**:
- `id`: Signal ID (required)

**Example Request**:
```bash
curl -X GET "https://api.example.com/api/v1/signals/signal-001"
```

**Example Response**:
```json
{
  "id": "signal-001",
  "title": "Tesla Hiring 50 ML Engineers for Autopilot Team",
  "sourceType": "JOB_POSTING",
  "sourceUrl": "https://example.com/job/123",
  "companyId": "company-123",
  "company": {
    "id": "company-123",
    "name": "Tesla, Inc.",
    "ticker": "TSLA"
  },
  "publishedAt": "2026-06-20T09:00:00Z",
  "confidence": 0.92,
  "sentiment": "POSITIVE",
  "summary": "Tesla is aggressively expanding its autonomous driving team with 50 new ML engineering positions focused on computer vision and sensor fusion.",
  "content": "Full content of the signal...",
  "clusterId": "theme-456",
  "cluster": {
    "id": "theme-456",
    "label": "Tesla's Autonomous Driving Strategy",
    "description": "Signals related to Tesla's self-driving technology development...",
    "signalCount": 12,
    "momentum": 0.85,
    "status": "ACTIVE"
  },
  "analyses": [
    {
      "id": "analysis-001",
      "agent": "ANALYST",
      "facts": [
        {
          "text": "Tesla is hiring 50 ML engineers for the Autopilot team",
          "confidence": 0.95
        }
      ],
      "sentiment": "POSITIVE",
      "themes": ["autonomous driving", "hiring", "AI development"]
    }
  ],
  "articles": [
    {
      "id": "article-002",
      "agent": "ANALYST",
      "headline": "Tesla Expands Autopilot Team with 50 New ML Positions",
      "status": "PUBLISHED"
    }
  ],
  "createdAt": "2026-06-20T09:00:00Z"
}
```

**New Fields**:
- `clusterId`: ID of the cluster this signal belongs to
- `cluster`: Full cluster object with description and metadata

---

### GET /inferences - List Inferences

Retrieve a paginated list of inferences.

**Authentication**: Not required (public endpoint)

**Query Parameters**:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
- `companyId` (optional): Filter by company ID
- `clusterId` (optional): Filter by cluster ID
- `minConfidence` (optional): Filter by minimum confidence score (0.0-1.0)
- `status` (optional): Filter by status (ACTIVE, SUPERSEDED, RETRACTED)

**Example Request**:
```bash
curl -X GET "https://api.example.com/api/v1/inferences?companyId=company-123&minConfidence=0.7&status=ACTIVE"
```

**Example Response**:
```json
{
  "inferences": [
    {
      "id": "inference-789",
      "label": "Tesla is significantly accelerating its autonomous driving development",
      "confidence": 0.87,
      "status": "ACTIVE",
      "companyId": "company-123",
      "company": {
        "id": "company-123",
        "name": "Tesla, Inc.",
        "ticker": "TSLA"
      },
      "clusterId": "theme-456",
      "cluster": {
        "id": "theme-456",
        "label": "Tesla's Autonomous Driving Strategy"
      },
      "createdAt": "2026-06-22T11:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 25,
    "totalPages": 2
  }
}
```

**Response Fields**:
- `clusterId`: ID of the cluster this inference was derived from
- `cluster`: Cluster summary object

---

### GET /inferences/:id - Get Inference Detail

Retrieve detailed information about a specific inference, including the evidence chain.

**Authentication**: Not required (public endpoint)

**Path Parameters**:
- `id`: Inference ID (required)

**Query Parameters**:
- `includeEvidenceChain` (optional): Include the evidence chain (true/false, default: false)

**Example Request**:
```bash
curl -X GET "https://api.example.com/api/v1/inferences/inference-789?includeEvidenceChain=true"
```

**Example Response**:
```json
{
  "id": "inference-789",
  "label": "Tesla is significantly accelerating its autonomous driving development",
  "confidence": 0.87,
  "status": "ACTIVE",
  "companyId": "company-123",
  "company": {
    "id": "company-123",
    "name": "Tesla, Inc.",
    "ticker": "TSLA"
  },
  "clusterId": "theme-456",
  "cluster": {
    "id": "theme-456",
    "label": "Tesla's Autonomous Driving Strategy",
    "description": "Signals related to Tesla's self-driving technology development..."
  },
  "evidenceChain": [
    {
      "signalId": "signal-001",
      "signalTitle": "Tesla Hiring 50 ML Engineers for Autopilot Team",
      "sourceType": "JOB_POSTING",
      "facts": [
        {
          "text": "Tesla is hiring 50 ML engineers for the Autopilot team",
          "confidence": 0.95
        },
        {
          "text": "Positions are focused on computer vision and sensor fusion",
          "confidence": 0.92
        }
      ],
      "confidence": 0.92,
      "publishedAt": "2026-06-20T09:00:00Z"
    },
    {
      "signalId": "signal-002",
      "signalTitle": "Tesla Files New Patent for Sensor Fusion Algorithm",
      "sourceType": "PATENT_FILING",
      "facts": [
        {
          "text": "Patent describes novel sensor fusion algorithm for obstacle detection",
          "confidence": 0.90
        }
      ],
      "confidence": 0.88,
      "publishedAt": "2026-06-18T14:00:00Z"
    }
  ],
  "createdAt": "2026-06-22T11:00:00Z",
  "updatedAt": "2026-06-22T11:00:00Z"
}
```

**New Fields**:
- `evidenceChain`: Array of evidence items (only if `includeEvidenceChain=true`)

---

## Data Models

### Cluster (SignalTheme)

```typescript
interface Cluster {
  id: string;                    // Unique identifier
  label: string;                 // Descriptive name of the theme
  description?: string;          // Detailed description
  companyId: string;             // Associated company ID
  company?: Company;             // Company object (if included)
  signalCount: number;           // Number of signals in cluster
  momentum: number;              // Rate of new signal addition (0.0-1.0)
  status: "ACTIVE" | "ARCHIVED" | "MERGED";
  avgConfidence?: number;        // Average confidence across signals
  createdAt: string;             // ISO 8601 timestamp
  updatedAt: string;             // ISO 8601 timestamp
}
```

### ClusterArticle

```typescript
interface ClusterArticle {
  id: string;                    // Unique identifier
  themeId: string;               // Cluster ID
  agent: "ANALYST" | "GOSSIP_GIRL";
  headline: string;              // Article headline
  summary: string;               // Brief summary
  body: string;                  // Full article content (markdown)
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  signalCount: number;           // Number of signals synthesized
  avgConfidence: number;         // Average confidence of source signals
  createdAt: string;             // ISO 8601 timestamp
  updatedAt: string;             // ISO 8601 timestamp
}
```

### Evidence Chain Item

```typescript
interface EvidenceChainItem {
  signalId: string;              // Signal ID
  signalTitle: string;           // Signal title
  sourceType: string;            // Source type (NEWS, FILING, JOB_POSTING, etc.)
  facts: Array<{
    text: string;                // Fact text
    confidence: number;          // Fact confidence (0.0-1.0)
  }>;
  confidence: number;            // Overall signal confidence
  publishedAt: string;           // ISO 8601 timestamp
}
```

---

## Error Responses

All endpoints return standard HTTP error codes:

### 400 Bad Request
```json
{
  "error": "Invalid request parameters",
  "message": "The 'limit' parameter must be between 1 and 100"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Authentication is required to access this endpoint"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "You do not have permission to access this resource"
}
```

### 404 Not Found
```json
{
  "error": "Not found",
  "message": "Cluster with ID 'theme-999' not found"
}
```

### 429 Too Many Requests
```json
{
  "error": "Rate limit exceeded",
  "message": "You have exceeded the rate limit. Please retry after 60 seconds."
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "An unexpected error occurred. Please try again later."
}
```

---

## Rate Limiting

API requests are rate-limited to ensure fair usage:

- **Public endpoints**: 100 requests per minute per IP
- **Authenticated endpoints**: 500 requests per minute per user
- **Admin endpoints**: 1000 requests per minute per admin

Rate limit headers are included in all responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1719420000
```

When the rate limit is exceeded, a `429 Too Many Requests` response is returned.

---

## Authentication

Most cluster endpoints are public and do not require authentication. However, some endpoints (like generating cluster articles) require admin authentication.

**Authentication Method**: Bearer Token

```bash
curl -X GET "https://api.example.com/api/v1/clusters/theme-456" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Token Types**:
- **Public endpoints**: No token required
- **User endpoints**: User token (for accessing user-specific data)
- **Admin endpoints**: Admin token (for administrative actions)

---

## Changelog

### 2026-06-26
- Added cluster API endpoints
- Added `clusterId` and `cluster` fields to signal endpoints
- Added `includeEvidenceChain` parameter to inference endpoints
- Added cluster article generation endpoint

---

## Support

For API support or questions:
- Email: api-support@example.com
- Documentation: https://docs.example.com/api
- Status page: https://status.example.com
