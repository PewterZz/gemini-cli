---
name: prompt-change-validator
description:
  Use this skill when a prompt or tool definition has been changed and needs
  behavioral validation before merging. Triggers on phrases like "I changed the
  system prompt", "I modified a tool", "validate my prompt change", "which evals
  should I run after changing X", or "check for regressions in my PR".
---

# Prompt Change Validator

This skill guides contributors through validating behavioral correctness after
modifying the system prompt, tool definitions, or tool descriptions.

Prompt and tool changes are the highest-risk changes in Gemini CLI because they
affect every model interaction but have no compile-time safety net. A single
changed instruction can silently degrade multiple behavioral categories.

## Workflow

### 1. Identify What Changed

First, determine the scope of the change:

```bash
git diff main -- packages/core/src/prompt/ packages/core/src/tools/
```

Look for changes to:
- `snippets.ts` -- system prompt rules and behavioral guidelines
- `base-declarations.ts` -- tool names, descriptions, parameters
- Any tool implementation file -- changes here may affect tool output format

### 2. Map Changes to Affected Eval Categories

Use the coverage report to find which eval categories test the affected behavior:

```bash
node scripts/eval-coverage.mjs
```

Cross-reference the changed tool or prompt section with the tool coverage matrix.
For example, if `web_fetch` tool description changed, run `evals/web-tools.eval.ts`.

**Common mappings:**
- System prompt scope/safety rules → `agent-behavior`, `regression-safety`, `minimal-changes`
- Tool description changes → any category that uses that tool
- Tool parameter changes → `tool-selection`, `edge-cases`
- Clarification / ask_user behavior → no current coverage (known gap)

### 3. Run Targeted Evals

Run only the affected categories using the smart runner:

```bash
bash scripts/run-evals-smart.sh <model> 10 [file1.eval.ts file2.eval.ts]
```

Or run individual files with vitest directly:

```bash
RUN_EVALS=1 GEMINI_MODEL=gemini-2.5-flash npx vitest run \
  --config evals/vitest.config.ts \
  evals/agent-behavior.eval.ts evals/regression-safety.eval.ts
```

### 4. Interpret Results

**All pass**: Your change did not regress the tested categories. Note that
categories without coverage (see `eval-gap-finder` skill) are not validated.

**Failures in USUALLY_PASSES**: Run the same eval 3 times. If failures are
consistent across runs, the change caused a real regression. If failures are
random, it may be natural model variance.

**Failures in ALWAYS_PASSES**: This is a definite regression. The behavior
being tested is code-path-determined, so a failure means the change broke a
hard guarantee.

### 5. Document Results in Your PR

Include in your PR description:
- Which evals you ran
- Model used
- Pass rate before and after (if you have a baseline)
- Any new failures and whether they are expected or need fixing

### 6. Fix Regressions

If you have failures, use the `/fix-behavioral-eval` command to investigate:

```
gemini /fix-behavioral-eval
```

This command reads failing eval logs and helps diagnose whether the failure is
a prompt wording issue, a tool definition issue, or a model quality gap.

## Key Files to Know

| File | What It Controls |
|------|-----------------|
| `packages/core/src/prompt/snippets.ts` | System prompt rules, behavioral guidelines |
| `packages/core/src/tools/base-declarations.ts` | Tool names, descriptions, parameters |
| `evals/*.eval.ts` | Behavioral test cases |
| `evals/test-helper.ts` | TestRig API and evalTest helper |
| `scripts/eval-coverage.mjs` | Coverage gap analysis script |
| `scripts/run-evals-smart.sh` | Cached smart eval runner |
