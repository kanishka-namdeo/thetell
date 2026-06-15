---
name: Recreate Cursor Config
overview: Migrate the workspace .cursor/ configuration from simple .md rules to a comprehensive .mdc-based system modeled on reference_instructions/.cursor/, adding 20 missing rules, 4 reference skills, settings.json, lessons-learned tracking, and updating AGENTS.md -- all adapted to the current workspace's actual file structure.
todos:
  - id: phase1-convert-rules
    content: "Phase 1: Convert 6 existing .md rules to .mdc format with YAML frontmatter, delete old .md files"
    status: completed
  - id: phase2-always-rules
    content: "Phase 2a: Create 6 new always-applied .mdc rules (general, agent-persona, auto-update-features-doc, design-assets-enforcement, powershell-commands-windows, product-context)"
    status: completed
  - id: phase2-glob-rules
    content: "Phase 2b: Create 9 new glob-scoped .mdc rules (data-layer, debuggability, langgraph-patterns, layout-and-page-patterns, nextjs-patterns, phosphor-icons, react-components, testing-conventions, typescript-standards)"
    status: completed
  - id: phase2-requestable-rules
    content: "Phase 2c: Create 11 new agent-requestable .mdc rules (agentic-reasoning-guardrails, continuous-improvement, langgraph-reference, nextjs-auth, plan-execution, plan-mode-enhancement, strreplace-safety, subagent-orchestration, web-search-optimization, write-effective-rules, write-effective-skills)"
    status: completed
  - id: phase3-skills
    content: "Phase 3: Create 4 reference skills (browser-testing-workflows, docker-workflows, svg-design with 9 reference files, use-chrome-devtools-mcp)"
    status: completed
  - id: phase4-config
    content: "Phase 4: Create settings.json, lessons-learned.md, docs/features-built.md"
    status: completed
  - id: phase5-agents
    content: "Phase 5: Update AGENTS.md to reflect full inventory"
    status: completed
  - id: verify
    content: "Verification: Confirm all files exist, no old .md rules remain, spot-check frontmatter syntax"
    status: completed
isProject: false
---

# Recreate .cursor Rules, Skills, and Instructions

## Current State vs Target State

```
CURRENT .cursor/                    TARGET .cursor/
─────────────────                   ─────────────────
rules/ (6 .md files)       -->      rules/ (26 .mdc files)
  - api-design.md                     - api-design.mdc (upgraded)
  - code-style.md                     - code-style.mdc (upgraded)
  - environment.md                    - environment.mdc (upgraded)
  - git-workflow.md                   - git-workflow.mdc (upgraded)
  - security.md                       - security.mdc (upgraded)
  - testing.md                        - testing.mdc (upgraded)
                                      - agent-persona.mdc (NEW)
                                      - agentic-reasoning-guardrails.mdc (NEW)
                                      - auto-update-features-doc.mdc (NEW)
                                      - continuous-improvement.mdc (NEW)
                                      - data-layer.mdc (NEW)
                                      - debuggability.mdc (NEW)
                                      - design-assets-enforcement.mdc (NEW)
                                      - general.mdc (NEW)
                                      - langgraph-patterns.mdc (NEW)
                                      - langgraph-reference.mdc (NEW)
                                      - layout-and-page-patterns.mdc (NEW)
                                      - nextjs-auth.mdc (NEW)
                                      - nextjs-patterns.mdc (NEW)
                                      - lucide-icons.mdc (NEW)
                                      - plan-execution.mdc (NEW)
                                      - plan-mode-enhancement.mdc (NEW)
                                      - powershell-commands-windows.mdc (NEW)
                                      - product-context.mdc (NEW)
                                      - react-components.mdc (NEW)
                                      - strreplace-safety.mdc (NEW)
                                      - subagent-orchestration.mdc (NEW)
                                      - testing-conventions.mdc (NEW)
                                      - typescript-standards.mdc (NEW)
                                      - web-search-optimization.mdc (NEW)
                                      - write-effective-rules.mdc (NEW)
                                      - write-effective-skills.mdc (NEW)

skills/ (8 domain skills)  -->      skills/ (8 domain + 4 reference = 12)
  - api-design/                       - api-design/ (KEEP)
  - article-generation/               - article-generation/ (KEEP)
  - data-modeling/                    - data-modeling/ (KEEP)
  - llm-abstraction/                  - llm-abstraction/ (KEEP)
  - monorepo-deployment/              - monorepo-deployment/ (KEEP)
  - signal-analysis/                  - signal-analysis/ (KEEP)
  - testing-strategies/               - testing-strategies/ (KEEP)
  - web-scraping/                     - web-scraping/ (KEEP)
                                      - browser-testing-workflows/ (NEW)
                                      - docker-workflows/ (NEW)
                                      - svg-design/ (NEW, with 9 reference files)
                                      - use-chrome-devtools-mcp/ (NEW)

(no settings.json)          -->      settings.json (NEW)
(no lessons-learned.md)     -->      lessons-learned.md (NEW)
(no docs/features-built.md) -->      docs/features-built.md (NEW)
AGENTS.md (outdated)        -->      AGENTS.md (UPDATED)
```

