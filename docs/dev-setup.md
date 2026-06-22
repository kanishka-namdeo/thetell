# Local Development Setup

This guide covers setting up and running The Tell's local development environment.

## Prerequisites

- **Node.js 20+** and **pnpm**
- **Docker Desktop** (for infrastructure services)
- **Git**

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd the_tell
pnpm install

# 2. Set up environment
cp .env.example .env.local
# Edit .env.local with your API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)

# 3. Start infrastructure (Postgres + Inngest)
docker-compose up -d

# 4. Run database migrations and seed
pnpm prisma migrate deploy
pnpm prisma db seed

# 5. Start Next.js dev server
pnpm dev
```

The app will be available at http://localhost:3000

## Infrastructure Services

All infrastructure runs in Docker via `docker-compose.yml`.

### Starting Services

```bash
# Start all infrastructure (Postgres + Inngest)
docker-compose up -d

# Or start individually
docker-compose up -d db
docker-compose up -d inngest
```

### Service URLs

- **Postgres**: `localhost:5433`
- **Inngest Dev Server UI**: http://localhost:8288
- **Next.js App**: http://localhost:3000 (run separately with `pnpm dev`)

### Managing Services

```bash
# View logs for all services
docker-compose logs -f

# View logs for specific service
docker-compose logs -f inngest
docker-compose logs -f db

# Stop all services
docker-compose stop

# Stop specific service
docker-compose stop inngest

# Restart services
docker-compose restart

# Remove all services and volumes (fresh start)
docker-compose down -v
```

## Inngest Dev Server

The Inngest dev server runs in Docker and connects to your Next.js app running on the host via `host.docker.internal`.

### Accessing the UI

Open http://localhost:8288 to:

- Inspect function runs
- Replay events
- Debug step-by-step
- Manually trigger functions
- View function discovery status

### Using Inngest Scripts

```bash
# Start Inngest (Docker)
pnpm run dev:inngest

# Stop Inngest
pnpm run dev:inngest:stop

# View Inngest logs
pnpm run dev:inngest:logs

# Alternative: Run Inngest locally (without Docker)
pnpm run dev:inngest:local
```

### Troubleshooting Inngest

**Functions not appearing in UI?**

1. Ensure Next.js dev server is running (`pnpm dev`)
2. Check Inngest logs: `pnpm run dev:inngest:logs`
3. Verify `INNGEST_DEV=1` is set in `.env.local`
4. Restart Inngest: `pnpm run dev:inngest:stop && pnpm run dev:inngest`

**Inngest can't reach Next.js app?**

- On Windows/macOS: `host.docker.internal` works automatically with Docker Desktop
- On Linux: The `extra_hosts` configuration in `docker-compose.yml` enables this
- Ensure Next.js is running on port 3000 (default)

## Database

### Connection

The database connection string is in `.env.local`:

```env
DATABASE_URL=postgresql://thetell_user:thetell_password@localhost:5433/the_tell
```

### Common Operations

```bash
# Run migrations
pnpm prisma migrate deploy

# Reset database (WARNING: deletes all data)
pnpm prisma migrate reset

# Open Prisma Studio (database GUI)
pnpm prisma studio

# Generate Prisma client after schema changes
pnpm prisma generate
```

### Test Users

The seeded database includes test users:

| User | Email | Password | Role |
|------|-------|----------|------|
| Admin | `admin@thetell.com` | `password123` | `ADMIN` |
| Analyst | `analyst@thetell.com` | `password123` | `USER` |

## Environment Variables

Copy `.env.example` to `.env.local` and fill in required values:

```bash
cp .env.example .env.local
```

### Required Variables

- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_SECRET` - Random string for NextAuth encryption
- `NEXTAUTH_URL` - Should be `http://localhost:3000`
- `OPENAI_API_KEY` - OpenAI API key for AI features
- `ANTHROPIC_API_KEY` - Anthropic API key for AI features

### Optional Variables

- `INNGEST_DEV=1` - Enable Inngest dev server (already set)
- `INNGEST_SIGNING_KEY` - For production Inngest Cloud
- `ADMIN_API_KEY` - For admin API authentication
- Various scraper API keys (USPTO, CourtListener, etc.)

See `.env.example` for all available options.

## Development Workflow

### Typical Day

```bash
# 1. Start infrastructure (Postgres + Inngest)
docker-compose up -d

# 2. Start Next.js + OpenCode server (both run together)
pnpm dev

# 3. Open browser
# App: http://localhost:3000
# Inngest UI: http://localhost:8288
# OpenCode server: http://localhost:4096 (headless, for SDK integration)
# Prisma Studio: pnpm prisma studio

# 4. When done, stop infrastructure
docker-compose stop
```

### What `pnpm dev` Does

The `dev` script runs two processes in parallel:
- **Next.js dev server** on port 3000 (the app)
- **OpenCode serve** on port 4096 (headless debug agent server)

Your app can connect to the OpenCode server via the SDK at `http://localhost:4096` to use it as a debug agent, code reviewer, or for automated analysis tasks.

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run linting
pnpm lint

# Run type checking
pnpm typecheck
```

### Building for Production

```bash
# Build the app
pnpm build

# Start production server
pnpm start
```

## Troubleshooting

### Port Conflicts

If ports 5433, 8288, or 3000 are already in use:

1. Find the process using the port:
   ```bash
   # Windows PowerShell
   Get-NetTCPConnection -LocalPort 5433
   
   # macOS/Linux
   lsof -i :5433
   ```

2. Stop the conflicting process, or change the port in `docker-compose.yml` / `.env.local`

### Docker Issues

```bash
# Rebuild containers
docker-compose build --no-cache

# Remove and recreate containers
docker-compose down
docker-compose up -d

# Check container status
docker-compose ps

# View container logs
docker-compose logs
```

### Database Connection Issues

1. Ensure Docker is running
2. Check if Postgres container is healthy: `docker-compose ps`
3. Verify connection string in `.env.local`
4. Try restarting: `docker-compose restart db`

### Next.js Issues

```bash
# Clear Next.js cache
Remove-Item -Recurse -Force .next  # Windows PowerShell
rm -rf .next                       # macOS/Linux

# Clear node_modules and reinstall
Remove-Item -Recurse -Force node_modules
pnpm install

# Restart dev server
pnpm dev
```

## OpenCode

OpenCode is installed locally as a dev dependency (not globally). It's available via:

```bash
# Run via pnpm script
pnpm opencode

# Or via pnpm exec
pnpm exec opencode
```

The `opencode/` directory contains agent configuration and context for debugging.

## Additional Resources

- **Prisma Documentation**: https://www.prisma.io/docs
- **Next.js Documentation**: https://nextjs.org/docs
- **Inngest Documentation**: https://www.inngest.com/docs
- **Project Architecture**: See `AGENTS.md` for module map and architecture

## Getting Help

1. Check `docs/features-built.md` for feature status
2. Review `AGENTS.md` for architecture overview
3. Check existing GitHub issues or create a new one
