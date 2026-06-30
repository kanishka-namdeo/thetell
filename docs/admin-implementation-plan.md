# Admin User Flows - Implementation Plan

**Status**: Planning Phase  
**Created**: 2026-06-18  
**Priority**: High

## Overview

This document outlines the complete implementation plan for admin functionality in The Tell application. Currently, the admin role exists in the database but has no dedicated UI or management capabilities. This plan addresses that gap with a phased approach.

## Current State

### What Exists
- ✅ Role-based access control (USER, ADMIN) in Prisma schema
- ✅ JWT token propagation of role via NextAuth callbacks
- ✅ `isAdmin()` and `requireAdmin()` helper functions in `src/lib/auth-guard.ts`
- ✅ Empty `adminNavItems` array in dashboard layout ready for population
- ✅ One admin API endpoint: `/api/v1/admin/warm-nlp` for NLP model warmup
- ✅ Admin user seed: `admin@thetell.com` / `password123`

### What's Missing
- ❌ Admin dashboard/overview page
- ❌ User management interface
- ❌ System health monitoring
- ❌ Content moderation workflow
- ❌ Scraper configuration UI
- ❌ Background job monitoring
- ❌ Audit logging
- ❌ Admin-specific analytics

## Test Admin Credentials

**Email**: `admin@thetell.com`  
**Password**: `password123`  
**Role**: `ADMIN`

These credentials are seeded in `prisma/seed.ts` and should be used for development and testing.

**Important**: Change these credentials before production deployment.

## Implementation Phases

### Phase 1: Foundation & User Management (Week 1-2)

**Goal**: Establish admin infrastructure and user management capabilities

#### 1.1 Admin Dashboard Overview
**Location**: `src/app/dashboard/admin/page.tsx`

**Features**:
- System health summary (scraper status, job queue, error count)
- User statistics (total users, new signups today, active users)
- Content statistics (signals processed, articles published, companies tracked)
- Recent admin actions log
- Quick links to admin functions

**Technical Requirements**:
- Server component with `auth()` check
- Redirect non-admin users to regular dashboard
- Aggregate queries for statistics
- Responsive grid layout

**Acceptance Criteria**:
- [ ] Admin users see dashboard with all metrics
- [ ] Non-admin users redirected to `/dashboard`
- [ ] All statistics load within 2 seconds
- [ ] Mobile-responsive layout

#### 1.2 User Management - List View
**Location**: `src/app/dashboard/admin/users/page.tsx`

**Features**:
- Paginated table of all users
- Search by name/email
- Filter by role (USER, ADMIN)
- Sort by name, email, created date, last activity
- Bulk actions: export CSV, bulk role change
- Status indicators (verified, suspended)

**API Endpoint**: `GET /api/v1/admin/users`

**Query Parameters**:
- `limit`: number (default 20, max 100)
- `cursor`: string (for pagination)
- `search`: string (name/email search)
- `role`: "USER" | "ADMIN" (filter)
- `sortBy`: "name" | "email" | "createdAt" | "lastActivity"
- `sortOrder`: "asc" | "desc"

**Response Schema**:
```typescript
{
  items: Array<{
    id: string;
    name: string | null;
    email: string | null;
    role: "USER" | "ADMIN";
    emailVerified: Date | null;
    createdAt: Date;
    updatedAt: Date;
    _count: {
      articles: number;
      watchedCompanies: number;
    };
  }>;
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}
```

**Acceptance Criteria**:
- [ ] Table displays all users with correct data
- [ ] Pagination works correctly
- [ ] Search filters results in real-time
- [ ] Role filter works
- [ ] Sorting works on all columns
- [ ] CSV export includes all user data
- [ ] Loading states shown during data fetch
- [ ] Empty state when no users match filters

#### 1.3 User Management - Detail/Edit View
**Location**: `src/app/dashboard/admin/users/[id]/page.tsx`

**Features**:
- User profile information
- Role management (promote/demote)
- Account status (active/suspended)
- User activity log (signals created, articles written)
- Force password reset
- Delete user account (with confirmation)

**API Endpoints**:
- `GET /api/v1/admin/users/[id]` - Get user details
- `PATCH /api/v1/admin/users/[id]` - Update user (role, status)
- `DELETE /api/v1/admin/users/[id]` - Delete user
- `POST /api/v1/admin/users/[id]/reset-password` - Force password reset

**Update Schema**:
```typescript
{
  role?: "USER" | "ADMIN";
  status?: "ACTIVE" | "SUSPENDED";
  name?: string;
  email?: string;
}
```