## Key Design Decisions

### Format Migration: .md to .mdc
- All 6 existing rules must be converted from `.md` to `.mdc` with proper YAML frontmatter
- Frontmatter fields: `description` (third-person, under 50 words, dense trigger terms), `globs` (file patterns for scoped rules), `alwaysApply` (boolean)
- The `.mdc` format enables Cursor's activation modes: always-applied rules load every turn; glob-scoped rules load only when matching files are open; agent-requestable rules load on-demand when relevant

### Activation Mode Classification
- **Always-applied** (load every turn, keep concise): `general.mdc`, `agent-persona.mdc`, `auto-update-features-doc.mdc`, `design-assets-enforcement.mdc`, `powershell-commands-windows.mdc`, `product-context.mdc` + the 6 upgraded rules
- **Glob-scoped** (load when matching files open): `data-layer.mdc`, `debuggability.mdc`, `langgraph-patterns.mdc`, `layout-and-page-patterns.mdc`, `nextjs-patterns.mdc`, `phosphor-icons.mdc`, `react-components.mdc`, `testing-conventions.mdc`, `typescript-standards.mdc`
- **Agent-requestable** (load on-demand): `agentic-reasoning-guardrails.mdc`, `continuous-improvement.mdc`, `langgraph-reference.mdc`, `nextjs-auth.mdc`, `plan-execution.mdc`, `plan-mode-enhancement.mdc`, `strreplace-safety.mdc`, `subagent-orchestration.mdc`, `web-search-optimization.mdc`, `write-effective-rules.mdc`, `write-effective-skills.mdc`

### Workspace Adaptations Required (VERIFIED)

**Verified Workspace State:**
- Next.js 16.2.9 with React 19.2.4
- Uses `lucide-react` (NOT `@phosphor-icons/react`)
- No Prisma, no logger, no agent layer, no proxy.ts, no Docker setup
- `src/app/` has 3 files: globals.css, layout.tsx, page.tsx
- `src/lib/` has 1 file: utils.ts
- `src/components/` has UI components (button, card, input, badge, separator)
- `DESIGN_SYSTEM.md` exists (NOT `DESIGN.md`)
- `docs/research/` has 5 research files
- NO `docs/mvp-scope.md`, `docs/tool-vision-and-market-research.md`, `docs/user-flows-ai-native.md`

**Specific Adaptations:**
- `product-context.mdc`: Reference `DESIGN_SYSTEM.md` and `docs/research/*.md` files. Remove references to non-existent product docs
- `phosphor-icons.mdc`: REPLACE with `lucide-icons.mdc` covering lucide-react usage patterns
- `data-layer.mdc`: Keep as aspirational (activates when Prisma is added)
- `debuggability.mdc`: Keep as aspirational (activates when logger is added)
- `langgraph-patterns.mdc` and `langgraph-reference.mdc`: Keep as aspirational (activates when agent layer is added)
- `nextjs-auth.mdc`: Keep as aspirational (activates when auth is added)
- `docker-workflows` skill: Keep as aspirational (activates when Docker is added)
- All glob paths: Prefix with `src/` (e.g., `src/app/**/*.tsx`, `src/lib/**/*.ts`)
- `design-assets-enforcement.mdc`: Adjust `app/globals.css` to `src/app/globals.css`

