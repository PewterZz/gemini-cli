---
name: eval-gap-finder
description:
  Use this skill to discover behavioral eval coverage gaps. Triggers on phrases
  like "what evals are missing", "which tools have no coverage", "what should I
  test next", or "find eval gaps". Produces a coverage report mapping each core
  tool to its eval files and identifies uncovered tools and thin categories.
---

# Eval Gap Finder

This skill helps contributors identify where behavioral eval coverage is missing
or thin, so they can prioritize new evals that have the highest impact.

## When to Use

- You want to write a new eval but don't know what to target
- You want to verify that a tool you modified has behavioral coverage
- You want an overview of the current eval suite's coverage shape

## Workflow

### 1. Run the Coverage Report

```bash
node scripts/eval-coverage.mjs
```

This scans all `evals/*.eval.ts` files and produces:
- A tool coverage matrix (which tools are tested, how many evals)
- A list of tools with zero coverage
- Per-file test counts and policy breakdown (ALWAYS_PASSES vs USUALLY_PASSES)

### 2. Interpret the Output

**Missing tools** (zero coverage) are the highest-priority gaps. Each missing
tool means there is no behavioral guardrail for that tool's decision logic.

Current uncovered tools as of last audit:
- `activate_skill` -- no eval for skill invocation behavior
- `ask_user` -- no eval for clarification-seeking behavior
- `enter_plan_mode` / `exit_plan_mode` -- no eval for plan mode transitions
- `get_internal_docs` -- no eval for internal documentation lookups
- `save_memory` -- no eval for memory write behavior
- `write_todos` -- no eval for task planning behavior

**Thin categories** (1-2 tests) are secondary priority. Check the per-file
breakdown and look for categories with fewer than 3 tests.

### 3. Pick a Gap to Fill

Use the output to select a specific tool or category. Then:

1. Check if a related issue or PR exists for that tool
2. Read the tool definition in `packages/core/src/tools/` to understand its
   behavior surface
3. Use the `behavioral-evals` skill for authoring guidance

### 4. Generate a Stub from Logs (Optional)

If you have existing chat logs in `evals/logs/`, you can scan for candidates
that exercise the uncovered tool:

```bash
node scripts/chat-to-eval.mjs --scan
```

This produces a quality and complexity report. For high-quality logs, generate
a TypeScript eval stub:

```bash
node scripts/chat-to-eval.mjs --generate evals/logs/<logfile>.log
```

Review and harden the generated stub before submitting. Generated stubs are
starting points, not finished evals.

## Coverage Report Reference

See `references/coverage-output-explained.md` for a full explanation of the
coverage report fields and how to interpret them.