**Acceptance Criteria**:
- [ ] User details display correctly
- [ ] Role change updates immediately
- [ ] Suspension prevents login
- [ ] Activity log shows recent actions
- [ ] Delete requires confirmation dialog
- [ ] Cannot delete own account
- [ ] Cannot demote last admin
- [ ] All changes logged in audit trail

#### 1.4 Admin Navigation Integration
**Location**: `src/app/dashboard/layout.tsx`

**Changes**:
- Populate `adminNavItems` array with admin routes
- Add admin badge/indicator next to admin users
- Conditional rendering based on `isAdmin(session)`

**Navigation Items**:
```typescript
const adminNavItems = [
  { href: "/dashboard/admin", label: "Admin", icon: ShieldCheck },
  { href: "/dashboard/admin/users", label: "Users", icon: Users },
  { href: "/dashboard/admin/system", label: "System", icon: Server },
  { href: "/dashboard/admin/moderation", label: "Moderation", icon: Flag },
];
```

**Acceptance Criteria**:
- [ ] Admin nav items only visible to admin users
- [ ] Admin badge shows in user dropdown
- [ ] Navigation works on desktop and mobile
- [ ] Active state highlights correctly

#### 1.5 Admin Route Protection
**Location**: `src/proxy.ts`

**Changes**:
- Add admin route pattern matching
- Redirect non-admin users attempting to access `/dashboard/admin/*`
- Return 403 for API routes without admin role

**Implementation**:
```typescript
const ADMIN_ROUTES = [/^\/dashboard\/admin(\/.*)?$/];
const ADMIN_API_ROUTES = [/^\/api\/v1\/admin\/.*$/];

// In middleware:
if (ADMIN_ROUTES.some(pattern => pattern.test(pathname))) {
  if (!req.auth || req.auth.user?.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
}
```

**Acceptance Criteria**:
- [ ] Non-admin users redirected from admin pages
- [ ] API routes return 403 for non-admin
- [ ] Admin users can access all admin routes
- [ ] Protection works on direct URL access

### Phase 2: System Health & Monitoring (Week 3-4)

**Goal**: Provide visibility into system operations and health

#### 2.1 System Health Dashboard
**Location**: `src/app/dashboard/admin/system/page.tsx`

**Features**:
- Scraper status overview (enabled/disabled, last run, success rate)
- Background job queue status
- API key configuration status (masked)
- System metrics (signal ingestion rate, analysis success rate)
- Error log (recent errors from scrapers, analysis, database)

**API Endpoint**: `GET /api/v1/admin/system/health`

**Response Schema**:
```typescript
{
  scrapers: Array<{
    name: string;
    enabled: boolean;
    apiKeyConfigured: boolean;
    lastRunAt: Date | null;
    lastSuccessAt: Date | null;
    successRate: number; // percentage
    errorCount: number;
  }>;
  jobs: {
    pending: number;
    running: number;
    failed: number;
    completed: number;
  };
  apiKeys: Array<{
    name: string;
    configured: boolean;
    masked: string; // "sk-...abc"
  }>;
  metrics: {
    signalsPerHour: number;
    analysesPerHour: number;
    averageProcessingTime: number; // seconds
    errorRate: number; // percentage
  };
  recentErrors: Array<{
    id: string;
    source: string; // "scraper", "analysis", "database"
    message: string;
    timestamp: Date;
    signalId?: string;
  }>;
}
```

**Acceptance Criteria**:
- [ ] All scrapers displayed with correct status
- [ ] Job queue updates in real-time (polling or websocket)
- [ ] API keys shown masked
- [ ] Metrics calculated correctly
- [ ] Error log shows last 50 errors
- [ ] Auto-refresh every 30 seconds

#### 2.2 Scraper Management
**Location**: `src/app/dashboard/admin/system/scrapers/page.tsx`

**Features**:
- List all 18 scrapers with configuration
- Enable/disable individual scrapers
- Test scraper connectivity
- View scraper logs
- Configure rate limits per scraper
- Manual trigger for scraper run

**API Endpoints**:
- `GET /api/v1/admin/scrapers` - List scrapers
- `PATCH /api/v1/admin/scrapers/[name]` - Update scraper config
- `POST /api/v1/admin/scrapers/[name]/test` - Test scraper
- `POST /api/v1/admin/scrapers/[name]/run` - Manual trigger

**Configuration Schema**:
```typescript
{
  enabled: boolean;
  rateLimitPerMinute?: number;
  retryAttempts?: number;
  timeout?: number; // seconds
}
```

