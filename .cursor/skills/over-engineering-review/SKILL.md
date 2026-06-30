---
name: over-engineering-review
description: Code review focused exclusively on over-engineering. Finds what to delete: reinvented standard library, unneeded dependencies, speculative abstractions, dead flexibility. Use when the user says "review for over-engineering", "what can we delete", "is this over-engineered", "simplify review", "ponytail-review", or asks to audit complexity. Complements correctness-focused review — this one only hunts complexity.
---

# Over-Engineering Review

Review diffs for unnecessary complexity. One line per finding: location, what to cut, what replaces it. The diff's best outcome is getting shorter.

## When to Use

- After implementing a new feature, before commit
- When user asks "is this over-engineered?"
- During code review for complexity (not correctness)
- To audit existing codebase for bloat
- To harvest `ponytail:` comment markers into debt ledger

## Output Format

`L<line>: <tag>: <what to cut>. <replacement>.`

Or for multi-file diffs: `file:L<start>-L<end>: <tag>: <what>. <replacement>.`

### Tags

| Tag | Meaning | Example |
|-----|---------|---------|
| `delete:` | Dead code, unused flexibility, speculative feature | "L12-38: delete: retry wrapper around idempotent local call. Nothing replaces it." |
| `stdlib:` | Hand-rolled thing the standard library ships | "L4: stdlib: 27-line validator class. '@' in email, 1 line, real validation is the confirmation mail." |
| `native:` | Dependency or code doing what platform already does | "L4: native: moment.js imported for one format call. Intl.DateTimeFormat, 0 deps." |
| `yagni:` | Abstraction with one implementation, config nobody sets, layer with one caller | "repo.py:L88: yagni: AbstractRepository with one implementation. Inline it until a second one exists." |
| `shrink:` | Same logic, fewer lines | "L30-44: shrink: manual loop builds dict. dict(zip(keys, values)), 1 line." |
| `ponytail:` | Intentional simplification marked with ceiling/upgrade path | Verify comment names ceiling and trigger — flag `no-trigger` if missing |

## Scoring

End with the only metric that matters: `net: -<N> lines possible.`

If nothing to cut: `Lean already. Ship.` and stop.

## Review Workflow

### 1. Scan the Diff

Focus on added lines, not context. Look for:

- Custom implementations of stdlib features (validators, parsers, formatters)
- New dependencies for what native/platform can do
- Interfaces/abstract classes with one implementation
- Config/options that never change
- Boilerplate "for later" (scaffolding, placeholder methods)
- Factories for one product
- Layers with one caller

### 2. Apply the Ladder

For each addition, mentally check:

1. **YAGNI**: Does this need to exist at all?
2. **Reuse**: Does AGENTS.md Module Map show existing helper?
3. **Stdlib**: Can standard library do it?
4. **Platform**: Can native feature do it?
5. **Installed Dep**: Does existing dependency cover it?
6. **One Line**: Can this be one line?

If any rung holds before Rung 7, flag for deletion/simplification.

### 3. Check ponytail: Comments

Grep for `ponytail:` markers in the diff. For each:

- Comment names ceiling (e.g., "global lock")? ✓
- Comment names upgrade trigger (e.g., "if throughput matters")? ✓
- Missing trigger? Flag with `no-trigger` tag — those silently rot

### 4. Generate Delete-List

Output one line per finding. End with net lines possible.

## Debt Harvesting

When user asks "ponytail debt" or "what did we defer":

Grep the whole repo for `ponytail:` comments (skip `node_modules`, `.git`, build output):

```powershell
rg -n "ponytail:" --glob "!node_modules/*" --glob "!*.lock" --glob "!*.json"
```

Output format per marker: `<file>:L<line>. ceiling: <ceiling>. upgrade: <trigger>.`

Flag `no-trigger` if comment lacks upgrade path. End with count of markers and rot risks.

## Scope

**In scope**: Over-engineering and complexity only.

**Out of scope**: Correctness bugs, security holes, performance issues, accessibility. Route those to normal review pass, not this one.

A single `assert`-based self-check or one small test file is the ponytail minimum — never flag it for deletion.

## Boundaries

- Does not apply the fixes, only lists them
- "stop ponytail-review" or "normal mode": revert to verbose review style