---

## Execution Plan

### Phase 1: Delete Old .md Rules and Create .mdc Replacements (6 files)

Convert each existing `.md` rule to `.mdc` format with YAML frontmatter. Delete the old `.md` file after creating the `.mdc` replacement.

| # | Old File | New File | Frontmatter |
|---|----------|----------|-------------|
| 1 | `rules/api-design.md` | `rules/api-design.mdc` | `alwaysApply: true` |
| 2 | `rules/code-style.md` | `rules/code-style.mdc` | `alwaysApply: true` |
| 3 | `rules/environment.md` | `rules/environment.mdc` | `alwaysApply: true` |
| 4 | `rules/git-workflow.md` | `rules/git-workflow.mdc` | `alwaysApply: true` |
| 5 | `rules/security.md` | `rules/security.mdc` | `alwaysApply: true` |
| 6 | `rules/testing.md` | `rules/testing.mdc` | `alwaysApply: true` |

For each: read the existing `.md` content, wrap in `.mdc` format with proper YAML frontmatter (description, alwaysApply), and write the new file. Then delete the old `.md`.

### Phase 2: Create 20 New .mdc Rules (20 files)

Create each rule adapted to the current workspace. Source content from the reference `.mdc` files but adjust all paths, imports, and references to match the actual workspace structure.

**Always-applied rules (6 new):**

| # | File | Purpose | Adaptation Notes |
|---|------|---------|-----------------|
| 7 | `rules/general.mdc` | Core operating principles, priority hierarchy, tool priority, pnpm mandate | Keep as-is from reference; already workspace-agnostic |
| 8 | `rules/agent-persona.mdc` | Dual-mode persona (PM/UX for planning, engineer for coding) | Keep as-is; workspace-agnostic behavioral rule |
| 9 | `rules/auto-update-features-doc.mdc` | Auto-update `docs/features-built.md` after feature changes | Keep as-is; references `docs/features-built.md` which we create in Phase 5 |
| 10 | `rules/design-assets-enforcement.mdc` | shadcn/ui enforcement, token system, accessibility | Adjust `app/globals.css` references to `src/app/globals.css`; adjust `@/components/ui/` paths (already correct) |
| 11 | `rules/powershell-commands-windows.mdc` | Windows PowerShell command conventions | Keep as-is; OS-level, not project-specific |
| 12 | `rules/product-context.mdc` | Points to canonical product docs | **Major adaptation**: update file references to match actual workspace files (`DESIGN_SYSTEM.md`, `competitive_analysis_report.md`, `docs/research/` files). Remove references to non-existent docs or mark as "create when available" |

**Glob-scoped rules (9 new):**

| # | File | Globs | Purpose |
|---|------|-------|---------|
| 13 | `rules/data-layer.mdc` | `src/lib/db/**/*.ts,src/lib/prisma.ts` | Prisma ORM conventions |
| 14 | `rules/debuggability.mdc` | `src/lib/**/*.ts,src/app/api/**/*.ts` | Pino logging, no console.* |
| 15 | `rules/langgraph-patterns.mdc` | `src/lib/agent/**/*.ts` | LangGraph agent coding patterns |
| 16 | `rules/layout-and-page-patterns.mdc` | `src/app/**/*.tsx` | Next.js dashboard page/layout patterns |
| 17 | `rules/nextjs-patterns.mdc` | `src/app/**/*.ts,src/app/**/*.tsx` | Next.js 16 app directory patterns |
| 18 | `rules/lucide-icons.mdc` | `src/**/*.tsx,src/**/*.ts` | Lucide React icon usage rules (replaces phosphor-icons -- workspace uses lucide-react) |
| 19 | `rules/react-components.mdc` | `src/**/*.tsx,src/**/*.ts` | React component patterns for App Router |
| 20 | `rules/testing-conventions.mdc` | `src/**/*.test.ts,src/**/*.test.tsx,src/**/*.spec.ts,src/**/*.spec.tsx` | Vitest + Playwright testing conventions |
| 21 | `rules/typescript-standards.mdc` | `src/**/*.ts,src/**/*.tsx` | TypeScript coding standards |