**Acceptance Criteria**:
- [ ] All scrapers listed with correct configuration
- [ ] Enable/disable works immediately
- [ ] Test returns success/failure with details
- [ ] Manual trigger starts scraper run
- [ ] Configuration changes persist
- [ ] Rate limits enforced

#### 2.3 Background Job Monitoring
**Location**: `src/app/dashboard/admin/system/jobs/page.tsx`

**Features**:
- Job queue overview (pending, running, completed, failed)
- Job list with filters (status, type, date range)
- Job detail view (input, output, logs, duration)
- Retry failed jobs
- Cancel running jobs
- Job statistics (average duration, success rate by type)

**API Endpoints**:
- `GET /api/v1/admin/jobs` - List jobs
- `GET /api/v1/admin/jobs/[id]` - Job detail
- `POST /api/v1/admin/jobs/[id]/retry` - Retry job
- `POST /api/v1/admin/jobs/[id]/cancel` - Cancel job

**Note**: This requires Inngest dashboard integration or custom job tracking table

**Acceptance Criteria**:
- [ ] Job queue displays correctly
- [ ] Filters work for all job properties
- [ ] Job detail shows complete information
- [ ] Retry creates new job with same input
- [ ] Cancel stops running job
- [ ] Statistics calculated correctly

#### 2.4 API Key Management
**Location**: `src/app/dashboard/admin/system/api-keys/page.tsx`

**Features**:
- List all API keys (masked)
- Add new API key
- Update existing API key
- Test API key connectivity
- Delete API key
- Key usage statistics

**API Endpoints**:
- `GET /api/v1/admin/api-keys` - List keys (masked)
- `POST /api/v1/admin/api-keys` - Add key
- `PATCH /api/v1/admin/api-keys/[name]` - Update key
- `DELETE /api/v1/admin/api-keys/[name]` - Delete key
- `POST /api/v1/admin/api-keys/[name]/test` - Test key

**Security Requirements**:
- Keys never returned in plain text after creation
- All key operations logged in audit trail
- Keys encrypted at rest in database
- Access restricted to admin users only

**Acceptance Criteria**:
- [ ] Keys displayed masked
- [ ] Add key works for all supported services
- [ ] Test validates key with actual API call
- [ ] Delete requires confirmation
- [ ] All operations logged
- [ ] Invalid keys marked as failed

### Phase 3: Content Moderation (Week 5-6)

**Goal**: Enable admin oversight of published content

#### 3.1 Moderation Queue
**Location**: `src/app/dashboard/admin/moderation/page.tsx`

**Features**:
- Queue of signals pending review
- Queue of articles pending approval
- Filter by source type, confidence, sentiment
- Bulk approve/reject
- Quick preview modal
- Reason for rejection (required for rejections)

**API Endpoints**:
- `GET /api/v1/admin/moderation/signals` - Pending signals
- `GET /api/v1/admin/moderation/articles` - Pending articles
- `POST /api/v1/admin/moderation/signals/[id]/approve` - Approve signal
- `POST /api/v1/admin/moderation/signals/[id]/reject` - Reject signal
- `POST /api/v1/admin/moderation/articles/[id]/approve` - Approve article
- `POST /api/v1/admin/moderation/articles/[id]/reject` - Reject article

**Workflow**:
1. New signals/articles created with status `PENDING_REVIEW`
2. Admin reviews content in queue
3. Admin approves (changes to `ANALYZED`/`PUBLISHED`) or rejects (changes to `REJECTED`)
4. Rejected items include reason for admin records

**Acceptance Criteria**:
- [ ] Queue displays all pending items
- [ ] Filters work correctly
- [ ] Approve changes status immediately
- [ ] Reject requires reason
- [ ] Bulk operations work
- [ ] Preview modal shows full content
- [ ] Queue updates after actions

#### 3.2 Content Management
**Location**: `src/app/dashboard/admin/moderation/content/page.tsx`

**Features**:
- View all published content (signals, articles)
- Edit content (title, summary, body)
- Unpublish content
- Delete content
- Re-analyze signal (trigger new analysis)
- View content history

**API Endpoints**:
- `GET /api/v1/admin/content` - List all content
- `PATCH /api/v1/admin/content/signals/[id]` - Update signal
- `PATCH /api/v1/admin/content/articles/[id]` - Update article
- `DELETE /api/v1/admin/content/signals/[id]` - Delete signal
- `DELETE /api/v1/admin/content/articles/[id]` - Delete article
- `POST /api/v1/admin/content/signals/[id]/reanalyze` - Re-analyze

