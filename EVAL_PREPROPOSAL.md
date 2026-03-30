# GSoC 2026 Pre-Proposal: Behavioral Evals, Quality, and the OSS Community

**Branch:** `feat/eval-coverage-tooling` · **Author:**
[PewterZz](https://github.com/PewterZz) · **Issue:**
[#23331](https://github.com/google-gemini/gemini-cli/issues/23331)

---

## What Was Built

Four contributor artifacts implemented and validated against the live Gemini
API:

| Artifact                                 | Location                                                                       | Status       |
| ---------------------------------------- | ------------------------------------------------------------------------------ | ------------ |
| 77 behavioral evals across 16 categories | `evals/` (various files)                                                       | Validated    |
| Coverage report tool                     | `scripts/eval-coverage.mjs`                                                    | Running      |
| Chat-to-eval converter                   | `scripts/chat-to-eval.mjs`                                                     | Running      |
| Contributor skills (3)                   | `.gemini/skills/eval-gap-finder/`, `prompt-change-validator/`, `chat-to-eval/` | Smoke-tested |
| Diagnostic subagent                      | `.gemini/agents/eval-investigator.md`                                          | Smoke-tested |

---

## Validation Results (March 28–30, 2026)

77 evals run against all 5 nightly models via Vertex AI. All failures are
genuine model behavioral failures — zero quota errors, zero timeouts.

| Model                    | Pass Rate         | Notes                            |
| ------------------------ | ----------------- | -------------------------------- |
| `gemini-2.5-flash-lite`  | **63.6%** (49/77) | 2.5 family baseline              |
| `gemini-2.5-flash`       | **64.9%** (50/77) |                                  |
| `gemini-2.5-pro`         | **63.6%** (49/77) | Scale ≠ better within generation |
| `gemini-3-flash-preview` | **80.5%** (62/77) | ~16pt generation gap             |
| `gemini-3-pro-preview`   | **79.2%** (61/77) |                                  |

**The suite is model-discriminating**: generation-3 models (79–81%) clearly
outperform generation-2.5 (63–65%). Within each generation, the ranking is
non-trivial — 2.5-pro does not consistently beat 2.5-flash.

### Per-Category Breakdown

| Category             | Tests | 2.5-lite | 2.5-fl | 2.5-pro | 3-fl | 3-pro |
| -------------------- | ----- | -------- | ------ | ------- | ---- | ----- |
| agent-behavior       | 11    | 91%      | 91%    | 64%     | 91%  | 91%   |
| code-review          | 5     | 60%      | 60%    | 100%    | 80%  | 80%   |
| context-awareness    | 5     | 40%      | 100%   | 60%     | 80%  | 100%  |
| debugging            | 4     | 50%      | 50%    | 25%     | 75%  | 50%   |
| edge-cases           | 6     | 100%     | 83%    | 83%     | 100% | 100%  |
| error-recovery       | 3     | 67%      | 67%    | 67%     | 67%  | 67%   |
| l3-advanced          | 4     | 75%      | 25%    | 50%     | 75%  | 100%  |
| large-codebase       | 4     | 25%      | 25%    | 25%     | 50%  | 50%   |
| minimal-changes      | 6     | 83%      | 83%    | 83%     | 83%  | 83%   |
| multi-file-editing   | 4     | 50%      | 25%    | 75%     | 75%  | 50%   |
| multi-turn           | 4     | 25%      | 100%   | 50%     | 75%  | 75%   |
| performance-patterns | 5     | 60%      | 60%    | 80%     | 100% | 100%  |
| refactoring          | 3     | 0%       | 33%    | 67%     | 33%  | 67%   |
| regression-safety    | 3     | 67%      | 67%    | 67%     | 67%  | 33%   |
| tool-selection       | 5     | 100%     | 60%    | 60%     | 100% | 100%  |
| web-tools            | 5     | 40%      | 40%    | 40%     | 80%  | 60%   |

---

## Key Findings from Validation

### 1. Tool name discrepancy

`google_web_search` (not `web_search`) and `list_directory` (not `ls`) are the
correct tool names. Documentation used wrong names — any eval using them
produces silent assertion failures. All 77 evals import constants directly from
`base-declarations.ts`.

### 2. Vertex AI auth gap in TestRig (fixed)

The test rig did not pre-create `$HOME/.gemini/` before spawning the CLI,
causing auth to fail silently. Fixed in commit
[`61d1099`](https://github.com/PewterZz/gemini-cli/commit/61d1099).

### 3. Large-codebase eval design gap

All 5 models score 25% on 3 of 4 large-codebase tests. Root cause: file paths
are inferable from workspace context, so models shortcut discovery. These tests
will be redesigned with unguessable paths. The 4th test (rename-with-callers)
requires real grep and all models pass it.

### 4. Prompt change with before/after evidence

Adding one rule to `snippets.ts` ("when file read fails, use grep/glob")
improved `l3-advanced` from 25% → 50% on 2.5-flash and 75% → 100% on 3-flash.
Committed as [`f876edb`](https://github.com/PewterZz/gemini-cli/commit/f876edb).

### 5. write_todos usage boundary

The tool should not trigger for simple single-step tasks. Only complex
multi-step tasks warrant it. Eval redesigned and submitted as
[PR #23418](https://github.com/google-gemini/gemini-cli/pull/23418).

---

## Open PRs Against Upstream

| PR                                                               | Description                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [#23415](https://github.com/google-gemini/gemini-cli/pull/23415) | Behavioral evals for web tool selection (google_web_search vs web_fetch) |
| [#23416](https://github.com/google-gemini/gemini-cli/pull/23416) | Behavioral evals for efficient tool selection (grep over read)           |
| [#23418](https://github.com/google-gemini/gemini-cli/pull/23418) | Behavioral eval for write_todos task planning                            |
| [#23193](https://github.com/google-gemini/gemini-cli/pull/23193) | Fix settings persistence bug                                             |
| [#23194](https://github.com/google-gemini/gemini-cli/pull/23194) | Filter redirect entries from policy sub-command checks                   |
| [#23196](https://github.com/google-gemini/gemini-cli/pull/23196) | Guard against empty parts in message inspectors                          |
| [#23014](https://github.com/google-gemini/gemini-cli/pull/23014) | Extend omission placeholder detector to # and /\* \*/ styles             |

---

## Contributor Artifacts

### eval-gap-finder skill

`.gemini/skills/eval-gap-finder/` — invokes `scripts/eval-coverage.mjs` and
surfaces tools with zero eval coverage. Smoke-tested against the live codebase.

### prompt-change-validator skill

`.gemini/skills/prompt-change-validator/` — guides contributors through targeted
eval re-runs after prompt or tool definition changes.

### chat-to-eval skill

`.gemini/skills/chat-to-eval/` — invokes `scripts/chat-to-eval.mjs` to scan
activity logs and generate ranked eval candidates.

### @eval-investigator subagent

`.gemini/agents/eval-investigator.md` — diagnoses failing evals by classifying
root cause into five categories (model regression, flawed assertion,
infrastructure, natural variance, broken setup) with cited evidence. Read-only
tools only.
