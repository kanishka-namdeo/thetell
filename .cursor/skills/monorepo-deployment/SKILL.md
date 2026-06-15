---
name: monorepo-deployment
description: Use when setting up deployment pipeline, configuring Docker Compose for local dev, deploying FastAPI backend or Next.js frontend, or managing CI/CD for the monorepo
---

# Monorepo Deployment

## Overview

Deploy the FastAPI backend and Next.js frontend as separate services with independent lifecycles. The monorepo contains two deployable units that share configuration conventions but run on different platforms optimized for their stack.

## When to Use

- Setting up local development environment with Docker Compose
- Configuring CI/CD pipeline (GitHub Actions)
- Deploying backend to production (Railway, Render, Fly.io)
- Deploying frontend to production (Vercel)
- Managing environment variables across services
- Running database migrations on deploy
- Adding health checks or monitoring

## Core Pattern

### Docker Compose (Development)

```yaml
# Before: Manual service startup
# Terminal 1 (Unix): cd backend && uvicorn main:app --reload
# Terminal 1 (Windows): Set-Location backend; uvicorn main:app --reload
# Terminal 2: pnpm dev (cross-platform)
# Problem: Inconsistent environments, manual setup

# After: Single command startup
# docker-compose.yml
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file: ./backend/.env
    volumes:
      - ./backend:/app
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
  
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    env_file: ./frontend/.env.local
    volumes:
      - ./frontend:/app
      - /app/node_modules
    command: pnpm dev
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Backend Dockerfile

```dockerfile
# backend/Dockerfile
FROM python:3.13-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Run application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Frontend Dockerfile

```dockerfile
# frontend/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy application
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Run application
CMD ["pnpm", "dev"]
```

### Production Deployment

```yaml
# Production: Separate deployments
# Backend: FastAPI on Railway/Render/Fly.io
# - Environment variables set in platform dashboard
# - Database: PostgreSQL (managed)
# - Automatic deployments from main branch

# Frontend: Next.js on Vercel
# - Environment variables set in Vercel dashboard
# - Build-time env vars for API URL
# - Automatic deployments from main branch
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
  backend-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.13'
      
      - name: Install dependencies
        working-directory: ./backend
        run: |
          pip install -r requirements.txt
          pip install pytest pytest-asyncio
      
      - name: Run tests
        working-directory: ./backend
        run: pytest
  
  frontend-test:
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
        working-directory: ./frontend
        run: pnpm install
      
      - name: Run tests
        working-directory: ./frontend
        run: pnpm test
  
  deploy:
    needs: [backend-test, frontend-test]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy backend
        run: |
          # Railway/Render/Fly.io deployment command
          echo "Deploying backend..."
      
      - name: Deploy frontend
        run: |
          # Vercel deployment command
          echo "Deploying frontend..."
```

### Database Migrations

```python
# backend/alembic/env.py
# Run migrations on deploy
# Command: alembic upgrade head

# In deployment script or entrypoint:
# before starting the app, run migrations
import subprocess
subprocess.run(["alembic", "upgrade", "head"], check=True)
```

## Quick Reference

### Environment Variables

| Service | Variable | Purpose | Example |
|---------|----------|---------|---------|
| Backend | `DATABASE_URL` | PostgreSQL connection | `postgresql://user:pass@host:5432/db` |
| Backend | `OPENAI_API_KEY` | LLM provider key | `sk-...` |
| Backend | `ANTHROPIC_API_KEY` | LLM provider key | `sk-ant-...` |
| Frontend | `NEXT_PUBLIC_API_URL` | Backend API endpoint | `https://api.thetell.com` |
| Frontend | `NEXT_PUBLIC_APP_URL` | Frontend URL | `https://thetell.com` |

### Deployment Checklist

- [ ] Backend health check endpoint (`/health`)
- [ ] Frontend health check (homepage loads)
- [ ] Environment variables set in production
- [ ] Database migrations run on deploy
- [ ] CORS configured for frontend domain
- [ ] API URL configured in frontend
- [ ] Logging and monitoring enabled
- [ ] Error tracking (Sentry, etc.) configured

### Local Development Commands

```powershell
# Start all services (Docker Desktop handles cross-platform)
docker-compose up

# Start with build
docker-compose up --build

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Run backend tests
docker-compose exec backend pytest

# Run frontend tests
docker-compose exec frontend pnpm test
```

### Production Platforms