**Acceptance Criteria**:
- [ ] All content listed with correct metadata
- [ ] Edit saves changes correctly
- [ ] Unpublish removes from public view
- [ ] Delete requires confirmation
- [ ] Re-analyze triggers new analysis
- [ ] History shows all changes

#### 3.3 Moderation Settings
**Location**: `src/app/dashboard/admin/moderation/settings/page.tsx`

**Features**:
- Enable/disable moderation workflow
- Set auto-approve rules (confidence threshold, trusted sources)
- Configure moderation queue priorities
- Set notification preferences for new content

**API Endpoint**: `PATCH /api/v1/admin/moderation/settings`

**Settings Schema**:
```typescript
{
  enabled: boolean;
  autoApproveConfidenceThreshold?: number; // 0.0-1.0
  autoApproveSources?: string[]; // source types
  notificationEmail?: string;
  notifyOnNewContent: boolean;
}
```

**Acceptance Criteria**:
- [ ] Settings save correctly
- [ ] Auto-approve rules enforced
- [ ] Notifications sent when configured
- [ ] Settings persist across restarts

### Phase 4: Configuration & Analytics (Week 7-8)

**Goal**: Admin control over system configuration and platform-wide analytics

#### 4.1 System Configuration
**Location**: `src/app/dashboard/admin/settings/page.tsx`

**Features**:
- Discovery schedule configuration
- AI model selection (OpenAI/Anthropic)
- Confidence thresholds
- Feature flags (semantic dedup, language detection)
- Rate limiting settings
- Email configuration

**API Endpoint**: `PATCH /api/v1/admin/settings`

**Configuration Schema**:
```typescript
{
  discovery: {
    schedule: string; // cron expression
    enabled: boolean;
  };
  ai: {
    defaultProvider: "openai" | "anthropic";
    analystModel: string;
    gossipGirlModel: string;
  };
  thresholds: {
    minConfidenceForPublication: number;
    minQualityScore: number;
  };
  features: {
    semanticDeduplication: boolean;
    languageDetection: boolean;
    qualityGate: boolean;
  };
  rateLimiting: {
    requestsPerMinute: number;
    burstLimit: number;
  };
}
```

**Acceptance Criteria**:
- [ ] All settings save correctly
- [ ] Changes apply immediately (or with documented restart)
- [ ] Invalid configurations rejected
- [ ] Settings validated before save
- [ ] Audit log of all changes

#### 4.2 Platform Analytics
**Location**: `src/app/dashboard/admin/analytics/page.tsx`

**Features**:
- Platform-wide metrics dashboard
- Scraper performance by source type
- AI performance (confidence distribution, sentiment breakdown)
- User engagement metrics
- Content performance (most viewed, highest confidence)
- Export reports (CSV, PDF)

**API Endpoint**: `GET /api/v1/admin/analytics`

**Query Parameters**:
- `dateRange`: "7d" | "30d" | "90d" | "all"
- `groupBy`: "day" | "week" | "month"

**Response Schema**:
```typescript
{
  overview: {
    totalSignals: number;
    totalArticles: number;
    totalUsers: number;
    totalCompanies: number;
    averageConfidence: number;
  };
  scraperPerformance: Array<{
    sourceType: string;
    signalCount: number;
    successRate: number;
    averageConfidence: number;
  }>;
  aiPerformance: {
    confidenceDistribution: Array<{ range: string; count: number }>;
    sentimentBreakdown: Array<{ sentiment: string; count: number }>;
    modelUsage: Array<{ model: string; count: number }>;
  };
  userEngagement: {
    activeUsers: number;
    newSignups: number;
    averageArticlesPerUser: number;
  };
  contentPerformance: Array<{
    id: string;
    title: string;
    views: number;
    confidence: number;
  }>;
}
```

**Acceptance Criteria**:
- [ ] All metrics display correctly
- [ ] Date range filter works
- [ ] Charts render with correct data
- [ ] Export generates valid CSV/PDF
- [ ] Performance acceptable for large datasets

#### 4.3 Audit Logging
**Location**: `src/app/dashboard/admin/audit/page.tsx`

**Features**:
- Audit log of all admin actions
- Filter by action type, user, date range
- Search log entries
- Export log
- Retention policy configuration

