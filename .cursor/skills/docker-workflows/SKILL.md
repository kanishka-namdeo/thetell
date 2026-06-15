---
name: docker-workflows
description: Use when building, running, debugging, or modifying Docker containers and compose services. Covers infrastructure container setup, database services, and Windows-specific Docker workflows.
---

# Docker Workflows

## Overview

> **Status: Aspirational** — This workspace does not yet have Docker configured. This skill documents the intended Docker architecture for when containers are added.

This project will use Docker to run infrastructure services while the Next.js app runs locally on Windows:

1. **Postgres container** — Database on port 5432
2. **Future services** — Additional containers as needed (e.g., Redis, stealth browser)

## Architecture (Planned)

```
┌─────────────────────────────────────────────────────────┐
│  Windows Host                                           │
│                                                         │
│  ┌─────────────────────┐                               │
│  │  Next.js App        │  pnpm dev                     │
│  │  (localhost:3000)   │                               │
│  └──────────┬──────────┘                               │
│             │                                          │
│  ┌──────────▼──────────┐                               │
│  │  Postgres           │                               │
│  │  Container          │                               │
│  │  (localhost:5432)   │                               │
│  └─────────────────────┘                               │
└─────────────────────────────────────────────────────────┘
```

## File Map (Planned)

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Defines infrastructure services |
| `.dockerignore` | Excludes node_modules, .next, .git from build context |

## Common Commands (Windows PowerShell)

**Note:** Use Docker Compose V2 (`docker compose` without hyphen). The legacy `docker-compose` command is deprecated.

```powershell
# Start all services (detached)
docker compose up -d

# Rebuild after Dockerfile changes
docker compose up -d --build

# View logs (follow mode)
docker compose logs -f

# View last 50 lines
docker compose logs --tail=50

# Stop all services
docker compose down

# Stop and remove volumes (destroys data)
docker compose down -v

# Check running containers
docker ps

# Check container health status
docker ps --format "table {{.Names}}\t{{.Status}}"

# Access Postgres shell
docker exec -it the-tell-db psql -U thetell

# Restart single service
docker compose restart postgres
```

## Known Pitfalls

### 1. Windows Line Endings

Entrypoint scripts are bash. The Dockerfile must strip `\r` characters:

```dockerfile
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh
```

Always ensure shell scripts use LF line endings.

### 2. Healthcheck Commands

Different services need different healthcheck tools:

```yaml
# Postgres healthcheck
test: ["CMD-SHELL", "pg_isready -U thetell"]
```

### 3. Volume Mounts on Windows

The `.data` directory is mounted for persistent data. Windows path separators are handled automatically by Docker Desktop.

```yaml
volumes:
  - ./.data:/app/.data  # Data persists across rebuilds
```

## Adding a New Service

1. Add service definition to `docker-compose.yml`
2. Create Dockerfile if custom image needed (name it `Dockerfile.<service-name>`)
3. Add healthcheck for dependency ordering
4. Update `.dockerignore` if the service needs build context exclusions
5. Document the service's ports and environment variables

## Windows-Specific Considerations

### Docker Desktop with WSL2

This project runs on Windows with Docker Desktop using the WSL2 backend.

| Aspect | Windows Behavior |
|--------|------------------|
| **File sharing** | Docker Desktop automatically shares C:\, D:\, etc. |
| **Path separators** | Docker handles Windows `\` to Linux `/` conversion in volume mounts |
| **Line endings** | Shell scripts must use LF. The Dockerfile strips `\r` |
| **Performance** | WSL2 filesystem is fast; bind mounts from Windows drives are slower |
| **Networking** | `localhost` on Windows maps to container ports correctly |

### Docker Desktop Settings

Ensure these Docker Desktop settings are configured:

1. **Use WSL 2 based engine** — Enabled (Settings → General)
2. **File sharing** — Your project drive (D:\) must be enabled (Settings → Resources → File sharing)
3. **Resource allocation** — Recommend 4+ GB RAM, 2+ CPUs

### WSL2 Memory Pressure

WSL2 can consume significant memory. If Docker containers are killed unexpectedly:

```powershell
# Check WSL memory usage
wsl --status

# Restart WSL if needed
wsl --shutdown
# Then restart Docker Desktop
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Port 5432 already in use` | Another process or container | `docker ps` to find conflicting container |
| `Permission denied: entrypoint.sh` | Windows line endings | Rebuild (Dockerfile strips `\r`) |
| `Container killed unexpectedly` | WSL2 memory pressure | `wsl --shutdown`, restart Docker Desktop |
| `Slow build times` | Windows file sharing overhead | Exclude `.next` and `node_modules` from build context |
