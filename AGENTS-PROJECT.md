# Project Configuration

> Project-specific configuration for the AI Agent Guidelines.
> Referenced by [`AGENTS.md`](./AGENTS.md). Replace placeholder values with your project's actual commands, paths, and keywords.
>
>
> **TEMPLATE WARNING:** If this file still contains `@yourproject/` references, it is unconfigured. Skip keyword trigger checks and use commands as illustrative examples only.

---

## Project Commands

```bash
# Run all tests
pnpm test -- --run

# Run specific package tests (monorepo)
pnpm --filter @yourproject/shared test
pnpm --filter @yourproject/server test

# Type checking
pnpm typecheck

# Production build
pnpm build

# Development mode
pnpm dev
```

---

## Test Locations

| Path | Purpose |
|------|---------|
| `packages/shared/src/__tests__/` | Shared types and utilities |
| `apps/server/src/__tests__/` | Server logic and API handlers |
| `apps/client/src/__tests__/` | Client components and hooks |

---

## Existing Test Files

| File | Purpose |
|------|---------|
| `example.test.ts` | Example unit tests |
| `example.integration.test.ts` | Example integration tests |

---

## Keyword Triggers & Task Categories

Map task keywords to learning document numbers from your `learnings/` folder. See [`AGENTS.md`](./AGENTS.md) Appendix C.

| Category | Keywords | Learnings |
|----------|----------|-----------|
| Authentication | auth, login, session, token | 001, 002 |
| Database | database, migration, schema | 003 |
| API Development | api, endpoint, route | 004, 005 |
| Testing | test, spec, expect | 006 |

---

## Commit Guidelines

Use conventional commits. Keep the subject line under 72 chars, imperative mood. Body is optional — use it only when the "why" isn't obvious from the subject.

**STRICT: No AI attribution footers.** NEVER add `Co-Authored-By: Claude`, `Generated with Claude Code`, `🤖 Generated with...`, or any similar AI-generated attribution to commits, PR descriptions, or any other output. These lines must never appear anywhere. Note: Claude Code adds these by default — you must actively suppress them.

---

## Git Workflow

<!-- Uncomment the workflow your project uses: -->

<!-- **Trunk-based:** Commit directly to `main`. No feature branches. -->
<!-- **Feature branch:** Create `feature/name` branches. Merge via PR. -->
<!-- **PR-required:** All changes via PR. No direct commits to `main`. CI must pass. -->

**Default (if not specified):** Assume feature branch workflow. Create a branch for Standard/Critical tasks; commit directly for Quick tasks.

---

## GitHub Gists

Always create **private/secret** gists by default. Never use `--public` unless the user explicitly asks for a public gist.

---

## Dependencies

- **Prefer existing dependencies** over adding new ones. Check if the project already has a library that covers the need.
- **Evaluate before adding**: Is it actively maintained? Any known vulnerabilities? What's the bundle size impact?
- **Always commit lockfile changes** — `pnpm-lock.yaml` must stay in sync
- **Never update dependencies unless asked** — even "minor" updates can break things
- **Pin versions** for critical dependencies; use ranges only for non-critical dev tools

---

## Hooks (Optional)

Claude Code hooks provide automatic guardrails that fire on specific events. Configure in `.claude/settings.json`.

| Hook Point | When It Fires | Example Use |
|-----------|--------------|-------------|
| `SessionStart` | Beginning of a conversation | Load relevant learnings, check environment |
| `UserPromptSubmit` | Before processing a user message | Route commands, detect keywords |
| `PostToolUse` (matcher: `Write\|Edit`) | After any file edit | Check for drift from task scope |

Each hook runs an external script with a hard timeout (3-5s recommended). Hooks should be lightweight checks, not heavy processing. Hooks fail silently if they exceed the timeout.

```jsonc
// .claude/settings.json — example configuration
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{"type": "command", "command": "python3 scripts/drift-check.py", "timeout": 3}]
    }]
  }
}
```

> **For AI agents:** You can read and respect hook output, but never modify `.claude/settings.json` unless the user explicitly asks. If a hook blocks your action, report what happened and ask the user to adjust their hook configuration.

---

## Learnings System

Current count: **42 documented learnings**

See [`learnings/INDEX.md`](./learnings/INDEX.md) for the complete categorized list.

### When to Add a Learning

- You make a mistake that could have been prevented
- You discover a non-obvious gotcha in the codebase
- You find a pattern that repeatedly causes issues
- The user points out an error in your approach

### Learning Document Format

File naming: `001-topic.md`, `002-topic.md`, etc.

Each learning should include:
- **Title**: Learning XXX: [Title]
- **Date/Category/Severity** (Critical/High/Medium/Low)
- **The Mistake**: What went wrong
- **Why This Is Wrong**: Explanation
- **The Correct Process**: Step-by-step correct approach
- **Red Flags to Watch For**: Warning signs
- **Prevention**: How to avoid this in the future
