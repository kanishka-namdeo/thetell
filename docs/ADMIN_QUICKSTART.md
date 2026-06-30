# Admin Quickstart Guide

This guide will help you set up and access the admin panel in The Tell application.

## Prerequisites

- Node.js 18+ and pnpm installed
- PostgreSQL database running (see [Environment Configuration](./environment.mdc))
- `.env.local` file configured (copy from `.env.example` if needed)

## Step 1: Set Up Database

Ensure your database is running and seeded:

```bash
# Start PostgreSQL (if using Docker)
docker-compose up -d

# Run database migrations
pnpm prisma migrate deploy

# Seed the database with test data (includes admin user)
pnpm prisma db seed
```

## Step 2: Access Admin Account

The seed script creates a default admin account:

**Email**: `admin@thetell.com`  
**Password**: `password123`  
**Role**: `ADMIN`

⚠️ **Security Notice**: These are development credentials only. Change them before production deployment.

## Step 3: Start Development Server

```bash
pnpm dev
```

The application will be available at `http://localhost:3000`

## Step 4: Login as Admin

1. Navigate to `http://localhost:3000/sign-in`
2. Enter the admin credentials:
   - Email: `admin@thetell.com`
   - Password: `password123`
3. Click "Sign In"
4. You'll be redirected to the dashboard

## Step 5: Access Admin Panel

Once logged in, you'll see the "Admin" section in the navigation menu:

- **Admin Overview**: `/dashboard/admin` - System health and quick stats
- **User Management**: `/dashboard/admin/users` - Manage users and roles
- **System Health**: `/dashboard/admin/system` - Monitor scrapers, jobs, and API keys
- **Content Moderation**: `/dashboard/admin/moderation` - Review and approve content
- **Settings**: `/dashboard/admin/settings` - Configure system behavior
- **Analytics**: `/dashboard/admin/analytics` - Platform-wide metrics
- **Audit Logs**: `/dashboard/admin/audit` - Track admin actions

## Creating Custom Admin Accounts

To create an admin account with custom credentials:

```bash
# Create admin with custom credentials
pnpm tsx scripts/setup-admin.ts --email your-email@example.com --password your-secure-password

# Or use interactive mode
pnpm tsx scripts/setup-admin.ts
```

### Script Options

```bash
--email <email>       Admin email address
--password <password> Admin password (min 8 characters)
--name <name>         Admin display name
--reset               Reset to default credentials
--help                Show help message
```

### Examples

```bash
# Create admin with default credentials
pnpm tsx scripts/setup-admin.ts

# Create admin with custom credentials
pnpm tsx scripts/setup-admin.ts --email admin@company.com --password SecurePass123!

# Create admin with custom name
pnpm tsx scripts/setup-admin.ts --email admin@company.com --password SecurePass123! --name "John Doe"

# Reset to default credentials
pnpm tsx scripts/setup-admin.ts --reset
```

## Admin Capabilities

### User Management
- View all registered users
- Search and filter users
- Change user roles (USER ↔ ADMIN)
- Suspend/activate user accounts
- View user activity and statistics
- Export user data to CSV

### System Health Monitoring
- Monitor scraper status and performance
- View background job queue
- Check API key configuration
- View system metrics and error logs
- Test scraper connectivity

### Content Moderation
- Review pending signals and articles
- Approve or reject content
- Edit published content
- Unpublish or delete content
- Trigger re-analysis of signals
- Configure auto-approval rules

### System Configuration
- Configure discovery schedule
- Select AI models (OpenAI/Anthropic)
- Set confidence thresholds
- Enable/disable features
- Configure rate limiting
- Manage email settings

### Analytics & Reporting
- View platform-wide metrics
- Analyze scraper performance
- Monitor AI performance
- Track user engagement
- Export reports (CSV/PDF)

### Audit Logging
- View all admin actions
- Filter by action type and user
- Search audit logs
- Export logs for compliance
- Configure retention policy

## Security Best Practices

### For Development
- Use the default test credentials
- Keep `.env.local` out of version control
- Use strong passwords for custom accounts

### For Production
1. **Change default credentials immediately**
   ```bash
   pnpm tsx scripts/setup-admin.ts --email admin@yourcompany.com --password <strong-password>
   ```

