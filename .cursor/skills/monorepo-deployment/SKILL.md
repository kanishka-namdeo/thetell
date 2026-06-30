---
name: monorepo-deployment
description: Use when deploying the Next.js application, configuring Docker for local development, managing environment variables, or setting up CI/CD pipelines
---

# Deployment

## Overview

Deploy the Next.js application to Vercel (primary) or Docker (self-hosted). The application is a single Next.js stack with PostgreSQL as the only external dependency.

## When to Use

- Setting up local development environment with Docker
- Configuring CI/CD pipeline (GitHub Actions)
- Deploying to production (Vercel, Docker)
- Managing environment variables across environments
- Running database migrations on deploy
- Adding health checks or monitoring

## Core Pattern

### Docker Compose (Development)

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    ports:
      - "5433:5432"
    environment:
      POSTGRES_USER: thell_user
      POSTGRES_PASSWORD: thell_password
      POSTGRES_DB: the_tell
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U thell_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build: .
    ports:
      - "3000:3000"
    env_file: .env.local
    environment:
      DATABASE_URL: postgresql://thell_user:thell_password@db:5432/the_tell
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - .:/app
      - /app/node_modules
    command: pnpm dev

volumes:
  pgdata:
```

### Dockerfile

```dockerfile
# Dockerfile
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
```

### Production Deployment (Vercel)

```yaml
# vercel.json
{
  "buildCommand": "pnpm build",
  "devCommand": "pnpm dev",
  "installCommand": "pnpm install",
  "framework": "nextjs",
  "regions": ["iad1"],
  "env": {
    "DATABASE_URL": "@database_url",
    "OPENAI_API_KEY": "@openai_api_key",
    "ANTHROPIC_API_KEY": "@anthropic_api_key"
  }
}
```

### GitHub Actions CI/CD

```yaml
# .github/workflows/ci.yml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run typecheck
        run: pnpm typecheck

      - name: Run lint
        run: pnpm lint

      - name: Run tests
        run: pnpm test

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

### Database Migrations

```typescript
// scripts/migrate.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Running migrations...");

  // Prisma migrations are run via CLI:
  // pnpm prisma migrate deploy

  console.log("Migrations complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

```json
// package.json
{
  "scripts": {
    "db:migrate": "prisma migrate deploy",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:studio": "prisma studio"
  }
}
```

## Quick Reference

### Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://thell_user:thell_password@localhost:5433/the_tell` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `ANTHROPIC_API_KEY` | Anthropic API key | `sk-ant-...` |
| `NEXTAUTH_SECRET` | NextAuth encryption secret | Random string |
| `NEXTAUTH_URL` | Application URL | `https://thetell.com` |

### Deployment Checklist

- [ ] Health check endpoint (`/api/health`)
- [ ] Environment variables set in production
- [ ] Database migrations run on deploy
- [ ] Logging and monitoring enabled
- [ ] Error tracking (Sentry, etc.) configured
- [ ] CORS configured for frontend domain
- [ ] API rate limiting enabled

### Local Development Commands

```powershell
# Start database only
docker-compose up db

# Start application with database
docker-compose up

# Start with build
docker-compose up --build

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Run database migrations
pnpm db:migrate

# Open Prisma Studio
pnpm db:studio
```

### Production Platforms

| Service | Platform | Why |
|---------|----------|-----|
| Application | Vercel | Next.js optimized, edge functions, automatic builds |
| Database | Railway / Supabase / Neon | Managed PostgreSQL, backups, scaling |
| Monitoring | Vercel Analytics / Sentry | Performance monitoring, error tracking |

## Common Mistakes

### Mistake 1: Hardcoded Environment Variables

**Bad:**
```typescript
// src/lib/db.ts
const databaseUrl = "postgresql://localhost:5432/the_tell"; // Breaks in production
```

**Good:**
```typescript
// src/lib/db.ts
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}
```

**Why:** Hardcoded values break across environments; environment variables enable configuration per deployment.

### Mistake 2: No Health Checks

**Bad:**
```dockerfile
# Dockerfile
EXPOSE 3000
CMD ["node", "server.js"]
# No health check - silent failures
```

**Good:**
```dockerfile
# Dockerfile
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1
CMD ["node", "server.js"]
```

**Why:** Without health checks, failed services go unnoticed; orchestrators can't restart unhealthy containers.

### Mistake 3: Manual Migrations

**Bad:**
```powershell
# Manual migration before deploy
pnpm db:migrate
# Then deploy app
vercel --prod
```

**Good:**
```yaml
# .github/workflows/ci.yml
jobs:
  deploy:
    steps:
      - name: Run migrations
        run: pnpm db:migrate

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
```

**Why:** Manual migrations are forgotten; automatic migrations ensure database schema matches code.

### Mistake 4: No Volume Mounting in Dev

**Bad:**
```yaml
# docker-compose.yml
services:
  app:
    build: .
    # No volume mount - code changes require rebuild
```

**Good:**
```yaml
# docker-compose.yml
services:
  app:
    build: .
    volumes:
      - .:/app
      - /app/node_modules
    command: pnpm dev  # Hot reload enabled
```

**Why:** Without volume mounting, every code change requires a rebuild; hot reload enables rapid development.

### Mistake 5: Missing Database Health Check

**Bad:**
```yaml
# docker-compose.yml
services:
  app:
    depends_on:
      - db
```

**Good:**
```yaml
# docker-compose.yml
services:
  db:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U thell_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    depends_on:
      db:
        condition: service_healthy
```

**Why:** Without health checks, the app may start before the database is ready, causing connection errors.

## Windows Docker Considerations

### Path Mounting

Windows Docker Desktop uses different path conventions:

```yaml
# docker-compose.yml - Windows-specific path mounting
services:
  app:
    volumes:
      # Use relative paths (recommended - Docker Desktop handles conversion)
      - .:/app

      # Or use absolute Windows paths (requires /c/ prefix in WSL2)
      # - /c/Users/username/project:/app
```

**Key points:**
- Relative paths (`./`) work across Windows, macOS, and Linux
- Docker Desktop on Windows auto-converts Windows paths to container paths
- Avoid absolute Windows paths (`C:\...`) in compose files — use relative or WSL2-style paths

### CRLF Line Ending Issues

Files created on Windows may have CRLF (`\r\n`) endings, causing issues in Linux containers:

```powershell
# Fix CRLF in shell scripts before container use
(Get-Content entrypoint.sh) -replace '\r$', '' | Set-Content entrypoint.sh

# Or use the dos2unix tool in container
docker-compose exec app apt-get install -y dos2unix
docker-compose exec app dos2unix entrypoint.sh
```

**Prevention:**
- Configure Git to handle line endings: `git config --global core.autocrlf input`
- Add `.gitattributes` file: `*.sh text eol=lf`

## Related Skills

- **api-design** — Next.js Route Handler patterns
- **data-modeling** — Prisma schema design
