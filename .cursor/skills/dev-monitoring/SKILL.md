---
name: dev-monitoring
description: Monitor pipeline health, signal quality, build status, and resource usage during development sessions. Use with /loop for scheduled checks, or when the user asks to check pipeline status, monitor signals, detect stuck analyses, verify build health, or watch for regressions. Covers thresholds, remediation, and PowerShell loop patterns.
---

# Development Monitoring

This skill tells you **WHAT to monitor**, **WHAT the results mean**, and **WHAT to do about it**. Pair with `/loop` for scheduling.

## Monitoring Catalog

| Target | Command | Sentinel Pattern | Healthy | Warning | Critical |
|---|---|---|---|---|---|
| Pipeline health | `pnpm run check:pipeline` | `PIPELINE_HEALTH:` | stuck=0, pending<20 | stuck 1-5, pending 20-50 | stuck>5, pending>50 |
| Stuck signals | `pnpm run check:stuck` | `Found (\d+) signals stuck` | 0 stuck | 1-5 stuck | >5 stuck |
| DB state | `pnpm run check:db` | `PENDING signals: (\d+)` | pending<10 | pending 10-30 | pending>30 |
| Build health | `pnpm run typecheck` | exit code 0 | pass | - | fail |
| Docker services | `docker ps --format "{{.Names}} {{.Status}}"` | all "Up" | all running | 1 restarted | any down |
| Dev server | `Invoke-WebRequest localhost:3000 -UseBasicParsing` | status 200 | 200 | - | non-200 |
| Memory (dev server) | `Get-Process node | Select-Object WorkingSet64` | heap < 2GB | <2GB | 2-4GB | >4GB |

## Remediation Actions

| Condition | Action |
|---|---|
| Stuck signals > 5 | Run `pnpm run reset:stuck` (requires user confirmation — mutates DB) |
| Pending backlog > 50 | Check Inngest dev server: `pnpm run dev:inngest:logs` |
| Build failure | Run `pnpm run typecheck` for details, check recent changes |
| Docker service down | `docker-compose restart <service>`, then `docker logs <service>` |
| Memory > 4GB | Restart dev server (Turbopack growth is expected per lessons-learned) |
| Quality regression | Run `signal-data-quality-debugging` skill for root cause |

## /loop Integration Patterns

```powershell
# Pipeline health during development (fixed 5min)
/loop 5m run pnpm run check:pipeline, report if stuck > 0 or pending > 20

# Build monitoring during multi-file changes (fixed 10min)
/loop 10m run pnpm run typecheck, report new errors

# Dynamic: monitor after triggering analysis
/loop run pnpm run check:pipeline every 30s until stuck=0 and pending=0

# Docker service health (fixed 15min)
/loop 15m run docker ps, report if any service is not "Up"
```

## Sentinel Naming Conventions

```
AGENT_LOOP_TICK_<domain>_<purpose>
```

| Domain | Examples |
|---|---|
| `pipeline` | `AGENT_LOOP_TICK_pipeline_health`, `AGENT_LOOP_TICK_pipeline_queue` |
| `build` | `AGENT_LOOP_TICK_build_typecheck`, `AGENT_LOOP_TICK_build_lint` |
| `quality` | `AGENT_LOOP_TICK_quality_signals`, `AGENT_LOOP_TICK_quality_truncated` |
| `infra` | `AGENT_LOOP_TICK_infra_docker`, `AGENT_LOOP_TICK_infra_devserver` |
| `git` | `AGENT_LOOP_WAKE_git_change` (dynamic, event-driven) |

## Decision Tree: /loop vs notify_on_output vs AwaitShell

| Situation | Use | Why |
|---|---|---|
| Periodic checks during dev session | `/loop` | Recurring schedule, agent wakes on each tick |
| Monitoring a single long-running process | `notify_on_output` | Single process, regex match on its output |
| Waiting for a specific command to finish | `AwaitShell` | One-shot wait, next step depends on result |
| Event-driven monitoring (git change, file change) | `/loop` dynamic mode | Watcher + fallback heartbeat |
| One-time health check | Direct Shell call | No scheduling needed |

## Guardrails

- **Never run `reset:stuck` or `reset:stale` without user confirmation** — they mutate DB
- Docker health checks require Docker Desktop running
- Memory checks are advisory — Turbopack growth is expected behavior (see lessons-learned 06-22)
- Quality SQL queries require local DB running (`docker-compose up -d db`)
- Sentinel names must be unique per loop to prevent collisions