2. **Set ADMIN_API_KEY** in environment variables
   ```bash
   ADMIN_API_KEY=<generate-a-secure-random-key>
   ```

3. **Enable audit logging** to track all admin actions

4. **Review access regularly** - check who has admin privileges

5. **Use environment-specific credentials** - different credentials for dev/staging/prod

6. **Implement IP whitelisting** for admin routes (future enhancement)

7. **Enable 2FA** for admin accounts (future enhancement)

## Troubleshooting

### Cannot Access Admin Panel

**Problem**: Admin navigation items not showing

**Solution**:
- Verify you're logged in as an admin: check Profile page for role
- Ensure your user has `role: ADMIN` in the database
- Clear browser cache and cookies
- Re-login to refresh session

### Admin User Not in Database

**Problem**: Cannot login with admin credentials

**Solution**:
```bash
# Re-seed the database
pnpm prisma db seed

# Or create admin manually
pnpm tsx scripts/setup-admin.ts --reset
```

### Permission Denied Errors

**Problem**: Getting 403 errors on admin routes

**Solution**:
- Verify your session has the ADMIN role
- Check middleware configuration in `src/proxy.ts`
- Ensure admin routes are properly protected
- Check server logs for detailed error messages

### Database Connection Issues

**Problem**: Cannot connect to database

**Solution**:
```bash
# Check if PostgreSQL is running
docker ps

# Start PostgreSQL if needed
docker-compose up -d

# Verify DATABASE_URL in .env.local
cat .env.local | grep DATABASE_URL
```

## Admin API Endpoints

All admin API endpoints are prefixed with `/api/v1/admin/` and require ADMIN role:

### User Management
- `GET /api/v1/admin/users` - List users
- `GET /api/v1/admin/users/[id]` - Get user details
- `PATCH /api/v1/admin/users/[id]` - Update user
- `DELETE /api/v1/admin/users/[id]` - Delete user

### System Health
- `GET /api/v1/admin/system/health` - Get system health
- `GET /api/v1/admin/scrapers` - List scrapers
- `POST /api/v1/admin/scrapers/[name]/test` - Test scraper
- `GET /api/v1/admin/jobs` - List background jobs

### Content Moderation
- `GET /api/v1/admin/moderation/signals` - Pending signals
- `GET /api/v1/admin/moderation/articles` - Pending articles
- `POST /api/v1/admin/moderation/signals/[id]/approve` - Approve signal
- `POST /api/v1/admin/moderation/signals/[id]/reject` - Reject signal

### Configuration
- `GET /api/v1/admin/settings` - Get system settings
- `PATCH /api/v1/admin/settings` - Update settings

### Analytics
- `GET /api/v1/admin/analytics` - Get platform analytics

### Audit
- `GET /api/v1/admin/audit` - Get audit logs

## Implementation Status

See the [Admin Implementation Plan](./admin-implementation-plan.md) for detailed status of each feature.

**Currently Implemented**:
- ✅ Admin user model and role system
- ✅ Admin setup script
- ✅ Admin route protection middleware
- ✅ Admin navigation structure

**Planned (Phase 1)**:
- 🚧 Admin dashboard overview
- 🚧 User management interface
- 🚧 Admin API endpoints

**Future Phases**:
- 📋 System health monitoring
- 📋 Content moderation workflow
- 📋 System configuration
- 📋 Analytics and reporting
- 📋 Audit logging

## Additional Resources

- [Admin Implementation Plan](./admin-implementation-plan.md) - Detailed implementation roadmap
- [Environment Configuration](../.cursor/rules/environment.mdc) - Environment setup guide
- [Security Guidelines](../.cursor/rules/security.mdc) - Security best practices
- [API Design](../.cursor/rules/api-design.mdc) - API conventions

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review the implementation plan for known limitations
3. Check application logs for error details
4. Verify database connection and seed data

## Next Steps

After setting up admin access:
1. Review the admin panel features
2. Test user management workflows
3. Configure system settings as needed
4. Set up monitoring and alerts
5. Plan your content moderation workflow
6. Review and customize analytics dashboards