| Service | Platform | Why |
|---------|----------|-----|
| Backend | Railway / Render / Fly.io | Python support, easy deployment, managed database |
| Frontend | Vercel | Next.js optimized, edge functions, automatic builds |
| Database | Railway / Supabase / Neon | Managed PostgreSQL, backups, scaling |

## Common Mistakes

### Mistake 1: Shared Environment Variables

**Bad:**
```bash
# .env (shared between services)
DATABASE_URL=postgresql://...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Good:**
```bash
# backend/.env
DATABASE_URL=postgresql://...

# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Why:** Services have different configuration needs; shared env files cause confusion and potential security issues.

### Mistake 2: No Health Checks

**Bad:**
```yaml
# docker-compose.yml
services:
  backend:
    build: ./backend
    # No health check - silent failures
```

**Good:**
```yaml
services:
  backend:
    build: ./backend
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**Why:** Without health checks, failed services go unnoticed; orchestrators can't restart unhealthy containers.

### Mistake 3: Manual Migrations

**Bad:**
```powershell
# Manual migration before deploy
alembic upgrade head
# Then deploy app
```

**Good:**
```powershell
# Entrypoint script runs migrations automatically
# PowerShell entrypoint (entrypoint.ps1):
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Cross-platform: Use a Python entrypoint instead of shell scripts
# backend/entrypoint.py
import subprocess
import sys

subprocess.run(["alembic", "upgrade", "head"], check=True)
subprocess.run([
    "uvicorn", "app.main:app",
    "--host", "0.0.0.0", "--port", "8000"
], check=True)
```

**Why:** Manual migrations are forgotten; automatic migrations ensure database schema matches code.

### Mistake 4: Hardcoded API URLs

**Bad:**
```typescript
// frontend/src/api/client.ts
const API_URL = "http://localhost:8000";  // Breaks in production
```

**Good:**
```typescript
// frontend/src/api/client.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
```

**Why:** Hardcoded URLs break across environments; environment variables enable configuration per deployment.

### Mistake 5: No Volume Mounting in Dev

**Bad:**
```yaml
# docker-compose.yml
services:
  backend:
    build: ./backend
    # No volume mount - code changes require rebuild
```

**Good:**
```yaml
services:
  backend:
    build: ./backend
    volumes:
      - ./backend:/app
    command: uvicorn app.main:app --reload  # Hot reload enabled
```

**Why:** Without volume mounting, every code change requires a rebuild; hot reload enables rapid development.

### Mistake 6: Missing CORS Configuration

**Bad:**
```python
# backend/app/main.py
app = FastAPI()
# No CORS - frontend can't call API
```

**Good:**
```python
# backend/app/main.py
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Local dev
        "https://thetell.com",     # Production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Why:** Without CORS, browser blocks frontend requests to backend; configure allowed origins explicitly.

## Windows Docker Considerations

### Path Mounting

Windows Docker Desktop uses different path conventions:

```yaml
# docker-compose.yml - Windows-specific path mounting
services:
  backend:
    volumes:
      # Use relative paths (recommended - Docker Desktop handles conversion)
      - ./backend:/app

      # Or use absolute Windows paths (requires /c/ prefix in WSL2)
      # - /c/Users/username/project/backend:/app
```

**Key points:**
- Relative paths (`./backend`) work across Windows, macOS, and Linux
- Docker Desktop on Windows auto-converts Windows paths to container paths
- Avoid absolute Windows paths (`C:\...`) in compose files — use relative or WSL2-style paths

### CRLF Line Ending Issues

Files created on Windows may have CRLF (`\r\n`) endings, causing issues in Linux containers:

```powershell
# Fix CRLF in shell scripts before container use
(Get-Content entrypoint.sh) -replace '\r$', '' | Set-Content entrypoint.sh

# Or use the dos2unix tool in container
docker-compose exec backend apt-get install -y dos2unix
docker-compose exec backend dos2unix entrypoint.sh
```

**Prevention:**
- Configure Git to handle line endings: `git config --global core.autocrlf input`
- Add `.gitattributes` file: `*.sh text eol=lf`
- Use Python entrypoints instead of shell scripts for cross-platform compatibility

### PowerShell vs Bash in CI/CD

GitHub Actions and most CI platforms run on Linux by default. For Windows-specific jobs:

```yaml
# .github/workflows/ci.yml - Windows job
jobs:
  windows-test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Docker Compose
        shell: powershell
        run: docker-compose up --build
```

**Best practice:**
- Use cross-platform tools (pnpm, Python) instead of shell-specific commands
- Prefer Python entrypoints over bash/PowerShell scripts for portability
- Test Docker Compose on Windows Docker Desktop before deploying to production