**Database Schema Addition**:
```prisma
model AuditLog {
  id        String   @id @default(cuid())
  userId    String
  action    String   // "user.role_change", "content.delete", etc.
  resource  String   // "user", "signal", "article", etc.
  resourceId String?
  details   Json?    // Additional context
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([action])
  @@index([createdAt])
}
```

**API Endpoint**: `GET /api/v1/admin/audit`

**Acceptance Criteria**:
- [ ] All admin actions logged
- [ ] Log includes user, action, timestamp, details
- [ ] Filters work correctly
- [ ] Search works
- [ ] Export generates valid CSV
- [ ] Log retention policy enforced

## Database Changes

### New Models

1. **AuditLog** - Track all admin actions
2. **SystemConfig** - Store system configuration
3. **ModerationSettings** - Store moderation workflow settings
4. **ScraperConfig** - Store per-scraper configuration (or use existing system config)

### Schema Updates

1. Add `status` field to User model: `enum UserStatus { ACTIVE, SUSPENDED }`
2. Add `REJECTED` to SignalStatus enum
3. Add `PENDING_REVIEW` to ArticleStatus enum
4. Add relations to AuditLog model

### Migration Plan

1. Create new models in `prisma/schema.prisma`
2. Run `pnpm prisma migrate dev` to create migration
3. Update seed script to create initial system config
4. Test migration on development database
5. Plan production migration strategy

## Security Considerations

### Authentication & Authorization
- All admin routes protected by middleware
- Role checked on every request (not just at login)
- Admin API keys for programmatic access
- Session timeout for admin sessions

### Audit Trail
- All admin actions logged
- Logs include user, action, timestamp, IP, user agent
- Logs immutable (no delete/update)
- Log retention policy (default 90 days)

### Sensitive Data
- API keys encrypted at rest
- API keys never returned in plain text
- Password reset tokens single-use
- Suspicious activity monitoring

### Rate Limiting
- Admin actions rate limited
- Bulk operations have additional limits
- API key operations rate limited
- Failed login attempts tracked

## Testing Strategy

### Unit Tests
- Admin helper functions (`isAdmin`, `requireAdmin`)
- Audit logging service
- Moderation workflow logic
- Configuration validation

### Integration Tests
- Admin API endpoints
- User management workflows
- Content moderation workflows
- System health aggregation

### End-to-End Tests
- Admin login and navigation
- User role change workflow
- Content approval workflow
- System configuration changes

### Manual Testing Checklist
- [ ] Admin can access all admin routes
- [ ] Non-admin users cannot access admin routes
- [ ] User management works correctly
- [ ] System health displays correctly
- [ ] Content moderation workflow works
- [ ] Configuration changes apply
- [ ] Audit log captures all actions
- [ ] API keys managed securely

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Database migrations tested
- [ ] Admin user created in production
- [ ] Default system configuration set
- [ ] Audit logging enabled
- [ ] Rate limiting configured
- [ ] Monitoring alerts configured

### Post-Deployment
- [ ] Admin can login successfully
- [ ] All admin pages load
- [ ] User management works
- [ ] System health displays
- [ ] Audit logging working
- [ ] No errors in logs
- [ ] Performance acceptable

## Future Enhancements

### Phase 5 (Post-MVP)
- Real-time notifications for admin actions
- Advanced analytics with custom reports
- Automated moderation rules
- Multi-language support for admin UI
- Admin mobile app
- Webhook integrations
- Custom admin dashboards per organization

### Phase 6 (Advanced)
- Role-based permissions (beyond USER/ADMIN)
- Organization/multi-tenant support
- API key scopes and permissions
- Admin action undo/redo
- Advanced audit analytics
- Compliance reporting (SOC2, GDPR)

## Success Metrics

### User Management
- Time to manage user roles < 30 seconds
- User search returns results < 1 second
- Bulk operations complete < 10 seconds

### System Health
- Health dashboard loads < 2 seconds
- Real-time updates within 5 seconds
- Error detection within 1 minute

### Content Moderation
- Average moderation time < 2 minutes per item
- Queue backlog < 24 hours
- Approval rate > 90%

### Configuration
- Configuration changes apply < 5 seconds
- No restart required for most changes
- Configuration validation prevents errors

## Conclusion

This implementation plan provides a comprehensive roadmap for admin functionality in The Tell application. The phased approach ensures critical features are delivered first while maintaining flexibility for future enhancements. Security, auditability, and user experience are prioritized throughout.

**Next Steps**:
1. Review and approve this plan
2. Create GitHub issues for Phase 1 tasks
3. Set up admin development environment
4. Begin Phase 1 implementation
5. Schedule weekly progress reviews