**Agent-requestable rules (5 new):**

| # | File | Purpose |
|---|------|---------|
| 22 | `rules/agentic-reasoning-guardrails.mdc` | 11 rules preventing tool loops, phantom calls, context bloat |
| 23 | `rules/continuous-improvement.mdc` | Mistake capture loop, lessons-learned tracking |
| 24 | `rules/langgraph-reference.mdc` | Extended LangGraph reference (checkpointer, anti-patterns) |
| 25 | `rules/nextjs-auth.mdc` | auth() helper, SessionProvider, proxy.ts patterns |
| 26 | `rules/plan-execution.mdc` | Execution checkpoints, direct vs subagent, verification |
| 27 | `rules/plan-mode-enhancement.mdc` | Plan validation checklist, mandatory template |
| 28 | `rules/strreplace-safety.mdc` | Large JSX/markdown StrReplace safety patterns |
| 29 | `rules/subagent-orchestration.mdc` | Multi-agent patterns, circuit breakers, decomposition |
| 30 | `rules/web-search-optimization.mdc` | Query construction, site-specific search, result evaluation |
| 31 | `rules/write-effective-rules.mdc` | How to write .mdc rules (meta-rule) |
| 32 | `rules/write-effective-skills.mdc` | How to author SKILL.md files (meta-rule) |

### Phase 3: Create 4 Reference Skills (4 directories, 13 files)

Copy reference skills adapted to current workspace. These are operational/tool skills (complementary to the 8 existing domain skills).

| # | Skill Directory | Files | Adaptation |
|---|----------------|-------|------------|
| 33 | `skills/browser-testing-workflows/` | `SKILL.md` | Adjust project-specific references |
| 34 | `skills/docker-workflows/` | `SKILL.md` | Adjust for current Docker setup |
| 35 | `skills/svg-design/` | `SKILL.md` + `assets/preview.html` + 8 `references/*.md` files | Copy as-is; self-contained skill |
| 36 | `skills/use-chrome-devtools-mcp/` | `SKILL.md` | Copy as-is; MCP tool reference |

The svg-design skill includes these reference files:
- `references/accessibility-and-pitfalls.md`
- `references/advanced-techniques.md`
- `references/animation.md`
- `references/editing-workflow.md`
- `references/icon-design.md`
- `references/logo-techniques.md`
- `references/optimization.md`
- `references/path-patterns.md`

### Phase 4: Create Config and Tracking Files (3 files)

| # | File | Content |
|---|------|---------|
| 37 | `.cursor/settings.json` | `{"plugins":{"vercel":{"enabled":true}}}` |
| 38 | `.cursor/lessons-learned.md` | Initialize with header and empty state; reference the continuous-improvement rule for format |
| 39 | `docs/features-built.md` | Initialize with header, table structure, and "Last updated" date; sections matching the auto-update-features-doc rule format |

### Phase 5: Update AGENTS.md

Update `AGENTS.md` to reflect the new comprehensive rule/skill inventory:
- Keep the Next.js warning block at the top
- Update the rules list to include all 26 `.mdc` rules with their activation modes
- Update the skills list to include all 12 skills
- Add a section explaining the three activation modes (always-applied, glob-scoped, agent-requestable)

---

## File Count Summary

| Action | Count |
|--------|-------|
| Delete old .md rules | 6 |
| Create .mdc replacements for existing rules | 6 |
| Create new .mdc rules | 20 |
| Create new skill directories | 4 |
| Create skill files (SKILL.md + assets + references) | 13 |
| Create config/tracking files | 3 |
| Update AGENTS.md | 1 |
| **Total operations** | **53** |

## Verification Checklist

After all files are created:
1. Confirm all 26 `.mdc` files exist in `.cursor/rules/`
2. Confirm all 12 skill directories exist in `.cursor/skills/`
3. Confirm `.cursor/settings.json` exists
4. Confirm `.cursor/lessons-learned.md` exists
5. Confirm `docs/features-built.md` exists
6. Confirm no old `.md` rule files remain in `.cursor/rules/`
7. Confirm `AGENTS.md` reflects the updated inventory
8. Spot-check 3-5 `.mdc` files for correct YAML frontmatter syntax
